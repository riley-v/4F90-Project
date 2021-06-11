# Execution Tracing-Based Bad Smell Detection
This repository contains information relating to the project entitled Execution tracing-based bad smell detection.

## To Use
### Loading the Scripts on to TraceCompass
The code to use this project is located in the [Code](Code/) folder. Please import the folder "Runtime Smell Detection" into TraceCompass. This folder should be at the top level of the workspace (it should be the project folder). Next, right click on "GUI.js" and select "Run as EASE script". This will open the Runtime Smell Detection view and allow you to use the different filters.

### Generating a Trace
When creating a trace to use with the filters, **be sure** to include the tracepoints:
* *sched_switch*
* *sched_process_fork*
* *sched_process_exit*
If these tracepoints are not used, the filters may not work properly.

### Creating a Filter


## Implementation
To find the code used to create the filters and traces, see the [Code](Code/) folder.
<br />To view implementation for bad smells, see the [Implementations](Implementations/) folder.
<br />To view a list of TraceCompass resources, see the [TraceCompass Resources](TraceCompass-Resources/) folder.
## Research
To view summaries on relevant papers, see the [Papers](Papers/) folder.
<br />To view a list of potential bad smells, see the [Bad Smells](Bad-Smells/) folder.
