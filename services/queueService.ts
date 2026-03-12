
import { SyllabusItem, GenerationConfig, SavedQueue } from '../types';
import { db } from '../db';
import { aiWorker } from '../workerClient';

type UpdateCallback = (items: SyllabusItem[], isProcessing: boolean, circuitStatus?: string) => void;

export class QueueService {
  private static instance: QueueService;
  private currentQueueId: string | null = null;
  private isProcessing: boolean = false;
  private listeners: UpdateCallback[] = [];
  
  private constructor() {
    this.recoverState();
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  private async recoverState() {
    // Attempt to find the last active queue or create a default one
    const queues = await db.queues.toArray();
    if (queues.length > 0) {
      this.currentQueueId = queues[0].id;
      this.notify();
    }
  }

  public getCurrentQueueId(): string | null {
    return this.currentQueueId;
  }

  public subscribe(callback: UpdateCallback) {
    this.listeners.push(callback);
    this.notify();
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private async notify() {
    if (!this.currentQueueId) {
      this.listeners.forEach(cb => cb([], this.isProcessing, undefined));
      return;
    }
    const queue = await db.queues.get(this.currentQueueId);
    if (queue) {
      this.listeners.forEach(cb => cb(queue.items, this.isProcessing, undefined));
    }
  }

  public async setQueue(items: SyllabusItem[], queueId?: string) {
    if (!queueId) {
      queueId = Date.now().toString();
    }
    this.currentQueueId = queueId;
    const newQueue: SavedQueue = {
      id: queueId,
      name: 'Active Queue',
      timestamp: Date.now(),
      items: items
    };
    await db.queues.put(newQueue);
    this.notify();
  }

  public async updateItemStructure(id: string, newStructure: string) {
    if (!this.currentQueueId) return;
    const queue = await db.queues.get(this.currentQueueId);
    if (queue) {
      const idx = queue.items.findIndex(i => i.id === id);
      if (idx !== -1) {
        queue.items[idx] = { 
          ...queue.items[idx], 
          structure: newStructure, 
          status: 'struct_ready',
          errorMsg: undefined
        };
        await db.queues.put(queue);
        this.notify();
      }
    }
  }

  public async stop() {
    this.isProcessing = false;
    await aiWorker.stopQueue();
    this.notify();
  }

  public async resetCircuit() {
    await aiWorker.resetCircuit();
    this.notify();
  }

  public async startProcessing(config: GenerationConfig) {
    if (this.isProcessing || !this.currentQueueId) return;
    
    const executeLoop = async () => {
      this.isProcessing = true;
      this.notify();

      try {
        const pollInterval = setInterval(() => this.notify(), 1000);
        await aiWorker.startQueue(config, this.currentQueueId!);
        clearInterval(pollInterval);
      } finally {
        this.isProcessing = false;
        this.notify();
      }
    };

    // PHASE 1: WEB LOCKS CONCURRENCY CONTROL
    if (navigator.locks) {
      await navigator.locks.request('queue-execution-lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          console.warn("Queue execution lock already held by another tab.");
          return;
        }
        await executeLoop();
      });
    } else {
      // Fallback to localStorage mutex
      const LOCK_KEY = 'queue-execution-lock-mutex';
      const HEARTBEAT = 15000;
      
      const acquireLock = () => {
        const now = Date.now();
        const lockData = localStorage.getItem(LOCK_KEY);
        if (lockData) {
          const { timestamp } = JSON.parse(lockData);
          if (now - timestamp < HEARTBEAT) return false;
        }
        localStorage.setItem(LOCK_KEY, JSON.stringify({ timestamp: now }));
        return true;
      };

      if (acquireLock()) {
        const heartbeatInterval = setInterval(() => {
          localStorage.setItem(LOCK_KEY, JSON.stringify({ timestamp: Date.now() }));
        }, HEARTBEAT / 2);

        try {
          await executeLoop();
        } finally {
          clearInterval(heartbeatInterval);
          localStorage.removeItem(LOCK_KEY);
        }
      } else {
        console.warn("Queue execution lock (localStorage) already held.");
      }
    }
  }
}
