# Priority Inversion

```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');

var threshold = argv[0];
if(threshold==null || threshold <= 0 || threshold > 100){
	print("Go to priority_inversion_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value as the first parameter.")
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

//sort the entries by number of inverts: highest to lowest
print("Sorting threads by number of inverts...");

invert_list.sort(function(a,b){return b.inverts.length/b.occurs - a.inverts.length/a.occurs});

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

if(regex!=""){
	applyGlobalFilter(regex);
	print("The filter was applied.");
}else{
	print("No threads were selected.");
}
```
