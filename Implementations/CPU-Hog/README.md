# CPU Hog
Using TraceCompass EASE scripting, we can learn more about a trace by looking at how long a process occupies a CPU. If a process occupies a CPU longer than it should and starves other processes, we can classify it as a CPU hog. The following code highlights bad smells of CPU hog by examining an execution trace on TraceCompass, and applying a global filter to highlight offending threads.<br />
<br />
First we need to get the necessary modules for the analysis. We need the Trace module to examine the trace events and the Filters module to apply the global filter.
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');
```

The *threshold* value is a user supplied value. It should be a number between 0 and 100. This value represents CPU usage as a percetage of the entire trace duration. If a thread occupies the CPU for longer than the threshold value, it will be highlighted. To set the variable, go to cpu_hog.js -> Run As... -> Run Configuration... -> Script arguments.
```javascript
var threshold = argv[0];
if(threshold==null || threshold > 100 || threshold < 0){
	print("Go to cpu_hog.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
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

Next, the code will parse through the events. We only need *sched_switch* events. The sequence of *sched_switch* events will be stored in the list *sched_switch_list*. This list is 2D, allowing us to sort between the different CPUs as well. While parsing, we also set the start and end times.
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

Now that we have located the proper events, we need to find the total time duration each thread spent on a CPU. We will create a new list called *duration_list*, which will contain list for each CPU in the trace.
```javascript
//this block calculates, for each CPU, the time from the 'i'th sched_switch event to the 'i+1'th and matches that time with the corresponding thread id
print("Calculating thread durations...");

var duration_list = [];
for(i=0; i<sched_switch_list.length; i++){
```

Next we have to set up some variables to keep track of everything. *new_list* will be the list for the current CPU being examined, *track_list* will help to keep track of thread locations in the *new_list* so that we don't have to search for them, *entry_num* will keep track of the last index location in *new_list*, and *prev* will keep track of the timestamp of the last event to be analyzed.
```javascript
	var new_list = [];
	var track_list = [];
	var entry_num = 0;
	var prev = start_time;
	
	for(j=0; j<=sched_switch_list[i].length; j++){
```

Here, we create a new object called *new_entry* to put in the list. It will have a thread id (*tid*) and a *duration*. Each object represents a unique thread on the CPU currently being examined. In the first *if* statement, we deal with the case where we have reached the end of the event list in order to record the last event. All other events are dealt with in the corresponding *else* statement. <br />
In either case, the thread may or may not already be in the *new_list*. If it is not, we add the new object to the list. If it is, we simply modify the existing object by adding on to the duration. <br />
For each CPU, we add the created *new_list* to the *duration_list* in order to have one big list of smaller lists for each CPU.
```javascript
		var new_entry;
	
		if(j==sched_switch_list[i].length){
			var new_tid = getEventFieldValue(sched_switch_list[i][j-1], "next_tid");
			
			if(track_list[new_tid]==null){
				new_entry = {
					tid: new_tid,
					duration: end_time - prev
				}
				new_list[entry_num] = new_entry;
				track_list[new_entry.tid] = entry_num;
				entry_num++;
				
			}else{
				new_list[track_list[new_tid]].duration = new_list[track_list[new_tid]].duration + (end_time - prev);
			}
			
		}else{
			var new_tid = getEventFieldValue(sched_switch_list[i][j], "prev_tid");
		
			if(track_list[new_tid]==null){
				new_entry = {
					tid: new_tid,
					duration: sched_switch_list[i][j].getTimestamp().toNanos() - prev
				}
				prev = sched_switch_list[i][j].getTimestamp().toNanos();
				new_list[entry_num] = new_entry;
				track_list[new_entry.tid] = entry_num;
				entry_num++;
				
			}else{
				new_list[track_list[new_tid]].duration = new_list[track_list[new_tid]].duration + (sched_switch_list[i][j].getTimestamp().toNanos() - prev);
				prev = sched_switch_list[i][j].getTimestamp().toNanos();
			}
		}
	}
	
	duration_list[i] = new_list;
}
```

We need to put the threads with the highest durations first in order to extract the threads that hog the most of the trace. To do this, we sort each smaller list in *duration_list* from biggest duration to smallest duration.
```javascript
//sort the entries by duration: highest to lowest
print("Sorting threads by total duration...");

for(i = 0; i < duration_list.length; i++){
	duration_list[i].sort(function(a,b){return b.duration - a.duration});
}
```

The global filter requires a regex to higlight the proper events. We create one in this step. Basically, we iterate through the sorted list, adding each thread id and CPU number to the regex until the threads no longer fit within the threshold or the list ends. We repeat for each CPU list. Also, when a thread fits the threshold criteria, we print out its TID and the percentage of the trace time that it occupies a CPU for.
```javascript
//this block adds a global filter
print("Creating filter...");

var regex = "";
for(i = 0; i < duration_list.length; i++){
	print("CPU " + i + " Hogs:");
	var j = 0;
	while(j<duration_list[i].length && duration_list[i][j].duration/(end_time-start_time) >= threshold){
		if(regex==""){
			regex = "(CPU==" + i + " && TID==" + duration_list[i][j].tid + ")";
		}else{
			regex = regex + " || (CPU==" + i + " && TID==" + duration_list[i][j].tid + ")";
		}
		print(duration_list[i][j].tid + ": " + (duration_list[i][j].duration/(end_time-start_time))*100 + "%");
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

The file *cpu_hog_marker.js* contains this code. I ran the script on a trace that I created. I used the CPU burner stress to spawn eight workersto spin on the CPU for 20 seconds as I created that trace. When using the cpu_hog_marker, I set the threshold to 10%. We can see the console output of the analysis in the following screenshot:
![Console output](Screenshots/05-15_Console.png?raw=true)
The first thing to notice is that for both CPU 0 and CPU 1, the biggest "hog" was actually the idle process that runs when nothing else is available to run. Both "hogged" the CPU for about 26% of the trace. This tells us that the CPUs were idle 26% of the duration of the trace. Next, we can see that four of the stress workers went to CPU 0, while the other four went to CPU 1. All eight of them hogged their respective CPU for a little over 18% of the trace. Here is a screenshot of the control flow view of the trace:
![Control flow](Screenshots/05-15_Control_Flow.png?raw=true)
In this screenshot, we can see that the offending threads have been higlighted by the script. The stress threads were indeed running for most of the trace, but were constantly interrupting each other. The idle process threads are offscreen for this screenshot.

