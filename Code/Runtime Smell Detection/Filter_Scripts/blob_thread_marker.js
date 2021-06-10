loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');

var threshold = argv[0];
if(threshold==null || threshold <= 0 || threshold > 100){
	print("Go to priority_inversion_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
	print("Make sure it is between 0 and 100.");
	exit();
}
threshold =  threshold/100;

//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}

//the start and end times for the trace
var start_time = -1;
var end_time = -1;

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
		
	}else if(event.getName() == "sched_process_exit"){
	
		var exit_tid = getEventFieldValue(event, "exit_tid");
		if(exit_tid==0) exit_tid = exit_tid + ":" + cpu_num;
		
		if(track_list[exit_tid]!=null){
			blob_list[track_list[child_tid]].end = event.getTimestamp();
		}
	}
}
end_time = event.getTimestamp().toNanos();
			
if(last_sched_switch != null){
	var new_tid = getEventFieldValue(last_sched_switch, "next_tid");
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
	
print("Finding eligible threads...");	
		
var eligible_list = [];

for(i=0; i<blob_list.length; i++){
	var parent = blob_list[i].parent;
	if(parent != null){
		if(blob_list[track_list[parent]].end = -1) blob_list[track_list[parent]].end = end_time;
		if(blob_list[track_list[parent]].end - blob_list[track_list[parent]].start != 0) eligible_list.push(blob_list[i]);
	}
}	
			
//sort the entries by duration of thread per duration of parent: highest to lowest
print("Sorting threads by duration of thread per duration of parent...");

eligible_list.sort(function(a,b){return b.duration/(blob_list[track_list[b.parent]].end - blob_list[track_list[b.parent]].start) - a.duration/(blob_list[track_list[a.parent]].end - blob_list[track_list[a.parent]].start)});

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

if(regex!=""){
	applyGlobalFilter(regex);
	print("The filter was applied.");
}else{
	print("No threads were selected.");
}		
			