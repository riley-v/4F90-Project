# Blob Thread
Using TraceCompass EASE scripting, we can learn more about a trace by looking at a thread's runtime compared with its parent's duration. We classify a thread as a blob thread if it contains most of its parent's implementation. 

## Results
The code can be found in "Code/Runtime Smell Detection". I ran the script on a trace I created while running a custom Java program. The program can be found [here](https://github.com/riley-v/runtime-bad-smell-trace-metrics/blob/main/Code/PriorityInversionDemo.java). Basicaly, it creates four threads:
* a thread at priority 29 which accesses a synchronized method first
* a thread at priority 20 which accesses the synchronized method second
* a thread at priority 25 which creates a list of one million integers and sorts them
* a thread at priority 20 which does nothing but sleep

I checked for blob threads using a threshold of 25% of the parent's duration. Here is a screenshot of the console output.

## Code Explanation
The following code highlights bad smells of blob thread by examining an execution trace on TraceCompass, and applying a global filter to highlight offending threads.

First we need to get the necessary modules for the analysis. We need the Trace module to examine the trace events and the Filters module to apply the global filter.
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');
```

The *threshold* value is a user supplied value. It should be a number between 0 and 100. This value represents a thread's CPU usage as a percentage of the duration of its parent. If a thread occupies the CPU for longer than the threshold value, it will be highlighted. To set the variable, go to blob_thread_marker.js -> Run As... -> Run Configuration... -> Script arguments.
```javascript
var threshold = argv[0];
if(threshold==null || threshold <= 0 || threshold > 100){
	print("Go to blob_thread_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
	print("Make sure it is between 0 and 100.");
	exit();
}
threshold =  threshold/100;
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

Next, we have to actually examine the events. We will keep relevant information for each thread in *blob_list*. *track_list* and *entry_num* will be used to keep track of each thread in *blob_list*. *prev* will be used to record the previous *sched_switch* time so that we can determine how long a thread spent on the CPU. When iterating throught the events, we will immediately determine the CPU that the event corresponds to.
```javascript
print("Finding durations and assigning children...");

var blob_list = [];
var track_list = [];
var entry_num = 0;
var last_sched_switch = null;
var prev = [];

var iter = getEventIterator(trace);
var event = null;

while (iter.hasNext()){
	event = iter.next();
	var cpu_num = getEventFieldValue(event,"CPU");
	
	if(start_time==-1) start_time = event.getTimestamp().toNanos();
	if(prev[cpu_num]==null) prev[cpu_num] = start_time;
```

Here, we record *sched_switch* events. Basically, we create a new entry for the thread if it is not yet in *blob_list*, and we update the duration that the thread spent on the CPU if it already is.
```javascript	
	if(event.getName() == "sched_switch"){
		last_sched_switch = event;
	
		var prev_tid = getEventFieldValue(event, "prev_tid");
		if(prev_tid==0) prev_tid = prev_tid + ":" + cpu_num;
		
		if(track_list[prev_tid]==null){
			new_entry = {
				tid: String(prev_tid).split(":")[0],
				cpu: String(prev_tid).split(":")[1],
				duration: event.getTimestamp().toNanos() - prev[cpu_num],
				start: prev[cpu_num],
				end: -1,
				parent: null
			}
			
			prev[cpu_num] = event.getTimestamp().toNanos();
			blob_list[entry_num] = new_entry;
			track_list[prev_tid] = entry_num;
			entry_num++;
		
		}else{
			blob_list[track_list[prev_tid]].duration = blob_list[track_list[prev_tid]].duration + (event.getTimestamp().toNanos() - prev[cpu_num]);
			prev[cpu_num] = event.getTimestamp().toNanos();
		}
```

We also need to handle *sched_process_fork* events. If the parent is not already in *blob_list*, we create an entry for it. We also create a new entry for the child thread, and set its parent to the parent id.
```javascript
	}else if(event.getName() == "sched_process_fork"){
	
		var parent_tid = getEventFieldValue(event, "parent_tid");
		if(parent_tid==0) parent_tid = parent_tid + ":" + cpu_num;
		
		if(track_list[parent_tid]==null){
			new_entry = {
				tid: String(parent_tid).split(":")[0],
				cpu: String(parent_tid).split(":")[1],
				duration: 0,
				start: event.getTimestamp(),
				end: -1,
				parent: null
			}
			
			blob_list[entry_num] = new_entry;
			track_list[parent_tid] = entry_num;
			entry_num++;
		}
		
		var child_tid = getEventFieldValue(event, "child_tid");
		if(child_tid==0) child_tid = child_tid + ":" + cpu_num;
		
		if(track_list[child_tid]==null){
			new_entry = {
				tid: String(child_tid).split(":")[0],
				cpu: String(child_tid).split(":")[1],
				duration: 0,
				start: event.getTimestamp().toNanos(),
				end: -1,
				parent: parent_tid
			}
			
			blob_list[entry_num] = new_entry;
			track_list[child_tid] = entry_num;
			entry_num++;
			
		}else{
			blob_list[track_list[child_tid]].parent = parent_tid
		}
```

Finally, we will handle *sched_process_exit* events. All we really need to do here is set the end value.
```javascript
	}else if(event.getName() == "sched_process_exit"){
	
		var exit_tid = getEventFieldValue(event, "exit_tid");
		if(exit_tid==0) exit_tid = exit_tid + ":" + cpu_num;
		
		if(track_list[exit_tid]!=null){
			blob_list[track_list[child_tid]].end = event.getTimestamp();
		}
	}
}
```

We may have missed the interval between the last *sched_switch* event and the end of the trace, so we handle it here (like previous *sched_switch* events).
```javascript
end_time = event.getTimestamp().toNanos();
			
if(last_sched_switch != null){
	if(prev[cpu_num]==null) prev[cpu_num] = start_time;

	var new_entry;
	var new_tid = getEventFieldValue(last_sched_switch, "next_tid");
	if(new_tid==0) new_tid = new_tid + ":" + cpu_num;
	
	if(track_list[new_tid]==null){
		new_entry = {
			tid: String(new_tid).split(":")[0],
			cpu: String(new_tid).split(":")[1],
			duration: end_time - prev[cpu_num],
			start: prev[cpu_num],
			end: -1,
			parent: null
		}
		blob_list[entry_num] = new_entry;
		track_list[new_tid] = entry_num;
		
	}else{
		blob_list[track_list[new_tid]].duration = blob_list[track_list[new_tid]].duration + (end_time - prev[cpu_num]);
	}
}
```

Now, we need to find threads eligible for the bad smell. This means the thread must have a parent with a duration greater than zero. For threads meeting these qualifications, we add them to *eligible_list*. We also set parent thread end times to the end of the trace if they were not yet set.
```javascript	
print("Finding eligible threads...");	
		
var eligible_list = [];

for(i=0; i<blob_list.length; i++){
	var parent = blob_list[i].parent;
	if(parent != null){
		if(blob_list[track_list[parent]].end = -1) blob_list[track_list[parent]].end = end_time;
		if(blob_list[track_list[parent]].end - blob_list[track_list[parent]].start != 0) eligible_list.push(blob_list[i]);
	}
}	
```

We need to put the threads with the highest blob threading first. To do this, we sort the *eligible_list* by each thread's duration on CPU / the duration of its parent, from highest to lowest.
```javascript
//sort the entries by duration of thread per duration of parent: highest to lowest
print("Sorting threads by duration of thread per duration of parent...");

eligible_list.sort(function(a,b){return b.duration/(blob_list[track_list[b.parent]].end - blob_list[track_list[b.parent]].start) - a.duration/(blob_list[track_list[a.parent]].end - blob_list[track_list[a.parent]].start)});
```

The global filter requires a regex to higlight the proper events. We create one in this step. Basically, we iterate through the sorted list, adding each thread id and CPU number to the regex until the threads no longer fit within the threshold or the list ends. Also, when a thread fits the threshold criteria, we print out its TID and the percentage of blob threading.
```javascript
//this block adds a global filter
print("Creating filter...");

var regex = "";
var i = 0;
print("Blob Threads:");
while(i<eligible_list.length && eligible_list[i].duration/(blob_list[track_list[eligible_list[i].parent]].end - blob_list[track_list[eligible_list[i].parent]].start) >= threshold){
	
	var percent = eligible_list[i].duration/(blob_list[track_list[eligible_list[i].parent]].end - blob_list[track_list[eligible_list[i].parent]].start)
	
	if(eligible_list[i].cpu==null){
		if(regex==""){
			regex = "TID==" + eligible_list[i].tid;
		}else{
			regex = regex + " || TID==" + eligible_list[i].tid;
		}
		print(eligible_list[i].tid + ": " + percent*100 + "% of its parent: " + eligible_list[i].parent);
	}else{
		if(regex==""){
			regex = "(TID==" + eligible_list[i].tid + " && CPU==" + eligible_list[i].cpu + ")";
		}else{
			regex = regex + " || (TID==" + eligible_list[i].tid + " && CPU==" + eligible_list[i].cpu + ")";
		}
		print(eligible_list[i].tid + "/" + eligible_list[i].cpu + ": " + percent*100 + "% of its parent: " + eligible_list[i].parent);
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
