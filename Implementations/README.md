# Implemented Bad Smells

## Multithreading Smells
#### CPU Hog
[CPU hog](CPU-Hog/) refers to the bad smell where a thread occupies more time on the CPU then it should, resulting in the starvation of other processes.
#### Thread Swamp
[Thread swamp](Thread-Swamp) refers to the smell where many other processes swamp the CPU while a different thread is supposed to be occupying the CPU.
#### Priority Inversion
[Priority inversion](Priority-Inversion/) refers to the smell where a low priority thread occupies the CPU before a high priority thread which is blocked.
#### Endless Waiting
[Endless Waiting](Endless-Waiting/) refers to the smell where a thread is put to sleep but is never woken up.
#### Blob Thread
[Blob thread](Blob-Thread/) refers to the smell where a child thread contains most of its parent's implementation.
