# CPU Swamp
Using TraceCompass EASE scripting, we can learn more about a trace by looking at how a thread occupies the CPU. If a thread is constantly being interrupted by other processes, so that it is being starved, we can say that the thread is being swamped. The following code highlights bad smells of CPU swamp by examining an execution trace on TraceCompass, and applying a global filter to highlight offending threads. <br />

First we need to get the necessary modules for the analysis. We need the Trace module to examine the trace events and the Filters module to apply the global filter.
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');
```

The *threshold* value is a user supplied value. It should be a number between 0 and 100. This value represents CPU usage as a percetage of the lifettime of a thread over the tracing period. If a thread occupies the CPU for longer than the threshold value, it will be highlighted. To set the variable, go to cpu_swamp.js -> Run As... -> Run Configuration... -> Script arguments.
```javascript
var threshold = argv[0];
if(threshold==null || threshold > 100 || threshold < 0){
	print("Go to cpu_swamp.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
	print("Make sure it is between 0 and 100.");
	exit();
}
threshold = threshold/100;
```

The *trace* variable is the trace to examine. The code will automatically examine the active trace. If no trace is active, a message will be displayed on the console informing the user.
```javascript
//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}
```

We will need to use the start and end times in various places throughout the program. The start time will be the timestamp of the first event, and the end time will be the timestamp of the last event.
```javascript
//the start and end times for the trace
var start_time = -1;
var end_time = -1;
```

Next, the code will parse through the events. We only need *sched_switch* events. The sequence of *sched_switch* events will be stored in the list *sched_switch_list*. This list is 2D, allowing us to sort between the differnt CPUs as well.
```javascript
//this block will create a list that will contain one list for each CPU of the "sched_switch" events
//it also sets the start and end times
print("Parsing events...");

var sched_switch_list = [];
var iter = getEventIterator(trace);
var event = null;
while (iter.hasNext()){
	event = iter.next();
	
	if(start_time==-1) start_time = event.getTimestamp().toNanos();
	
	var event_name = event.getName();
	var event_CPU = getEventFieldValue(event,"CPU")
	
	if(event_name=="sched_switch"){
		//create a new CPU list if this is the first event for that CPU
		if(sched_switch_list[event_CPU]==null){
			sched_switch_list[event_CPU] = [];
			sched_switch_list[event_CPU][0] = event;
			
		//otherwise add the event to the end of the existing CPU list
		}else{
			sched_switch_list[event_CPU][sched_switch_list[event_CPU].length] = event;
		}
	}
}
end_time = event.getTimestamp().toNanos();
```

We will make sure that the trace actually contains enough events. To do this, we make sure that the start and end times have been set and are not equal.
```javascript
//this block makes sure the trace contains the required data
if(start_time==-1 || start_time-end_time>=0){
	print("The active trace does not contain enough data to complete the analysis.");
	exit();
}
```

To be explained
```javascript
//this block calculates, for each CPU, the time from the 'i'th sched_switch event to the 'i+1'th and matches that time with the corresponding thread id
print("Calculating thread durations...");

var swamp_list = [];
for(i=0; i<sched_switch_list.length; i++){
	var new_list = [];
	var track_list = [];
	var last_active = [];
	var entry_num = 0;
	var prev = start_time;
	
	for(j=0; j<=sched_switch_list[i].length; j++){
		var new_entry;
	
		if(j==sched_switch_list[i].length){
			var new_tid = getEventFieldValue(sched_switch_list[i][j-1], "next_tid");
			
			if(track_list[new_tid]==null){
				new_entry = {
					tid: new_tid,
					start: prev,
					end: end_time,
					duration: end_time - prev,
					inactive: 0
				}
				new_list[entry_num] = new_entry;
				track_list[new_entry.tid] = entry_num;
				entry_num++;
				
			}else{
				new_list[track_list[new_tid]].end = end_time;
				new_list[track_list[new_tid]].duration = new_list[track_list[new_tid]].duration + (end_time - prev);
				if(last_active[new_tid] != -1) new_list[track_list[new_tid]].inactive = new_list[track_list[new_tid]].inactive + (prev - last_active[new_tid]);
			}
			
		}else{
			var new_tid = getEventFieldValue(sched_switch_list[i][j], "prev_tid");
		
			if(track_list[new_tid]==null){
				new_entry = {
					tid: new_tid,
					start: prev,
					end: sched_switch_list[i][j].getTimestamp().toNanos(),
					duration: sched_switch_list[i][j].getTimestamp().toNanos() - prev,
					inactive: 0
				}
				prev = sched_switch_list[i][j].getTimestamp().toNanos();
				if(getEventFieldValue(sched_switch_list[i][j], "prev_state") == "TASK_DEAD"){
					last_active[new_entry.tid] = new_entry.end;
				}else{
					last_active[new_entry.tid] = -1;
				}
				
				new_list[entry_num] = new_entry;
				track_list[new_entry.tid] = entry_num;
				entry_num++;
				
			}else{
				new_list[track_list[new_tid]].end = sched_switch_list[i][j].getTimestamp().toNanos();
				new_list[track_list[new_tid]].duration = new_list[track_list[new_tid]].duration + (sched_switch_list[i][j].getTimestamp().toNanos() - prev);
				if(last_active[new_tid] != -1) new_list[track_list[new_tid]].inactive = new_list[track_list[new_tid]].inactive + (prev - last_active[new_tid]);
				
				prev = sched_switch_list[i][j].getTimestamp().toNanos();
				if(getEventFieldValue(sched_switch_list[i][j], "prev_state") == "TASK_DEAD"){
					last_active[new_tid] = new_list[track_list[new_tid]].end;
				}else{
					last_active[new_tid] = -1;
				}
			}
		}
	}
	
	swamp_list[i] = new_list;
}
```

We need to put the threads with the highest amount of swamping first in order to extract the proper threads. To do this, we sort each smaller list in *swamp_list* from the smallest time duration on CPU per lifetime ratio to the largest time duration on CPU per lifetime ratio.
```javascript
//sort the entries by swamping percentage
print("Sorting threads by swamp percentage...");

for(i = 0; i < swamp_list.length; i++){
	swamp_list[i].sort(function(a,b){return (1 - b.duration/(b.end-b.start-b.inactive)) - (1 - a.duration/(a.end-a.start-a.inactive))});
}
```

The global filter requires a regex to higlight the proper events. We create one in this step. Basically, we iterate through the sorted list, adding each thread id and CPU number to the regex until the threads no longer fit within the threshold or the list ends. We repeat for each CPU list.
```javascript
//this block creates a global filter
print("Creating filter...");

var regex = "";
for(i = 0; i < swamp_list.length; i++){
	var j = 0;
	while(j<swamp_list[i].length && 1 - swamp_list[i][j].duration/(swamp_list[i][j].end-swamp_list[i][j].start-swamp_list[i][j].inactive) >= threshold){
		print(1 - swamp_list[i][j].duration/(swamp_list[i][j].end-swamp_list[i][j].start-swamp_list[i][j].inactive));
		if(regex==""){
			regex = "(CPU==" + i + " && TID==" + swamp_list[i][j].tid + ")";
		}else{
			regex = regex + " || (CPU==" + i + " && TID==" + swamp_list[i][j].tid + ")";
		}
		j++;
	}
}
```

Finally, we apply the global filter using the regex. If the regex is empty, we inform the user that no threads fit their criteria.
```javascript
if(regex!=""){
	print("The filter was applied.");
	applyGlobalFilter(regex);
}else{
	print("No threads were selected.");
}
```

The file *cpu_swamp_marker.js* contains this code. 
