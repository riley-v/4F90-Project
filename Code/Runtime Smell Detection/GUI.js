loadModule("/System/UI Builder");
loadModule("/System/UI");
loadModule("/System/Scripting");
loadModule("/System/Resources");

createView("Runtime Smell Detection");
setColumnCount(2);

createLabel("Runtime Smell to Detect:", "1/1 <x");
var select = createComboViewer(["Blob Thread", "CPU Hog", "Endless Waiting", "Multiple Starts", "Overthreading", "Priority Inversion", "Thread Swamp"], "2/1 o");
createLabel("Threshold:", "1/2 <x");
var text = createText("2/2 o");
createButton("Detect", executeScript, "1/3 <x");
createButton("Help", showHelp, "2/3 <x");

function executeScript(){
	clearConsole();
	showView("Console");

	var threshold = text.getText();
	
	switch(String(select.getSelection().getFirstElement())){
		case "Blob Thread":
			if(threshold==null || threshold > 100 || threshold <= 0) { 
				print("Invalid threshold entered.");
				exit();	
			}
			
			res = fork("workspace://Runtime Smell Detection/Filter_Scripts/blob_thread_marker.js", threshold);
			res.waitForResult();
			break;
			
		case "CPU Hog":
			if(threshold==null || threshold > 100 || threshold <= 0) { 
				print("Invalid threshold entered.");
				exit();	
			}
			
			res = fork("workspace://Runtime Smell Detection/Filter_Scripts/cpu_hog_marker.js", threshold);
			res.waitForResult();
			break;
			
		case "Endless Waiting":
			if(threshold==null || threshold <= 0) { 
				print("Invalid threshold entered.");
				exit();	
			}
			
			res = fork("workspace://Runtime Smell Detection/Filter_Scripts/endless_waiting_marker.js", threshold);
			res.waitForResult();
			break;
			
		case "Multiple Starts":
			if(threshold==null || threshold < 2) { 
				print("Invalid threshold entered.");
				exit();	
			}
			
			res = fork("workspace://Runtime Smell Detection/Filter_Scripts/multiple_start_marker.js", threshold);
			res.waitForResult();
			break;
			
		case "Overthreading":
			if(threshold==null || threshold > 100 || threshold <= 0) { 
				print("Invalid threshold entered.");
				exit();	
			}
			
			res = fork("workspace://Runtime Smell Detection/Filter_Scripts/overthreading_marker.js", threshold);
			res.waitForResult();
			break;
			
		case "Priority Inversion":
			if(threshold==null || threshold < 1) { 
				print("Invalid threshold entered.");
				exit();	
			}
			
			res = fork("workspace://Runtime Smell Detection/Filter_Scripts/priority_inversion_marker.js", threshold);
			res.waitForResult();
			break;
			
		case "Thread Swamp":
			if(threshold==null || threshold > 100 || threshold <= 0) { 
				print("Invalid threshold entered.");
				exit();	
			}
			
			res = fork("workspace://Runtime Smell Detection/Filter_Scripts/thread_swamp_marker.js", threshold);
			res.waitForResult();
			break;
			
		default:
			print("No runtime smell was selected.");
	}
}

function showHelp(){
	clearConsole();
	print(readFile("workspace://Runtime Smell Detection/help"));
	showView("Console");
}