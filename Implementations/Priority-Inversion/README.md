# Priority Inversion
Using TraceCompass EASE scripting, we can learn more about a trace by looking at the order in which thread's are scheduled and run. More specifically, we can search for instances of priority inversion, a phenomenon where a lower priority thread indirectly preempts a higher priority thread. The following code highlights smells od priority inversion by examining an execution trace on TraceCompass, and applying a global filter to highlight offending threads.In the future, I would like to be able to highlight exactly in the trace where the inversion happened.
<br />

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

to be explained
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
		
	if(event.getName() == "sched_waking"){
		var target_id = getEventFieldValue(event, "tid");
		if(target_id==0) target_id = target_id + ":" + getEventFieldValue(event, "CPU");
		
		if(is_waiting[target_id] != true) waiting_list.push({id: target_id, prio: getEventFieldValue(event, "prio")});
		is_waiting[target_id] = true;
	
	}else if(event.getName() == "sched_switch"){
		var new_id = getEventFieldValue(event, "next_tid");
		if(new_id==0) new_id = new_id + ":" + getEventFieldValue(event, "CPU");
		
		for(i = 0; i < waiting_list.length; i++){
			if(new_id==waiting_list[i].id) waiting_list.splice(i,1);
		}
		is_waiting[new_id] = false;
			
		if(track_list[new_id]==null){
			var new_entry = {
				tid: getEventFieldValue(event, "next_tid"),
				occurs: 1,
				inverts: []
			}
			if(checkInversion(waiting_list,getEventFieldValue(event, "next_prio"))) new_entry.inverts.push(event.getTimestamp());
			
			invert_list[entry_num] = new_entry;
			track_list[new_id] = entry_num;
			entry_num++;
			
		}else{
			invert_list[track_list[new_id]].occurs++;
			if(checkInversion(waiting_list,getEventFieldValue(event, "next_prio"))) invert_list[track_list[new_id]].inverts.push(event.getTimestamp());
		}
	}
}
```

This function receives a list and a number. If any of the priorities in the list exceed that of the given number, the function returns true. Otherwise, it returns false.
```javascript
function checkInversion(check_list, priority){
	check_list.sort(function(a,b){return b.prio - a.prio});
	var i;
	for(i = 0; i < check_list.length; i++){
		if(priority<check_list[i].prio){
			return true;
		}
	}
	return false;
}
```

Now, the threads in the *invert_list* must be sorted by the highest inverting percentage to the lowest. This is done to make the extraction of the offending threads quicker, as we do not have to parse the entire list.
```javascript
//sort the entries by number of inverts: highest to lowest
print("Sorting threads by number of inverts...");

invert_list.sort(function(a,b){return b.inverts.length/b.occurs - a.inverts.length/a.occurs});
```

The global filter requires a regex to higlight the proper events. We create one in this step. Basically, we iterate through the sorted list, adding each thread id to the regex until the threads no longer fit within the threshold or the list ends. When a thread fits the threshold criteria, we print out its thread id, the number of times it caused a priority inversion, and the total number of times that it occupied the CPU.
```javascript
//this block adds a global filter
print("Creating filter...");

var regex = "";
print("Inverting Threads:");
while(i<invert_list.length && invert_list[i].inverts.length/invert_list[i].occurs >= threshold){
	if(regex==""){
		regex = "TID==" + invert_list[i].tid;
	}else{
		regex = regex + " || TID==" + invert_list[i].tid;
	}
	print(invert_list[i].tid + ": " + invert_list[i].inverts.length + "/" + invert_list[i].occurs);
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

The file *priority_inversion_marker* contains this code.
