# Endless Waiting
Using TraceCompass EASE scripting, we can learn more about a trace by looking at how long a thread is waiting for. It is difficult to say whether a thread is waiting forever or just a very long time. We classify a thread as endlessly waiting if it is waiting longer than a user specified amount of time. The following code highlights bad smells of endless waiting by examining an execution trace on TraceCompass, and applying a global filter to highlight offending threads.<br />
<br />
First we need to get the necessary modules for the analysis. We need the Trace module to examine the trace events and the Filters module to apply the global filter.
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');
'''

The *threshold* value is a user supplied value. It should be a number above 0. This value represents the longest consecutive number of seconds a thread is waiting for. If a thread waits for longer than the threshold value, it will be highlighted. To set the variable, go to endless_waiting_marker.js -> Run As... -> Run Configuration... -> Script arguments. The threshold is multiplied by one million because TraceCompass measures time in nanoseconds.
'''javascript
var threshold = argv[0];
if(threshold==null || threshold <= 0){
	print("Go to endless_waiting_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
	print("Make sure it is more than 0.");
	exit();
}

threshold = threshold * 1000000000
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

Next we want to find the longest waits and store them in the variable *wait_list*. We will use *track_list* and *entry_num* to keep track of where they are in the list.
```javascript
print("Calculating wait durations...");

var wait_list = [];
var iter = getEventIterator(trace);
var event = null;

var track_list = [];
var entry_num = 0;
```

Now we iterate through the events of the trace. If we have a *sched_switch* event, we will add the "prev_" thread to the list, or update the list if the thread has already been added. If the "prev_" thread is blocked, we set its *start* value to the current time.
```javascript
while (iter.hasNext()){
	event = iter.next();
	var cpu_num = getEventFieldValue(event,"CPU");
	
	if(start_time==-1) start_time = event.getTimestamp().toNanos();
	
	if(event.getName()=="sched_switch"){
		last_sched_switch = event;
		var new_entry;

		var prev_tid = getEventFieldValue(event, "prev_tid");
		if(prev_tid==0) prev_tid = prev_tid + ":" + cpu_num;
	
		if(track_list[prev_tid]==null){
			new_entry = {
				tid: String(prev_tid).split(":")[0],
				cpu: String(prev_tid).split(":")[1],
				start: -1,
				longest_wait: 0
			}
			if(getEventFieldValue(event, "prev_state") == "TASK_INTERRUPTIBLE" || getEventFieldValue(event, "prev_state") == "TASK_UNINTERRUPTIBLE") new_entry.start = event.getTimestamp().toNanos();
			
			wait_list[entry_num] = new_entry;
			track_list[prev_tid] = entry_num;
			entry_num++;
			
		}else{
			if(getEventFieldValue(event, "prev_state") == "TASK_INTERRUPTIBLE" || getEventFieldValue(event, "prev_state") == "TASK_UNINTERRUPTIBLE"){
				wait_list[track_list[prev_tid]].start = event.getTimestamp().toNanos();
			}else{
				wait_list[track_list[prev_tid]].start = -1;
			}
		}
```

Next, we check if the "next_" thread was blocked while it was not scheduled, and update its *end* and *longest_wait* values accordingly.
```javascript		
		var next_tid = getEventFieldValue(event, "next_tid");
		if(next_tid==0) next_tid = next_tid + ":" + cpu_num;
		
		if(track_list[next_tid]!=null && wait_list[track_list[next_tid]].start!=-1){
			var current_wait = event.getTimestamp().toNanos() - wait_list[track_list[next_tid]].start;
			if(current_wait > wait_list[track_list[next_tid]].longest_wait) wait_list[track_list[next_tid]].longest_wait = current_wait;
		}
```

Finally, for any *sched_process_exit* event, we treat that thread the same as we would with the "next_" thread in *sched_switch*.
```javascript
	}else if(event.getName()=="sched_process_exit"){
	
		var exit_tid = getEventFieldValue(event, "tid");
		if(exit_tid==0) exit_tid = exit_tid + ":" + cpu_num;
		
		if(track_list[exit_tid]!=null && wait_list[track_list[exit_tid]].start!=-1){
			var current_wait = event.getTimestamp().toNanos() - wait_list[track_list[exit_tid]].start;
			if(current_wait > wait_list[track_list[exit_tid]].longest_wait) wait_list[track_list[exit_tid]].longest_wait = current_wait;
		}
	}
}
```

Once the events have been parsed, we set the end time and update any unfinished waiting periods to be cut off at the end of the trace. We update all *end* and *longest_wait* values accordingly.
```javascript
end_time = event.getTimestamp().toNanos();

print("Cutting off wait durations at end of trace...");

for(i=0; i<wait_list.length; i++){
	if(wait_list[i].start!=-1){
		var current_wait = end_time - wait_list[i].start;
		if(current_wait > wait_list[i].longest_wait) wait_list[i].longest_wait = current_wait;
	}
}
```

We need to have the threads with the longest waits first, so we sort the *waiting_list* by wait times.
```javascript
//sort the entries by longest wait
print("Sorting threads by longest wait duration...");

wait_list.sort(function(a,b){return b.longest_wait - a.longest_wait});
```

The global filter requires a regex to highlight the proper events. We create one in this step. Basically, we iterate through the sorted list, adding each thread id to the regex until the threads no longer fit within the threshold or the list ends. Also, when a thread fits the threshold criteria, we print out its TID and longest wait time.
```javascript
//this block creates a global filter
print("Creating filter...");

var regex = "";
var i = 0;
print("Longest Waits: ");
while(i<wait_list.length && wait_list[i].longest_wait >= threshold){

	if(wait_list[i].cpu==null){
		if(regex==""){
			regex = "TID==" + wait_list[i].tid;
		}else{
			regex = regex + " || TID==" + wait_list[i].tid;
		}
		print(wait_list[i].tid + ": " + wait_list[i].longest_wait/1000000000 + " second(s)");
	}else{
		if(regex==""){
			regex = "(TID==" + wait_list[i].tid + " && CPU==" + wait_list[i].cpu + ")";
		}else{
			regex = regex + " || (TID==" + wait_list[i].tid + " && CPU==" + wait_list[i].cpu + ")";
		}
		print(wait_list[i].tid + "/" + wait_list[i].cpu + ": " + wait_list[i].longest_wait/1000000000 + " second(s)");
	}
	
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

This code can be found in Code/Runtime Smell Detection.
