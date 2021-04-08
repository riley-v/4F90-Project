loadModule("/TraceCompass/Trace");
loadModule("/TraceCompass/Analysis");
loadModule("/TraceCompass/DataProvider");
loadModule("/TraceCompass/View");
loadModule('/TraceCompass/Utils');

var threshold = argv[0];
if(threshold==null || threshold > 100 || threshold < 0){
	print("Go to cpu_swamp.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
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

//set up the state system
var analysis = createScriptedAnalysis(trace, "cpu_swamp_view.js");
var ss = analysis.getStateSystem(false);

//the start and end times for the trace
var start_time = -1;
var end_time = -1;

//this block will create a list that will contain one list for each CPU of the "sched_switch" events
//it also sets the start and end times
print("Parsing events...");

var sched_switch_list = [];
var iter = getEventIterator(trace);
var event = null;
while (iter.hasNext()){
	event = iter.next();
	
	if(start_time==-1) start_time = event.getTimestamp().toNanos();
	
	var event_name = event.getName();
	var event_CPU = getEventFieldValue(event,"CPU")
	
	if(event_name=="sched_switch"){
		//create a new CPU list if this is the first event for that CPU
		if(sched_switch_list[event_CPU]==null){
			sched_switch_list[event_CPU] = [];
			sched_switch_list[event_CPU][0] = event;
			
		//otherwise add the event to the end of the existing CPU list
		}else{
			sched_switch_list[event_CPU][sched_switch_list[event_CPU].length] = event;
		}
	}
}
end_time = event.getTimestamp().toNanos();

//this block makes sure the trace contains the required data
if(start_time==-1 || start_time-end_time>=0){
	print("The active trace does not contain enough data to complete the analysis for the target thread.");
	exit();
}

//this block calculates, for each CPU, the time from the 'i'th sched_switch event to the 'i+1'th and matches that time with the corresponding thread id
print("Calculating segmented thread durations...");

var thread_list = [];
for(i=0; i<sched_switch_list.length; i++){
	var new_list = [];
	var entry_num = 0;
	var prev = start_time;
	
	for(j=0; j<=sched_switch_list[i].length; j++){
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

print("Calculating total durations of threads...");

var swamp_list = [];
for(i = 0; i < thread_list.length; i++){
	var new_list = [];
	var p = 0;
	
	for(j=0; j<thread_list[i].length; j++){
		var exists = false;
		for(k=0; k<new_list.length; k++){
			//if the thread is already in the new list, add the additional duration to the existing duration
			if(thread_list[i][j].tid == new_list[k].tid){
				new_list[k].end = thread_list[i][j].end
				new_list[k].duration = new_list[k].duration + (thread_list[i][j].end - thread_list[i][j].start);
				exists = true;
			}
		}
		
		//if the thread is not yet represented in the new list, add it
		if(!exists){
			var new_entry = {
				tid: thread_list[i][j].tid,
				name: thread_list[i][j].name,
				start: thread_list[i][j].start,
				end: thread_list[i][j].end,
				duration: thread_list[i][j].end - thread_list[i][j].start
			};
			new_list[p] = new_entry;
			p++;
		}	
	}
	
	swamp_list[i] = new_list;
}

//sort the entries by swamping percentage
print("Sorting threads by swamp percentage...");

var thread_to_swamp = [];
for(i = 0; i < swamp_list.length; i++){
	swamp_list[i].sort(function(a,b){return b.duration/(b.start-b.end) - a.duration/(a.start-a.end)});
	
	new_list = [];
	for(j = 0; j < swamp_list[i].length; j++){
		new_list[swamp_list[i][j].tid] = (swamp_list[i][j].duration/(swamp_list[i][j].end-swamp_list[i][j].start) < threshold)
	}
	thread_to_swamp[i] = new_list;
}

//this block saves the attributes to the state system
print("Creating state system...");

for(i = 0; i < thread_list.length; i++){

	quark = ss.getQuarkAbsoluteAndAdd("CPU "+i+" Overview", "total");
	for(j = 0; j < thread_list[i].length; j++){
		var name;
		if(thread_to_swamp[i][thread_list[i][j].tid]){
			name = "swamped thread";
		}else{
			name = "safe thread";
		}
		
		ss.modifyAttribute(thread_list[i][j].start, name, quark);
		if(j>=thread_list[i].length-1 || thread_list[i][j].end!=thread_list[i][j+1].start){
			ss.removeAttribute(thread_list[i][j].end, quark);
		}
	}
	
	var j = 0;
	while(j<swamp_list[i].length && thread_to_swamp[i][swamp_list[i][j].tid]){
		quark = ss.getQuarkAbsoluteAndAdd("CPU "+i+" Threads", j);
		for(k = 0; k < thread_list[i].length; k++){
			if(thread_list[i][k].tid==swamp_list[i][j].tid){
				ss.modifyAttribute(thread_list[i][k].start, "swamped thread", quark);
				ss.removeAttribute(thread_list[i][k].end, quark);
			}
		}
		j++;
	}
}

ss.closeHistory(end_time);

//this block sets up the time graph provider for the time graph view by creating an entries list from the state system
print("Creating time graph view...");

var entries = createListWrapper();
for(i = 0; i <swamp_list.length; i++){
	quarks = ss.getQuarks("CPU "+i+" Overview","*");
	
	quark = quarks.get("total");
	entry = createEntry("CPU "+i+" Overview", {'quark' : quark});
	entries.getList().add(entry);
	
	quarks = ss.getQuarks("CPU "+i+" Threads","*");
	
	for (j = 0; j < quarks.size()-1; j++) {
		quark = quarks.get(j);
		entry_ratio = (swamp_list[i][j].duration/(swamp_list[i][j].end-swamp_list[i][j].start)*100).toFixed(2);
		entry_name = swamp_list[i][j].tid + "->" + swamp_list[i][j].name + ": " + entry_ratio + "%";
		entry = createEntry(entry_name, {'quark' : quark});
		entries.getList().add(entry);
	}
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