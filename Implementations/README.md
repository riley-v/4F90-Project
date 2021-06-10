# Implemented Bad Smells

## Multithreading Smells
#### CPU Hog
[CPU hog](CPU-Hog/) refers to the bad smell where a thread occupies more time on the CPU then it should, resulting in the starvation of other processes.
<br />
#### Thread Swamp
[Thread swamp](Thread-Swamp) refers to the smell where many other processes swamp the CPU while a different thread is supposed to be occupying the CPU.
<br />
#### Priority Inversion
[Priority inversion](Priority-Inversion/) refers to the smell where a low priority thread occupies the CPU before a high priority thread when both were able to be run.
<br />
#### Endless Waiting
<br />
#### Blob Thread
