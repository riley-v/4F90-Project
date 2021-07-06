# Overthreading
## Results
## Code Explanation
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');

var threshold = argv[0];
if(threshold==null || threshold > 100 || threshold < 0){
	print("Go to overthreading_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
	print("Make sure it is between 0 and 100.");
	exit();
}
threshold = threshold/100;

//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}

//the start and end times for the trace
var start_time = -1;

//the main block of code for detection
print("Calculating thread durations and blocked periods...");

var thread_list = [];
var iter = getEventIterator(trace);
var event = null;

var track_list = [];
var entry_num = 0;

var parent_list = [];
var last_active = [];
var last_block = [];

var prev = [];

while (iter.hasNext()){
	event = iter.next();
	var cpu_num = getEventFieldValue(event,"CPU");
	
	if(start_time==-1) start_time = event.getTimestamp().toNanos();
	if(prev[cpu_num]==null) prev[cpu_num] = start_time;
	
	if(event.getName()=="sched_process_fork"){
		var new_entry;

		var new_tid = getEventFieldValue(event, "child_tid");
		if(new_tid==0) new_tid = new_tid + ":" + cpu_num;
		
		if(track_list[new_tid]==null){
			new_entry = {
				tid: String(new_tid).split(":")[0],
				cpu: String(new_tid).split(":")[1],
				start: event.getTimestamp().toNanos(),
				end: event.getTimestamp().toNanos(),
				blocked: 0,
				inactive: 0,
				running: false,
				parent: getEventFieldValue(event, "parent_tid")
			}
			
			if(parent_list[new_entry.parent]==null){
				parent_list[new_entry.parent] = [];
			}
			parent_list[new_entry.parent].push(new_tid);
			
			last_block[new_tid] = -1;
			last_active[new_tid] = new_entry.start;
			
			thread_list[entry_num] = new_entry;
			track_list[new_tid] = entry_num;
			entry_num++;
		}
		
	}else if(event.getName()=="sched_switch"){
		var update = false;
	
		var next_tid = getEventFieldValue(event, "next_tid");
		if(next_tid==0) next_tid = next_tid + ":" + cpu_num;
		
		if(track_list[next_tid]!=null){
			update = true;
			if(last_active[next_tid] == -1 && last_block[next_tid] != -1) thread_list[track_list[next_tid]].blocked += (prev[cpu_num] - last_block[next_tid]);
			last_block[next_tid] = -1;
			thread_list[track_list[next_tid]].running = true;
		}
	
		var new_tid = getEventFieldValue(event, "prev_tid");
		if(new_tid==0) new_tid = new_tid + ":" + cpu_num;
	
		if(track_list[new_tid]!=null){
			update = true;
		
			thread_list[track_list[new_tid]].end = event.getTimestamp().toNanos();
			if(last_active[new_tid] != -1) thread_list[track_list[new_tid]].inactive += (prev[cpu_num] - last_active[new_tid]);
			thread_list[track_list[new_tid]].running = false;
			
			if(getEventFieldValue(event, "prev_state") != "TASK_RUNNING"){
				last_active[new_tid] = event.getTimestamp().toNanos();
			}else{
				last_active[new_tid] = -1;
			}
		}
		
		if(update) updateEntries(event.getTimestamp().toNanos());
		prev[cpu_num] = event.getTimestamp().toNanos();
		
	} else if(event.getName()=="sched_process_exit"){
		var new_tid = getEventFieldValue(event, "tid");
		if(new_tid==0) new_tid = new_tid + ":" + cpu_num;
		
		last_active[new_tid] = event.getTimestamp().toNanos();
	}
}

function updateEntries(time){
	parent_list.forEach(function(value, index, array){
		if(containsContention(value)) {
			var i;
			for(i=0; i<value.length; i++){
				if(!thread_list[track_list[value[i]]].running && last_active[value[i]] == -1){
					if(last_block[value[i]] != -1) {
						thread_list[track_list[value[i]]].blocked += (time - last_block[value[i]]);
					}
					last_block[value[i]] = time;
				}
			}
		}else{
			var i;
			for(i=0; i<value.length; i++){
				if(last_active[-1] == -1 && last_block[value[i]] != -1) thread_list[track_list[value[i]]].blocked += (time - last_block[value[i]]);
				last_block[value[i]] = -1;
			}
		}
	});
}

function containsContention(arr){
	var i;
	for(i=0; i<arr.length; i++) if(thread_list[track_list[arr[i]]].running) return true;
	return false;
}


print("Sorting threads by percentage of sibling blocking...");

parent_list.forEach(function(value, index, array){
	value.sort(function(a,b){return thread_list[track_list[b]].blocked/(thread_list[track_list[b]].end-thread_list[track_list[b]].start-thread_list[track_list[b]].inactive) - thread_list[track_list[a]].blocked/(thread_list[track_list[a]].end-thread_list[track_list[a]].start-thread_list[track_list[a]].inactive)});
});

//this block creates a global filter
print("Creating filter...");

var regex = "";

parent_list.forEach(function(value, index, array){

	print("Threading of Parent: " + index);

	var i = 0;
	var total = 0;
	
	while(i<value.length){
		var percent = thread_list[track_list[value[i]]].blocked/(thread_list[track_list[value[i]]].end-thread_list[track_list[value[i]]].start-thread_list[track_list[value[i]]].inactive);
		
		if(percent >= threshold){
			if(thread_list[track_list[value[i]]].cpu==null){
				if(regex==""){
					regex = "TID==" + value[i];
				}else{
					regex = regex + " || TID==" + value[i];
				}
				print(value[i] + ": " + percent*100 + "%");
			}else{
				if(regex==""){
					regex = "(TID==" + value[i] + " && CPU==" + thread_list[track_list[value[i]]].cpu + ")";
				}else{
					regex = regex + " || (TID==" + value[i] + " && CPU==" + thread_list[track_list[value[i]]].cpu + ")";
				}
				print(value[i] + "/" + thread_list[track_list[value[i]]].cpu + ": " + percent*100 + "%");
			}
		}
		
		i++;
		total+=percent;
	}
	
	if(i<=0) i = 1;
	print("Average: " + (total/i)*100 + "%");
	print("");
});

if(regex!=""){
	applyGlobalFilter(regex);
	print("The filter was applied.");
}else{
	print("No threads were selected.");
}
```
