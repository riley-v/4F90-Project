# Execution Tracing-Based Bad Smell Detection
This repository contains information relating to the project entitled Execution tracing-based bad smell detection.

## To Use
### Loading the Scripts on to TraceCompass
The code to use this project is located in the [Code](Code/) folder. Please import the folder "Runtime Smell Detection" into TraceCompass. This folder should be at the top level of the workspace (it should be the project folder). Next, right click on "GUI.js" and select "Run as EASE script". This will open the Runtime Smell Detection view and allow you to use the different filters. ![Starting](Screenshots/Starting.png?raw=true)

### Generating a Trace
When creating a trace to use with the filters, **be sure** to include the tracepoints:
* *sched_switch*
* *sched_process_fork*
* *sched_process_exit*
<br />If these tracepoints are not used, the filters may not work properly.

### Creating a Filter
Before running any filter scripts, first make sure that you have an active trace loaded on TraceCompass. If there is no active trace, the scripts will output the following to the console: "No trace is active." <br />
Next, enter a threshold value in the field of the bad smell you want to filter for. The threshold for each is explained on the Runtime Smell Detection view interface. With the threshold entered, click detect. ![Interface](Screenshots/Interface.png?raw=true)
The screen will freeze as the script works. Once the script has finished, the console view will appear with output. If there were no threads that fit the threshold, the console will display: "No threads were selected." Otherwise, the thread ids of the threads that fit within the threshold will be displayed. Finally, on all open views displaying the active trace, you will see certain threads highlighted. Here, the Control Flow view is open. ![Results](Screenshots/Results.png?raw=true)
Please note that the filters do not stack. For example, you cannot filter for thread swamping and endless waiting at the same time.

## Implementation
To find the code used to create the filters and traces, see the [Code](Code/) folder.
<br />To view implementation for bad smells, see the [Implementations](Implementations/) folder.
<br />To view a list of TraceCompass resources, see the [TraceCompass Resources](TraceCompass-Resources/) folder.
## Research
To view summaries on relevant papers, see the [Papers](Papers/) folder.
<br />To view a list of potential bad smells, see the [Bad Smells](Bad-Smells/) folder.
