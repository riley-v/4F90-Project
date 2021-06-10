loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');

var threshold = argv[0];
if(threshold==null || threshold < 1){
	print("Go to priority_inversion_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value as the first parameter.")
	print("Make sure it is at least one.");
	exit();
}

//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}

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
	
	if(event.getName() == "sched_switch"){
		var new_id = getEventFieldValue(event, "next_tid");
		if(new_id==0) new_id = new_id + ":" + getEventFieldValue(event, "CPU");
		
		for(i = 0; i < waiting_list.length; i++){
			if(new_id==waiting_list[i].id) waiting_list.splice(i,1);
		}
		is_waiting[new_id] = false;
		
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
		
		var priority = getEventFieldValue(event, "next_prio");
		for(i = 0; i < waiting_list.length; i++){
			if(priority>waiting_list[i].prio){
				newEntry(waiting_list[i]);
			}
		}
	}
}

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

//sort the entries by number of inverts: highest to lowest
print("Sorting threads by number of inverts...");

invert_list.sort(function(a,b){return b.inverts - a.inverts});

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

if(regex!=""){
	applyGlobalFilter(regex);
	print("The filter was applied.");
}else{
	print("No threads were selected.");
}

