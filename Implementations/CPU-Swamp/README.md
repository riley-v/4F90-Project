# CPU Swamp
To do: <br />
update code to show which threads are swamping the target <br />
create appropriate trace to test on <br />
explain code on github <br />
explain example output in github

```javascript
loadModule("/TraceCompass/Trace");
loadModule("/TraceCompass/Analysis");
loadModule("/TraceCompass/DataProvider");
loadModule("/TraceCompass/View");
loadModule('/TraceCompass/Utils');

var target_id = argv[0];
if(target_id==null || target_id < 1){
	print("Go to cpu_swamp.js -> Run As... -> Run Configuration... -> Script arguments and enter the target thread's id as the first parameter.")
	print("Make sure it an integer 1 or greater.");
	exit();
}

//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}

//set up the state system
var analysis = createScriptedAnalysis(trace, "cpu_swamp_view.js");
var ss = analysis.getStateSystem(false);

//the start and end times for the trace
var start_time = -1;
var end_time = -1;
var cutoff = [];

//this block will create a list that will contain one list for each CPU of the "sched_switch" events
//it also sets the start and end times
print("Parsing events...");

var sched_switch_list = [];
var iter = getEventIterator(trace);
var event = null;
while (iter.hasNext()){
	event = iter.next();
	var event_name = event.getName();
	var event_CPU = getEventFieldValue(event,"CPU");
	
	if(event_name=="sched_switch"){
		if(start_time==-1){
			if(getEventFieldValue(event, "next_tid")==target_id) start_time = event.getTimestamp().toNanos();
			
		}else{
			//create a new CPU list if this is the first event for that CPU
			if(sched_switch_list[event_CPU]==null){
				sched_switch_list[event_CPU] = [];
				sched_switch_list[event_CPU][0] = event;
			
			//otherwise add the event to the end of the existing CPU list
			}else{
				sched_switch_list[event_CPU][sched_switch_list[event_CPU].length] = event;
			}
			
			if(getEventFieldValue(event, "prev_tid")==target_id){
				end_time = event.getTimestamp().toNanos();
				cutoff[event_CPU] = sched_switch_list[event_CPU].length;
			}
		}
		
	}
}

//this block makes sure the trace contains the required data
if(start_time==-1 || start_time-end_time>=0){
	print("The active trace does not contain enough data to complete the analysis for the target thread.");
	exit();
}

//this block calculates, for each CPU, the time from the 'i'th sched_switch event to the 'i+1'th and matches that time with the corresponding thread id
print("Calculating thread durations...");

var thread_list = [];
for(i=0; i<sched_switch_list.length; i++){
	var new_list = [];
	var entry_num = 0;
	var prev = start_time;
	
	for(j=0; j<=cutoff[i]; j++){
		var new_entry;
	
		if(j==sched_switch_list[i].length){
			new_entry = {
				tid: getEventFieldValue(sched_switch_list[i][j-1], "next_tid"),
				name: getEventFieldValue(sched_switch_list[i][j-1], "next_comm"),
				start: prev,
				end: end_time
			}
		}else{
			new_entry = {
				tid: getEventFieldValue(sched_switch_list[i][j], "prev_tid"),
				name: getEventFieldValue(sched_switch_list[i][j], "prev_comm"),
				start: prev,
				end: sched_switch_list[i][j].getTimestamp().toNanos()
			}
		}
		
		prev = new_entry.end;
		if(new_entry.tid!=0){
			new_list[entry_num] = new_entry;
			entry_num++;
		}
	}
	
	thread_list[i] = new_list;
}

print("Calculating target's percentage of time on CPU...");

var duration = [];
for(i=0; i<thread_list.length; i++){
	duration[i] = 0;
	
	for(j=0; j<thread_list[i].length; j++){
		if(thread_list[i][j].tid==target_id) duration[i] = duration[i] + (thread_list[i][j].end - thread_list[i][j].start);
	}
	
	duration[i] = (duration[i]/(end_time - start_time)*100).toFixed(2);
}

//this block saves the attributes to the state system
print("Creating state system...");

for(i = 0; i < thread_list.length; i++){

	quark = ss.getQuarkAbsoluteAndAdd("CPU "+i, "total");
	for(j = 0; j < thread_list[i].length; j++){
		var name;
		if(thread_list[i][j].tid == target_id){
			name = "targeted thread";
		}else{
			name = "swamping threads";
		}
		
		ss.modifyAttribute(thread_list[i][j].start, name, quark);
		if(j>=thread_list[i].length-1 || thread_list[i][j].end!=thread_list[i][j+1].start){
			ss.removeAttribute(thread_list[i][j].end, quark);
		}
	}
}

ss.closeHistory(end_time);

//this block sets up the time graph provider for the time graph view by creating an entries list from the state system
print("Creating time graph view...");

var entries = createListWrapper();
for(i = 0; i <thread_list.length; i++){
	quarks = ss.getQuarks("CPU "+i,"*");
	
	quark = quarks.get("total");
	entry = createEntry("CPU " + i + " utilization: " + duration[i] + "%", {'quark' : quark});
	entries.getList().add(entry);
}

//the function used to get the entries for the provider
function getEntries(parameters) {
	return entries.getList();
}

//create the time graph provider and view
provider = createScriptedTimeGraphProvider(analysis, getEntries, null, null);
if (provider != null) {
	openTimeGraphView(provider);
}

//Script finished.
print("Finished");
```
