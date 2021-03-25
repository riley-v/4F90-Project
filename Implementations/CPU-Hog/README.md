# CPU Hog
Using TraceCompass EASE scripting, we can learn more about a trace by looking at how long a process occupies a CPU. If a process occupies a CPU longer than it should and starves other processes, we can classify it as a CPU hog. The following code highlights bad smells of CPU hog by examining an execution trace on TraceCompass.<br />
<br />
First we need to set up all the proper variables. There are a number of modules we need to load for this project.<br />
```javascript
loadModule("/TraceCompass/Trace");
loadModule("/TraceCompass/Analysis");
loadModule("/TraceCompass/DataProvider");
loadModule("/TraceCompass/View");
loadModule('/TraceCompass/Utils');
```

The threshold value is a user supplied value. It should be a number between 0 and 100. This value represents CPU usage as a percetage of the entire trace duration. If a thread occupies the CPU for longer than the threshold value, it will be highlighted. To set the variable, go to cpu_hog.js -> Run As... -> Run Configuration... -> Script arguments. <br />
```javascript
var threshold = argv[0];
if(threshold==null || threshold > 100 || threshold < 0){
	print("Go to cpu_hog.js -> Run As... -> Run Configuration... -> Script arguments and enter your desired threshold value (%) as the first parameter.")
	print("Make sure it is between 0 and 100.");
	exit();
}
threshold = threshold/100;
```

The trace variable is the trace to examine. The code will automatically examine the active trace. If no trace is active, a message will be displayed on the console informing the user. <br />
```javascript
//get the active trace
var trace = getActiveTrace();
if(trace==null){
	print("No trace is active.");
	exit();
}
```

The analysis variable refers to the analysis that the code will be creating. The ss variable will be the state system that we will be saving data to. <br />
```javascript
//set up the state system
var analysis = createScriptedAnalysis(trace, "cpu_hog_view.js");
var ss = analysis.getStateSystem(false);
```

We will need to use the start and end times in various places throughout the program. The start time will be the timestamp of the first event, and the end time will be the timestamp of the last event. <br />
```javascript
//the start and end times for the trace
var start_time = -1;
var end_time = -1;
```

Next, the code will parse through the events. We only need *sched_switch* events. We will also need to sort by CPU. <br />
```javascript
//this block will create a list that will contain one list for each CPU of the "sched_switch" events
//it also sets the start and end times
print("Parsing events...");

var sched_switch_list = [];
var iter = getEventIterator(trace);
var event = null;
while (iter.hasNext()){
	event = iter.next();
	
	if(start_time==-1) start_time = event.getTimestamp().toNanos();
	
	var eventName = event.getName();
	var eventCPU = getEventFieldValue(event,"CPU")
	
	if(eventName=="sched_switch"){
		//create a new CPU list if this is the first event for that CPU
		if(sched_switch_list[eventCPU]==null){
			sched_switch_list[eventCPU] = [];
			sched_switch_list[eventCPU][0] = event;
			
		//otherwise add the event to the end of the existing CPU list
		}else{
			sched_switch_list[eventCPU][sched_switch_list[eventCPU].length] = event;
		}
	}
}
end_time = event.getTimestamp().toNanos();
```

After that, we will match the *sched_switch* events so we know the start time and end time that each thread spent on the CPU for each continuous period of time. <br />
```javascript
//this block calculates, for each CPU, the time from the 'i'th sched_switch event to the 'i+1'th and matches that time with the corresponding thread id
print("Calculating thread durations...");

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
```

Next, we will calculate the total time that each unique thread spent on the CPU and store it in a list. <br />
```javascript
//this block creates a new list that will hold the total duration on the CPU for each thread
print("Matching thread IDs...");

var duration_list = [];
for(i = 0; i < thread_list.length; i++){
	var new_list = [];
	var p = 0;
	
	for(j=0; j<thread_list[i].length; j++){
		var exists = false;
		for(k=0; k<new_list.length; k++){
			//if the thread is already in the new list, add the additional duration to the existing duration
			if(thread_list[i][j].tid == new_list[k].tid){
				new_list[k].duration = new_list[k].duration + (thread_list[i][j].end - thread_list[i][j].start);
				exists = true;
			}
		}
		
		//if the thread is not yet represented in the new list, add it
		if(!exists){
			var new_entry = {
				tid: thread_list[i][j].tid,
				name: thread_list[i][j].name,
				duration: thread_list[i][j].end - thread_list[i][j].start
			};
			new_list[p] = new_entry;
			p++;
		}	
	}
	
	duration_list[i] = new_list;
}
```
After that, we need to sort the duration_list by most time on CPU to least time. At this time, we will also map each item in the thread_list to the corresponding item in the duration_list. <br />

```javascript
//sort the entries by duration: highest to lowest
print("Sorting threads by total duration...");

var thread_to_duration = [];
for(i = 0; i < duration_list.length; i++){
	duration_list[i].sort(function(a,b){return b.duration - a.duration});
	//printCPU(i,duration_list[i]);
	
	new_list = [];
	for(j = 0; j < duration_list[i].length; j++){
		new_list[duration_list[i][j].tid] = (duration_list[i][j].duration/(end_time-start_time) > threshold)
	}
	thread_to_duration[i] = new_list;
}
```

After that, the state system needs to be created. We will filter out all threads that have a total CPU amount less than the threshold amount specified by the user. <br />
```javascript
//this block saves the attributes to the state system
print("Creating state system...");

for(i = 0; i < duration_list.length; i++){

	quark = ss.getQuarkAbsoluteAndAdd("CPU "+i+" Overview", "total");
	for(j = 0; j < thread_list[i].length; j++){
		var name;
		if(thread_to_duration[i][thread_list[i][j].tid]){
			name = "warning";
		}else{
			name = "safe";
		}
		
		ss.modifyAttribute(thread_list[i][j].start, name, quark);
		if(j>=thread_list[i].length-1 || thread_list[i][j].end!=thread_list[i][j+1].start){
			ss.removeAttribute(thread_list[i][j].end, quark);
		}
	}

	var j = 0;
	while(j<duration_list[i].length && duration_list[i][j].duration/(end_time-start_time) > threshold){
		quark = ss.getQuarkAbsoluteAndAdd("CPU "+i+" Threads", j);
		for(k = 0; k < thread_list[i].length; k++){
			if(thread_list[i][k].tid==duration_list[i][j].tid){
				ss.modifyAttribute(thread_list[i][k].start, "warning", quark);
				ss.removeAttribute(thread_list[i][k].end, quark);
			}
		}
		j++;
	}
}

ss.closeHistory(end_time);
```

Finally, we need to create the time graph view. First, the overview for a CPU will be displayed. After that, each thread with a total amount of CPU time over the threshold value will be displayed. This will happen for each CPU in the thread.
```javascript
//this block sets up the time graph provider for the time graph view by creating an entries list from the state system
print("Creating time graph view...");

var entries = createListWrapper();
for(i = 0; i <duration_list.length; i++){
	quarks = ss.getQuarks("CPU "+i+" Overview","*");
	
	quark = quarks.get("total");
	entry = createEntry("CPU "+i+" Overview", {'quark' : quark});
	entries.getList().add(entry);
	
	quarks = ss.getQuarks("CPU "+i+" Threads","*");
	
	for (j = 0; j < quarks.size()-1; j++) {
		quark = quarks.get(j);
		entry_ratio = duration_list[i][j].duration/(end_time-start_time)*100
		entry_ratio = entry_ratio.toFixed(2);
		entry_name = duration_list[i][j].tid + "->" + duration_list[i][j].name + ": " + entry_ratio + "%";
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
```

The file *cpu_hog.js* contains this code. Make sure to run the code using the Nashorn engine. You probably will encounter errors running it using Rhino engine, as that engine does not handle methods with multiple signatures well. The code will output a time graph view showing each highlighted thread in the trace. The following is an example of that output:<br />
![Example output](Screenshots/March-24-Output.png?raw=true)
This trace was created while running a Linux program called stress. This program is a CPU burner designed to push the CPU to a specified capacity. Using stress, I created eight worker threads to spin on a lock for 20 seconds. When running the cpu_hog.js code for this trace, I set the threshold to 3%. The CPU 0 Overview clearly highlights the area in the trace where stress was active. The threads below are organized in order of most time on the CPU to least time on the CPU.

