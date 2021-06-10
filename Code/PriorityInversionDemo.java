import java.util.Collections;
import java.util.LinkedList;
import java.util.Random;

public class PriorityInversionDemo {

    public PriorityInversionDemo() throws InterruptedException {
        Thread high;
        Thread medium;
        Thread low;
        Thread endless;

        high = new Thread(){
            @Override
            public void run() {
                System.out.println("High");
                try {
                    printData(this, "High");
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        };
        high.setPriority(10);
        high.setName("High Priority Printer");

        medium = new Thread(){
            @Override
            public void run() {
                System.out.println("Medium");

                Random r = new Random();
                LinkedList l = new LinkedList<Integer>();

                for (int i = 0; i < 10000000; i++) {
                    l.add(r.nextInt());
                }

                Collections.sort(l);

                System.out.println("Medium: done");
            }
        };
        medium.setPriority(5);
        medium.setName("Sorter");

        low = new Thread(){
            @Override
            public void run() {
                System.out.println("Low");
                try {
                    printData(this, "Low");
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        };
        low.setPriority(1);
        low.setName("Low Priority Printer");

        endless = new Thread(){
            @Override
            public void run(){
                System.out.println("Endless: start");
                Integer i = 0;
                synchronized(i) {
                    try {
                        i.wait();
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                    }
                    System.out.println("Endless: done");
                }
            }
        };
        endless.setName("Waiter");

        endless.start();
        low.start();
        Thread.sleep(500);
        medium.start();
        high.start();

        endless.join();
    }

    public static void main(String[] args) throws InterruptedException {
        new PriorityInversionDemo();
    }


    public synchronized void printData(Thread t, String name) throws InterruptedException {
        t.sleep(1000);
        System.out.println(name+": 1");
        t.sleep(1000);
        System.out.println(name+": 2");
        t.sleep(1000);
        System.out.println(name+": 3");
    }
}
