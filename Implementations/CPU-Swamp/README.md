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

Now, we have to parse the events of the trace. To do this, we will need to set up quite a few variables. We will store information for each thread in *swamp_list*. *iter* and *event* will be used to iterate through the trace. *track_list* will be a helper array to store the locations of threads in *swamp_list*. We will store the last timestamp that each thread was active in *last_active*, and the last *sched_switch* event will be stored in *last_sched_switch*. *entry_num* will contain the index of the last thread in *swamp_list* + 1. Finally, *prev* will contain the timestamp of the last *sched_switch* event for each CPU.
```javascript
//this block calculates, for each CPU, the time from the 'i'th sched_switch event to the 'i+1'th and matches that time with the corresponding thread id
print("Calculating thread durations...");

var swamp_list = [];
var iter = getEventIterator(trace);
var event = null;

var track_list = [];
var last_active = [];
var last_sched_switch = null;
var entry_num = 0;
var prev = [];
```

```javascript
while (iter.hasNext()){
	event = iter.next();
	var cpu_num = getEventFieldValue(event,"CPU");
	
	if(start_time==-1) start_time = event.getTimestamp().toNanos();
	if(prev[cpu_num]==null) prev[cpu_num] = start_time;
	
	if(event.getName()=="sched_switch"){
		last_sched_switch = event;
		var new_entry;

		var new_tid = getEventFieldValue(event, "prev_tid");
		if(new_tid==0) new_tid = new_tid + ":" + cpu_num;
	
		if(track_list[new_tid]==null){
			new_entry = {
				tid: getEventFieldValue(event, "prev_tid"),
				start: prev[cpu_num],
				end: event.getTimestamp().toNanos(),
				duration: event.getTimestamp().toNanos() - prev[cpu_num],
				inactive: 0
			}
			prev[cpu_num] = new_entry.end;
			if(getEventFieldValue(event, "prev_state") != "TASK_RUNNING"){
				last_active[new_tid] = new_entry.end;
			}else{
				last_active[new_tid] = -1;
			}
			
			swamp_list[entry_num] = new_entry;
			track_list[new_tid] = entry_num;
			entry_num++;
			
		}else{
			swamp_list[track_list[new_tid]].end = event.getTimestamp().toNanos();
			swamp_list[track_list[new_tid]].duration = swamp_list[track_list[new_tid]].duration + (event.getTimestamp().toNanos() - prev[cpu_num]);
			if(last_active[new_tid] != -1) swamp_list[track_list[new_tid]].inactive = swamp_list[track_list[new_tid]].inactive + (prev[cpu_num] - last_active[new_tid]);
			
			prev[cpu_num] = event.getTimestamp().toNanos();
			if(getEventFieldValue(event, "prev_state") != "TASK_RUNNING"){
				last_active[new_tid] = swamp_list[track_list[new_tid]].end;
			}else{
				last_active[new_tid] = -1;
			}
		}
	}
}
end_time = event.getTimestamp().toNanos();
```

```javascript
if(last_sched_switch!=null){
	var cpu_num = getEventFieldValue(last_sched_switch,"CPU");
	if(prev[cpu_num]==null) prev[cpu_num] = start_time;

	var new_entry;
	var new_tid = getEventFieldValue(last_sched_switch, "next_tid");
	if(new_tid==0) new_tid = new_tid + ":" + cpu_num;
	
	if(track_list[new_tid]==null){
		new_entry = {
			tid: getEventFieldValue(last_sched_switch, "next_tid"),
			start: prev[cpu_num],
			end: end_time,
			duration: end_time - prev[cpu_num],
			inactive: 0
		}
		swamp_list[entry_num] = new_entry;
		track_list[new_tid] = entry_num;
		
	}else{
		swamp_list[track_list[new_tid]].end = end_time;
		swamp_list[track_list[new_tid]].duration = swamp_list[track_list[new_tid]].duration + (end_time - prev[cpu_num]);
		if(last_active[new_tid] != -1) swamp_list[track_list[new_tid]].inactive = swamp_list[track_list[new_tid]].inactive + (prev[cpu_num] - last_active[new_tid]);
	}
}
```

We need to put the threads with the highest amount of swamping first in order to extract the proper threads. To do this, we sort *swamp_list* from the smallest time duration on CPU per lifetime ratio to the largest time duration on CPU per lifetime ratio.
```javascript
//sort the entries by swamping percentage
print("Sorting threads by swamp percentage...");

swamp_list.sort(function(a,b){return (1 - b.duration/(b.end-b.start-b.inactive)) - (1 - a.duration/(a.end-a.start-a.inactive))});
```

The global filter requires a regex to higlight the proper events. We create one in this step. Basically, we iterate through the sorted list, adding each thread id to the regex until the threads no longer fit within the threshold or the list ends.
```javascript
//this block creates a global filter
print("Creating filter...");

var regex = "";
var i = 0;
print("Swamped Threads: ");
while(i<swamp_list.length && 1 - swamp_list[i].duration/(swamp_list[i].end-swamp_list[i].start-swamp_list[i].inactive) >= threshold){
	if(regex==""){
		regex = "TID==" + swamp_list[i].tid;
	}else{
		regex = regex + " || TID==" + swamp_list[i].tid;
	}
	print(swamp_list[i].tid + ": " + (1 - swamp_list[i].duration/(swamp_list[i].end-swamp_list[i].start-swamp_list[i].inactive))*100 + "%");
	i++;
}
```

Finally, we apply the global filter using the regex. If the regex is empty, we inform the user that no threads fit their criteria.
```javascript
if(regex!=""){
	applyGlobalFilter(regex);
	print("The filter was applied.");
}else{
	print("No threads were selected.");
}
```

The file *cpu_swamp_marker.js* contains this code. 
