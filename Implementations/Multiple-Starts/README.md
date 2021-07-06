# Multiple Starts
## Results
## Code Explanation
```javascript
loadModule("/TraceCompass/Trace");
loadModule('/TraceCompass/Filters');

var threshold = argv[0];
threshold = 2;
if(threshold==null || threshold > 100 || threshold < 0){
	print("Go to multiple_start_marker.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value as the first parameter.")
	print("Make sure it is at least 2.");
	exit();
}

//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}

print("Finding fork calls...");

var start_list = [];
var iter = getEventIterator(trace);
var event = null;

var track_list = [];
var entry_num = 0;

while (iter.hasNext()){
	event = iter.next();
	var cpu_num = getEventFieldValue(event,"CPU");
	
	if(event.getName() == "sched_process_fork"){
	
		var child_id = getEventFieldValue(event, "child_tid");
		if(child_id==0) child_id = child_id + ":" + cpu_num;
	
		if(track_list[child_id]==null){
			new_entry = {
				tid: String(child_id).split(":")[0],
				cpu: String(child_id).split(":")[1],
				starts: 1
			}
			
			start_list[entry_num] = new_entry;
			track_list[child_id] = entry_num;
			entry_num++;
			
		}else{
			start_list[track_list[child_id]].starts+=1
		}
	}
}

print("Sorting threads by number of starts...");

start_list.sort(function(a,b){return b.starts - a.starts});

//this block creates a global filter
print("Creating filter...");

var regex = "";
var i = 0;
print("Multiple Starts:");
while(i<start_list.length && start_list[i].starts >= threshold){

	if(start_list[i].cpu==null){
		if(regex==""){
			regex = "TID==" + start_list[i].tid;
		}else{
			regex = regex + " || TID==" + start_list[i].tid;
		}
		print(start_list[i].tid + ": " + start_list[i].starts + " starts");
	}else{
		if(regex==""){
			regex = "(TID==" + start_list[i].tid + " && CPU==" + start_list[i].cpu + ")";
		}else{
			regex = regex + " || (TID==" + start_list[i].tid + " && CPU==" + start_list[i].cpu + ")";
		}
		print(start_list[i].tid + "/" + start_list[i].cpu + ": " + start_list[i].starts + " starts");
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
