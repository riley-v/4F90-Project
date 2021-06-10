loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');

var threshold = argv[0];
if(threshold==null || threshold > 100 || threshold < 0){
	print("Go to cpu_swamp_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
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
var end_time = -1;

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
				tid: String(new_tid).split(":")[0],
				cpu: String(new_tid).split(":")[1],
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

if(last_sched_switch!=null){
	var cpu_num = getEventFieldValue(last_sched_switch,"CPU");
	if(prev[cpu_num]==null) prev[cpu_num] = start_time;

	var new_entry;
	var new_tid = getEventFieldValue(last_sched_switch, "next_tid");
	if(new_tid==0) new_tid = new_tid + ":" + cpu_num;
	
	if(track_list[new_tid]==null){
		new_entry = {
			tid: String(new_tid).split(":")[0],
			cpu: String(new_tid).split(":")[1],
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

//sort the entries by swamping percentage
print("Sorting threads by swamp percentage...");

swamp_list.sort(function(a,b){return (1 - b.duration/(b.end-b.start-b.inactive)) - (1 - a.duration/(a.end-a.start-a.inactive))});

//this block creates a global filter
print("Creating filter...");

var regex = "";
var i = 0;
print("Swamped Threads: ");
while(i<swamp_list.length && 1 - swamp_list[i].duration/(swamp_list[i].end-swamp_list[i].start-swamp_list[i].inactive) >= threshold){

	if(swamp_list[i].cpu==null){
		if(regex==""){
			regex = "TID==" + swamp_list[i].tid;
		}else{
			regex = regex + " || TID==" + swamp_list[i].tid;
		}
		print(swamp_list[i].tid + ": " + (1 - swamp_list[i].duration/(swamp_list[i].end-swamp_list[i].start-swamp_list[i].inactive))*100 + "%");
	}else{
		if(regex==""){
			regex = "(TID==" + swamp_list[i].tid + " && CPU==" + swamp_list[i].cpu + ")";
		}else{
			regex = regex + " || (TID==" + swamp_list[i].tid + " && CPU==" + swamp_list[i].cpu + ")";
		}
		print(swamp_list[i].tid + "/" + swamp_list[i].cpu + ": " + (1 - swamp_list[i].duration/(swamp_list[i].end-swamp_list[i].start-swamp_list[i].inactive))*100 + "%");
	}
	
	i++;
}

if(regex!=""){
	applyGlobalFilter(regex);
	print("The filter was applied.");
}else{
	print("No threads were selected.");
}