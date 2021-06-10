loadModule("/System/UI Builder");
loadModule("/System/UI");
loadModule("/System/Scripting");

createView("Runtime Smell Detection");
setColumnCount(3);

createLabel("CPU Hog:", "1/1 <x");
createLabel("Threshold: ie. find threads that hog at least 'x'% of the trace.", "1/2 <x");
var txtHog = createText();
createButton("Detect", executeHog);
createSeparator(true, "1-3/3 o");

createLabel("Thread Swamp:", "1/4 <x");
createLabel("Threshold: ie. find threads that are at least 'x'% swamped.", "1/5 <x");
var txtSwamp = createText();
createButton("Detect", executeSwamp);
createSeparator(true, "1-3/6 o");

createLabel("Priority Inversion:", "1/7 <x");
createLabel("Threshold: ie. find threads that are priority inverted at least 'x' times.", "1/8 <x");
var txtInvert = createText();
createButton("Detect", executeInvert);
createSeparator(true, "1-3/9 o");

createLabel("Endless Waiting:", "1/10 <x");
createLabel("Threshold: ie. find threads that are waiting for at least 'x' seconds.", "1/11 <x");
var txtWait = createText();
createButton("Detect", executeWait);
createSeparator(true, "1-3/12 o");

createLabel("Blob Thread:", "1/13 <x");
createLabel("Threshold: ie. find threads whose duration is at least 'x'% of their parent's duration.", "1/14 <x");
var txtBlob = createText();
createButton("Detect", executeBlob);

function executeHog() {
	clearConsole();
	showView("Console");

	var threshold = txtHog.getText();
	if(threshold==null || threshold > 100 || threshold <= 0) exit();
	
	res = fork("workspace://Runtime Smell Detection/Filter_Scripts/cpu_hog_marker.js", threshold);
	res.waitForResult();
}

function executeSwamp() {
	clearConsole();
	showView("Console");

	var threshold = txtSwamp.getText();
	if(threshold==null || threshold > 100 || threshold <= 0) exit();
	
	res = fork("workspace://Runtime Smell Detection/Filter_Scripts/thread_swamp_marker.js", threshold);
	res.waitForResult();
}

function executeInvert() {
	clearConsole();
	showView("Console");

	var threshold = txtInvert.getText();
	if(threshold==null || threshold < 1) exit();
	
	res = fork("workspace://Runtime Smell Detection/Filter_Scripts/priority_inversion_marker.js", threshold);
	res.waitForResult();
}

function executeWait() {
	clearConsole();
	showView("Console");

	var threshold = txtWait.getText();
	if(threshold==null || threshold <= 0) exit();
	
	res = fork("workspace://Runtime Smell Detection/Filter_Scripts/endless_waiting_marker.js", threshold);
	res.waitForResult();
}

function executeBlob() {
	clearConsole();
	showView("Console");

	var threshold = txtBlob.getText();
	if(threshold==null || threshold > 100 || threshold <= 0) exit();
	
	res = fork("workspace://Runtime Smell Detection/Filter_Scripts/blob_thread_marker.js", threshold);
	res.waitForResult();
}
