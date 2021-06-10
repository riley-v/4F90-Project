# Endless Waiting

To be explained:
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');

var threshold = argv[0];
if(threshold==null || threshold <= 0){
	print("Go to endless_waiting_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
	print("Make sure it is more than 0.");
	exit();
}

threshold = threshold * 1000000000

//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}

//the start and end times for the trace
var start_time = -1;
var end_time = -1;

print("Calculating wait durations...");

var wait_list = [];
var iter = getEventIterator(trace);
var event = null;

var track_list = [];
var entry_num = 0;

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
		
		var next_tid = getEventFieldValue(event, "next_tid");
		if(next_tid==0) next_tid = next_tid + ":" + cpu_num;
		
		if(track_list[next_tid]!=null && wait_list[track_list[next_tid]].start!=-1){
			var current_wait = event.getTimestamp().toNanos() - wait_list[track_list[next_tid]].start;
			if(current_wait > wait_list[track_list[next_tid]].longest_wait) wait_list[track_list[next_tid]].longest_wait = current_wait;
		}
		
	}else if(event.getName()=="sched_process_exit"){
	
		var exit_tid = getEventFieldValue(event, "tid");
		if(exit_tid==0) exit_tid = exit_tid + ":" + cpu_num;
		
		if(track_list[exit_tid]!=null && wait_list[track_list[exit_tid]].start!=-1){
			var current_wait = event.getTimestamp().toNanos() - wait_list[track_list[exit_tid]].start;
			if(current_wait > wait_list[track_list[exit_tid]].longest_wait) wait_list[track_list[exit_tid]].longest_wait = current_wait;
		}
	}
}
end_time = event.getTimestamp().toNanos();

print("Cutting off wait durations at end of trace...");

for(i=0; i<wait_list.length; i++){
	if(wait_list[i].start!=-1){
		var current_wait = end_time - wait_list[i].start;
		if(current_wait > wait_list[i].longest_wait) wait_list[i].longest_wait = current_wait;
	}
}

//sort the entries by longest wait
print("Sorting threads by longest wait duration...");

wait_list.sort(function(a,b){return b.longest_wait - a.longest_wait});

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

if(regex!=""){
	applyGlobalFilter(regex);
	print("The filter was applied.");
}else{
	print("No threads were selected.");
}
```
