# Runtime Bad Smells

## What is a Bad Smell?
> “a surface indication that usually corresponds to a deeper problem in the system” (quoted from [here](https://petertsehsun.github.io/papers/DLFinder_icse2019.pdf))

In computer science, we can use the term *bad smell* to describe potentially problematic stuff, whether that be lines of code, logging statements, code design, etc. Note that when we talk about a bad smell, we are not talking about a problem. Rather, we are talking about a phenomenon associated with a problem. Look at the quote above. The bad smell is the indication of a problem, not the problem itself. 

Bad smells are useful because they serve as an easier way to spot problems that are difficult to pinpoint. One of the most popular uses of the concept of bad smells is to examine the quality of source code. For example, we could examine code for duplicate coding statements. While the program may work fine, the source code may be incredibly difficult to modify without introducing bugs. Duplicate coding statements make code difficult to change as we have to go and change each one of these blocks of code. Duplicate coding statements are an example of a bad smell; they aren't a problem, but the indicate that the system does have a modifcation problem.

When talking about runtime bad smells, we are refering to patterns in the execution of a computer system that indicate runtime issues within that system. In this project, we are focusing on patterns pointing to multithreading problems, such as deadlock or race conditions. Here are some characteristics of runtime bad smells:
* Kernel based: runtime smells are based on inner workings of the kernel as well as the execution of user level programs
* Error/bug related: runtime smells can be related to errors in the execution of the system as well as bad programming practices
* Complex system: runtime smells exist within a complex, ever changing system of competing and cooperating processes
* Dynamically analyzed: runtime smells are detected during the execution of the system

## Why Dynamic Analysis?
Bad smells are traditionally associated with static analysis. A static analysis examines the source code of a program. It is useful because it can be done alongside development of a program. Dynamic analysis, on the other hand, examines the execution of a program. For example, when we examine an Lttng trace of the Linux kernel on TraceCompass, we are conducting a dynamic analysis. However, the program must be in a runnable state to be dynamically analyzed. Additionally, in order to find bad smells with a dynamic analysis, those bad smells must be in the execution that we are examining. In this way, dynamic analysis cannot reliably detect all potential bad smells. So why are we using a dynamic analysis?

First of all, let's consider the scope of a static analysis. Because we are looking at the source code of a program, we are examining that program in total isolation. However, that program will not be used in isolation. It will be used *within a complex, ever changing system of competing and cooperating processes* (see the third characteristic of runtime bad smells above). If we want to see how the program will interact with the CPU, or the hard disk memory, we will need to look at the entire computer system. Dynamic analysis allows us to do that.

Secondly, staic analysis tends to have one major drawback. It has to rely on tools of abstraction like call graphs in order to detect certain types of bad smells. When we factor in multithreading, the amount of abstraction needed to conduct a static analysis is huge. There are endless possibilities of how a multithreaded program will execute. All of this abstraction leads to a large amount of false alarms: situations that could theoretically arise but in practice never will or are not actually problematic. With dynamic analysis, we know exactly what happened. Therefore, we can eliminate the false alarms resulting from abstraction.

Finally, there is an endless amount of information that can be obtained from a computer system. Using tracing, we can select just what we need by enabling the events that we want to record. This is a simple, easy way to reduce the information overload and find the bad smells.
