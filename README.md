# Execution Tracing-Based Bad Smell Detection
This project provides TraceCompass EASE scripts that highlight potentially problematic threads in TraceCompass views (example screenshot below). Threads are highlighted based on statistical metrics calculated using trace data (implementation details [here](Implementations/). Users must have TraceCompass installed on their computer, as well as the following add-ons:
* Trace Compass Scripting (Incubation)
* Trace Compass Scripting Javascript (Incubation)
* Trace Compass Filters (Incubation)

The project uses the concept of bad smells to define threads as potentially problematic. The following runtime bad smells can be highlighted: 
* CPU Hog
* Thread Swamping
* Priority Inversion
* Endless Waiting
* Blob Thread

Here is the TraceCompass Control Flow view with the CPU Hog filter applied.
![Results-Explained](Screenshots/Results-Explained.png?raw=true)

## To Use
### Loading the Scripts on to TraceCompass
The code to use this project is located in the [Code](Code/) folder. Please import the folder "Runtime Smell Detection" into TraceCompass. This folder should be at the top level of the workspace (it should be the project folder). Next, right click on "GUI.js" and select "Run as EASE script". This will open the Runtime Smell Detection view and allow you to use the different filters. 

![Starting](Screenshots/Starting.png?raw=true)

### Generating a Trace
When creating a trace to use with the filters, **be sure** to include the tracepoints:
* *sched_switch*
* *sched_process_fork*
* *sched_process_exit*

If these tracepoints are not used, the filters may not work properly.

### Creating a Filter
Before running any filter scripts, first make sure that you have an active trace loaded on TraceCompass. If there is no active trace, the scripts will output the following to the console: "No trace is active."

First, select the runtime smell you would like to detect from the dropdown list. Next, enter a threshold value. The threshold for each is explained when pressing the 'Help' button. With the threshold entered, click 'Detect'. 

![Interface](Screenshots/Interface.png?raw=true)

The screen will freeze as the script works. Once the script has finished, the console view will appear with output. If there were no threads that fit the threshold, the console will display: "No threads were selected." Otherwise, the thread ids of the threads that fit within the threshold will be displayed. Finally, on all open views displaying the active trace, you will see certain threads highlighted. Here, the Control Flow view is open and several threads are highlighted. 

![Results](Screenshots/Results.png?raw=true)

Please note that the filters do not stack. For example, you cannot filter for thread swamping and endless waiting at the same time.

## Implementation
To find the code used to create the filters and traces, see the [Code](Code/) folder.
<br />To view implementation for bad smells, see the [Implementations](Implementations/) folder.
<br />To view a list of TraceCompass resources, see the [TraceCompass Resources](TraceCompass-Resources/) folder.
## Research
To view summaries on relevant papers, see the [Papers](Papers/) folder.
<br />To view a list of potential bad smells, see the [Bad Smells](Bad-Smells/) folder.
