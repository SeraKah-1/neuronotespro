
import { SyllabusItem, GenerationConfig, AIProvider, HistoryItem } from '../types';
import { generateDetailedStructure, generateNoteContent } from './geminiService';
import { generateDetailedStructureGroq, generateNoteContentGroq } from './groqService';
import { StorageService } from './storageService';

type UpdateCallback = (items: SyllabusItem[], isProcessing: boolean, circuitStatus?: string) => void;

const MAX_RETRIES = 3;
const BASE_DELAY = 2000;
const CIRCUIT_THRESHOLD = 3; // Consecutive failures to trip circuit

export class QueueService {
  private static instance: QueueService;
  private queue: SyllabusItem[] = [];
  private config: GenerationConfig | null = null;
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  private listeners: UpdateCallback[] = [];
  private storage: StorageService;
  
  // Robustness State
  private consecutiveFailures: number = 0;
  private circuitOpen: boolean = false;

  private constructor() {
    this.storage = StorageService.getInstance();
    this.recoverState();
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  // --- RECOVERY LOGIC (CRITICAL FIX) ---
  private recoverState() {
      const savedQueue = localStorage.getItem('neuro_syllabus_queue');
      if (savedQueue) {
          try {
              const parsed: SyllabusItem[] = JSON.parse(savedQueue);
              // Sanitize: If items were "processing" when app closed, mark them as error/interrupted
              this.queue = parsed.map(item => {
                  if (['drafting_struct', 'generating_note'].includes(item.status)) {
                      return { 
                          ...item, 
                          status: 'error', 
                          errorMsg: 'Process interrupted (Page Reload/Crash). Retry needed.' 
                      };
                  }
                  return item;
              });
              this.persistQueue();
          } catch (e) {
              console.error("Queue recovery failed", e);
              this.queue = [];
          }
      }
  }

  public subscribe(callback: UpdateCallback) {
    this.listeners.push(callback);
    // Immediately emit current state upon subscription
    callback([...this.queue], this.isProcessing, this.circuitOpen ? "CIRCUIT BREAKER ACTIVE" : undefined);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notify() {
    const statusMsg = this.circuitOpen ? "CIRCUIT BREAKER ACTIVE (PAUSED)" : this.isProcessing ? "PROCESSING" : "IDLE";
    this.listeners.forEach(cb => cb([...this.queue], this.isProcessing, statusMsg));
  }

  public setQueue(items: SyllabusItem[]) {
    this.queue = items;
    this.notify();
    this.persistQueue();
  }

  public updateItemStructure(id: string, newStructure: string) {
    const idx = this.queue.findIndex(i => i.id === id);
    if (idx !== -1) {
      const updatedQueue = [...this.queue];
      updatedQueue[idx] = { 
        ...updatedQueue[idx], 
        structure: newStructure, 
        status: 'struct_ready',
        errorMsg: undefined // Clear error on manual update
      };
      this.queue = updatedQueue;
      this.notify();
      this.persistQueue();
    }
  }

  public stop() {
    this.shouldStop = true;
    this.isProcessing = false;
    this.notify();
  }

  public resetCircuit() {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
    this.notify();
  }

  public async startProcessing(config: GenerationConfig) {
    if (this.isProcessing || this.circuitOpen) return;
    
    this.config = config;
    this.isProcessing = true;
    this.shouldStop = false;
    this.notify();

    try {
      while (!this.shouldStop && !this.circuitOpen) {
        const nextItemIndex = this.queue.findIndex(
          item => 
             item.status === 'pending' || 
             item.status === 'error' ||
             (item.status === 'struct_ready' && (config.autoApprove || item.structure)) 
        );

        if (nextItemIndex === -1) break;

        await this.processItem(nextItemIndex);
        
        // Cooldown to prevent rate limit spikes
        await new Promise(r => setTimeout(r, 1000));
      }
    } finally {
      this.isProcessing = false;
      this.notify();
    }
  }

  private async processItem(index: number) {
    if (!this.config || this.shouldStop) return;

    let item = this.queue[index];

    // --- PHASE 1: BLUEPRINTING (Structure) ---
    if (item.status === 'pending' || item.status === 'error') {
        
        const structConfig = { ...this.config };
        const activeProvider = this.config.structureProvider || this.config.provider;

        const success = await this.executeWithRetry(index, async () => {
            this.updateItemStatus(index, 'drafting_struct');
            let structure = '';
            if (activeProvider === AIProvider.GEMINI) {
               structure = await generateDetailedStructure(structConfig, item.topic);
            } else {
               structure = await generateDetailedStructureGroq(structConfig, item.topic);
            }
            return structure;
        });

        if (success) {
            if (this.config.autoApprove) {
                this.updateItemStatus(index, 'struct_ready', { structure: success, retryCount: 0, errorMsg: undefined });
            } else {
                this.updateItemStatus(index, 'paused_for_review', { structure: success, retryCount: 0, errorMsg: undefined });
                return; 
            }
        } else {
            return; 
        }
    }

    item = this.queue[index];

    // --- PHASE 2: MANUFACTURING (Content) ---
    if (item.status === 'struct_ready' && item.structure) {
        
        const success = await this.executeWithRetry(index, async () => {
            this.updateItemStatus(index, 'generating_note');
            
            let content = '';
            const noOp = () => {}; 
            
            if (this.config!.provider === AIProvider.GEMINI) {
               content = await generateNoteContent(this.config!, item.topic, item.structure!, [], noOp);
            } else {
               content = await generateNoteContentGroq(this.config!, item.topic, item.structure!, noOp);
            }
            return content;
        });

        if (success) {
            const newNote: HistoryItem = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                topic: item.topic,
                mode: this.config.mode,
                content: success,
                provider: this.config.provider,
                parentId: null,
                tags: ['Auto-Curriculum']
            };
            this.storage.saveNoteLocal(newNote);
            if (this.config.storageType === 'supabase' && this.storage.isCloudReady()) {
                try { await this.storage.uploadNoteToCloud(newNote); newNote._status = 'synced'; } catch(e){}
            }

            this.updateItemStatus(index, 'done', { retryCount: 0, errorMsg: undefined });
        }
    }
  }

  // --- ROBUSTNESS ENGINE ---
  private async executeWithRetry<T>(index: number, operation: () => Promise<T>): Promise<T | null> {
      let attempts = 0;
      while (attempts < MAX_RETRIES && !this.shouldStop) {
          try {
              const result = await operation();
              this.consecutiveFailures = 0; 
              return result;
          } catch (e: any) {
              attempts++;
              console.warn(`Attempt ${attempts} failed for item ${index}:`, e);
              
              this.updateItemStatus(index, this.queue[index].status, { 
                  retryCount: attempts,
                  errorMsg: `Retry ${attempts}/${MAX_RETRIES}: ${e.message}` 
              });

              this.consecutiveFailures++;
              if (this.consecutiveFailures >= CIRCUIT_THRESHOLD) {
                  this.circuitOpen = true;
                  this.shouldStop = true;
                  this.updateItemStatus(index, 'error', { errorMsg: "Circuit Breaker Tripped. API Unstable." });
                  return null;
              }

              const delay = BASE_DELAY * Math.pow(2, attempts);
              await new Promise(r => setTimeout(r, delay));
          }
      }
      
      this.updateItemStatus(index, 'error', { errorMsg: "Max Retries Exceeded" });
      return null;
  }

  private updateItemStatus(index: number, status: SyllabusItem['status'], extra?: Partial<SyllabusItem>) {
    const newQueue = [...this.queue];
    newQueue[index] = { ...newQueue[index], status, ...extra };
    this.queue = newQueue;
    this.notify();
    this.persistQueue();
  }

  private persistQueue() {
      localStorage.setItem('neuro_syllabus_queue', JSON.stringify(this.queue));
  }
}
