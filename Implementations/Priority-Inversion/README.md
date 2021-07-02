# Priority Inversion
Using TraceCompass EASE scripting, we can learn more about a trace by looking at the order in which threads are scheduled and run. More specifically, we can search for instances of priority inversion, a phenomenon where a lower priority thread indirectly preempts a higher priority thread. 

## Results
The code can be found in "Code/Runtime Smell Detection". I ran the script on a trace I created while running a custom Java program. The program can be found [here](https://github.com/riley-v/runtime-bad-smell-trace-metrics/blob/main/Code/PriorityInversionDemo.java). Basicaly, it creates four threads:
* a thread at priority 29 which accesses a synchronized method first
* a thread at priority 20 which accesses the synchronized method second
* a thread at priority 25 which creates a list of one million integers and sorts them
* a thread at priority 20 which does nothing but sleep

The system is running with Linux's completely fair scheduler, so most threads have priority 20. I set the threshold to 10000 inversions. We can see the console output in the following screenshot.

![Console](Screenshots/prio-console.png?raw=true)

Obviously, five threads were inverted a high number of times. It would be fair to say that a lot of these inversions came from the priority 25 thread mentioned above. This thread does a lot of work, and has a lower priority than most of the system. Lets look at the highlighted Control Flow View to find out more.

![Flow](Screenshots/prio-flow.png?raw=true)

Two of the threads that were inverted the most were the migration threads. It makes sense that these threads would be sleeping as they are waiting for migration jobs to finish. However, if we notice that CPU affinity is a problem, then the cause of it may be that the migration threads are getting preempted by lower priority threads. Another highly inverted thread is the systemd logging service. This is not too important for the actual execution of the program, so its nothing to worry about. Next, we see that rtkit-daemon, a helper process for threads needing real-time priveledges, is highly inverted. It makes sense for this thread to sleep as it interacts with other threads. If we see a latency in threads waiting for real-time priveledges, then priority inversion might be the cause. Finally, we can see that an irq thread has the most priority inversions. If we see that there is some latency with interupts,then priority inversion may be the problem.

## Code Explanation
The following code highlights smells of priority inversion by examining an execution trace on TraceCompass, and applying a global filter to highlight offending threads. 

First we need to get the necessary modules for the analysis. We need the Trace module to examine the trace events and the Filters module to apply the global filter.
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');
```

The threshold value is a user supplied value. It should be a number between 0 and 100. This value represents the number of times the thread caused an instance of priority inversion per the number of times the thread occupied a CPU. If a thread reaches the provided threshold, it will be highlighted. To set the variable, go to priority_inversion_marker.js -> Run As... -> Run Configuration... -> Script arguments.
```javascript
var threshold = argv[0];
if(threshold==null || threshold <= 0 || threshold > 100){
	print("Go to priority_inversion_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value as the first parameter.")
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

Next, we will iterate through the events to find inversions. The variables *iter* and *event* are used for the iteration. *invert_list* stores information for each thread in the trace, *track_list* stores the locations of each thread in *invert_list* for quicker analysis, and *entry_num* refers to last index in *invert_list* + 1. Finally, *waiting_list* stores the thread id and priority of every thread that is ready to be scheduled on the CPU, while *is_waiting* records whether or not a thread is currently in the *waiting_list* for quicker analysis.
```javascript
print("Finding inversions...");

var invert_list = [];
var track_list = [];
var entry_num = 0;
	
var waiting_list = [];
var is_waiting = [];

var iter = getEventIterator(trace);
var event = null;

while (iter.hasNext()){
	event = iter.next();	
```

If the event is a *sched_switch*, then we first remove the "next_" thread from the *waiting_list*.
```javascript	
	if(event.getName() == "sched_switch"){
		var new_id = getEventFieldValue(event, "next_tid");
		if(new_id==0) new_id = new_id + ":" + getEventFieldValue(event, "CPU");
		
		for(i = 0; i < waiting_list.length; i++){
			if(new_id==waiting_list[i].id) waiting_list.splice(i,1);
		}
		is_waiting[new_id] = false;
```

Next, if the "prev_" thread ended in a blocked state, then we add it to the *waiting_list*.
```javascript
		var target_id = getEventFieldValue(event, "prev_tid");
		if(target_id==0) target_id = target_id + ":" + getEventFieldValue(event, "CPU");
		
		if((getEventFieldValue(event, "prev_state")=="TASK_INTERRUPTIBLE" || getEventFieldValue(event, "prev_state")=="TASK_UNINTERRUPTIBLE") && is_waiting[target_id] != true) {
			waiting_list.push({
				id: target_id,
				tid: String(target_id).split(":")[0],
				cpu: String(target_id).split(":")[1],
				prio: getEventFieldValue(event, "prev_prio")
			});
			is_waiting[target_id] = true;
		}
```

Finally, we check the thread's priority against all those in the *waiting_list*. For any entry in *waiting_list* that has a priority more (in Linux, technically less) than the current thread, then we add it to the *priority_list*.
```javascript
		var priority = getEventFieldValue(event, "next_prio");
		for(i = 0; i < waiting_list.length; i++){
			if(priority>waiting_list[i].prio){
				newEntry(waiting_list[i]);
			}
		}
```

If the event was a *sched_process_exit*, then we remove the exiting thread from the *waiting_list* if it was in that list.
```javascript
	}else if(event.getName() == "sched_process_exit"){
		var new_id = getEventFieldValue(event, "tid");
		if(new_id==0) new_id = new_id + ":" + getEventFieldValue(event, "CPU");
		
		for(i = 0; i < waiting_list.length; i++){
			if(new_id==waiting_list[i].id) waiting_list.splice(i,1);
		}
		is_waiting[new_id] = false;
	}
}
```

This function adds a new entry to the *priority_list*.
```javascript
function newEntry(entry){
	if(track_list[entry.id]==null){
		var new_entry = {
			tid: entry.tid,
			cpu: entry.cpu,
			inverts: 1
		}
		
		invert_list[entry_num] = new_entry;
		track_list[entry.id] = entry_num;
		entry_num++;
		
	}else{
		invert_list[track_list[entry.id]].inverts++;
	}
}
```

Now, the threads in the *invert_list* must be sorted by the highest inverting percentage to the lowest. This is done to make the extraction of the offending threads quicker, as we do not have to parse the entire list.
```javascript
//sort the entries by number of inverts: highest to lowest
print("Sorting threads by number of inverts...");

invert_list.sort(function(a,b){return b.inverts - a.inverts});
```

The global filter requires a regex to higlight the proper events. We create one in this step. Basically, we iterate through the sorted list, adding each thread id to the regex until the threads no longer fit within the threshold or the list ends. When a thread fits the threshold criteria, we print out its thread id, the number of times it caused a priority inversion, and the total number of times that it occupied the CPU.
```javascript
//this block adds a global filter
print("Creating filter...");

var regex = "";
var i = 0;
print("Inverted Threads:");
while(i<invert_list.length && invert_list[i].inverts >= threshold){
	
	if(invert_list[i].cpu==null){
		if(regex==""){
			regex = "TID==" + invert_list[i].tid;
		}else{
			regex = regex + " || TID==" + invert_list[i].tid;
		}
		print(invert_list[i].tid + ": " + invert_list[i].inverts + " invert(s)");
	}else{
		if(regex==""){
			regex = "(TID==" + invert_list[i].tid + " && CPU==" + invert_list[i].cpu + ")";
		}else{
			regex = regex + " || (TID==" + invert_list[i].tid + " && CPU==" + invert_list[i].cpu + ")";
		}
		print(invert_list[i].tid + "/" + invert_list[i].cpu + ": " + invert_list[i].inverts + " invert(s)");
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

