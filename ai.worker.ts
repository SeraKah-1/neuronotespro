import * as Comlink from 'comlink';
import { generateNoteContent, generateDetailedStructure, parseSyllabusToTopics, parseSyllabusFromText, refineNoteContent, generateChatResponse } from './services/geminiService';
import { generateNoteContentGroq, generateDetailedStructureGroq, parseSyllabusFromTextGroq, refineNoteContentGroq } from './services/groqService';
import { processGeneratedNote } from './utils/formatter';
import { GenerationConfig, UploadedFile, SyllabusItem, ChatMessage, NoteMode, AIProvider, HistoryItem } from './types';
import { db } from './db';
import { FileStorageService } from './services/fileStorageService';
import { StorageService } from './services/storageService';

const fileStorage = FileStorageService.getInstance();
const storage = StorageService.getInstance();

export class AIWorker {
  private isProcessingQueue = false;
  private shouldStopQueue = false;
  private circuitOpen = false;
  private consecutiveFailures = 0;
  private config: GenerationConfig | null = null;

  async generateNoteContent(config: GenerationConfig, topic: string, structure: string, files: UploadedFile[], contextNotes: { title: string, content: string }[], onProgress: (status: string) => void) {
    // Rehydrate files from OPFS
    const hydratedFiles = await Promise.all(files.map(async f => {
      const base64 = await fileStorage.getFileAsBase64(f.fileId);
      return { ...f, data: base64 };
    }));

    // Add context notes as virtual files
    contextNotes.forEach((note, idx) => {
      hydratedFiles.push({
        name: `CONTEXT_NOTE: ${note.title}.md`,
        mimeType: 'text/plain',
        data: btoa(note.content),
        fileId: `virtual_${idx}`,
        size: note.content.length,
        isTokenized: true
      });
    });

    if (config.provider === AIProvider.GEMINI) {
      return await generateNoteContent(config, topic, structure, hydratedFiles, onProgress);
    } else {
      return await generateNoteContentGroq(config, topic, structure, onProgress);
    }
  }

  async generateDetailedStructure(config: GenerationConfig, topic: string) {
    if (config.provider === AIProvider.GEMINI) {
      return await generateDetailedStructure(config, topic);
    } else {
      return await generateDetailedStructureGroq(config, topic);
    }
  }

  async parseSyllabusToTopics(config: GenerationConfig, file: UploadedFile) {
    const base64 = await fileStorage.getFileAsBase64(file.fileId);
    const hydratedFile = { ...file, data: base64 };
    return await parseSyllabusToTopics(config, hydratedFile);
  }

  async parseSyllabusFromText(config: GenerationConfig, rawText: string) {
    if (config.provider === AIProvider.GEMINI) {
      return await parseSyllabusFromText(config, rawText);
    } else {
      return await parseSyllabusFromTextGroq(config, rawText);
    }
  }

  async refineNoteContent(config: GenerationConfig, currentContent: string, instruction: string) {
    if (config.provider === AIProvider.GEMINI) {
      return await refineNoteContent(config, currentContent, instruction);
    } else {
      return await refineNoteContentGroq(config, currentContent, instruction);
    }
  }

  async generateChatResponse(config: GenerationConfig, history: ChatMessage[], currentNoteContent: string, userMessage: string) {
    return await generateChatResponse(config, history, currentNoteContent, userMessage);
  }

  // --- QUEUE PROCESSING ---
  async startQueue(config: GenerationConfig, queueId: string) {
    if (this.isProcessingQueue || this.circuitOpen) return;
    this.config = config;
    this.isProcessingQueue = true;
    this.shouldStopQueue = false;

    try {
      while (!this.shouldStopQueue && !this.circuitOpen) {
        const queue = await db.queues.get(queueId);
        if (!queue) break;

        const nextItemIndex = queue.items.findIndex(
          item => 
             item.status === 'pending' || 
             item.status === 'error' ||
             (item.status === 'struct_ready' && (config.autoApprove || item.structure)) 
        );

        if (nextItemIndex === -1) {
          this.isProcessingQueue = false;
          break;
        }

        await this.processQueueItem(queueId, nextItemIndex);
        await new Promise(r => setTimeout(r, 1000));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  stopQueue() {
    this.shouldStopQueue = true;
    this.isProcessingQueue = false;
  }

  resetCircuit() {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
  }

  private async processQueueItem(queueId: string, index: number) {
    if (!this.config || this.shouldStopQueue) return;

    const queue = await db.queues.get(queueId);
    if (!queue) return;
    let item = queue.items[index];

    // PHASE 1: BLUEPRINTING
    if (item.status === 'pending' || item.status === 'error') {
      const structConfig = { ...this.config };
      const activeProvider = this.config.structureProvider || this.config.provider;

      const success = await this.executeWithRetry(queueId, index, async () => {
        await this.updateItemStatus(queueId, index, 'drafting_struct');
        if (activeProvider === AIProvider.GEMINI) {
          return await generateDetailedStructure(structConfig, item.topic);
        } else {
          return await generateDetailedStructureGroq(structConfig, item.topic);
        }
      });

      if (success) {
        if (this.config.autoApprove) {
          await this.updateItemStatus(queueId, index, 'struct_ready', { structure: success, retryCount: 0, errorMsg: undefined });
        } else {
          await this.updateItemStatus(queueId, index, 'paused_for_review', { structure: success, retryCount: 0, errorMsg: undefined });
          return;
        }
      } else {
        return;
      }
    }

    const updatedQueue = await db.queues.get(queueId);
    if (!updatedQueue) return;
    item = updatedQueue.items[index];

    // PHASE 2: MANUFACTURING
    if (item.status === 'struct_ready' && item.structure) {
      const success = await this.executeWithRetry(queueId, index, async () => {
        await this.updateItemStatus(queueId, index, 'generating_note');
        if (this.config!.provider === AIProvider.GEMINI) {
          return await generateNoteContent(this.config!, item.topic, item.structure!, [], () => {});
        } else {
          return await generateNoteContentGroq(this.config!, item.topic, item.structure!, () => {});
        }
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
        await db.notes.put(newNote);
        
        if (this.config.storageType === 'supabase' && storage.isCloudReady()) {
          try { 
            await storage.uploadNoteToCloud(newNote); 
            newNote._status = 'synced'; 
            await db.notes.put(newNote);
          } catch(e){}
        }

        await this.updateItemStatus(queueId, index, 'done', { retryCount: 0, errorMsg: undefined });
      }
    }
  }

  private async executeWithRetry<T>(queueId: string, index: number, operation: () => Promise<T>): Promise<T | null> {
    let attempts = 0;
    const MAX_RETRIES = 3;
    const BASE_DELAY = 2000;
    const CIRCUIT_THRESHOLD = 3;

    while (attempts < MAX_RETRIES && !this.shouldStopQueue) {
      try {
        const result = await operation();
        this.consecutiveFailures = 0;
        return result;
      } catch (e: any) {
        attempts++;
        console.warn(`Attempt ${attempts} failed for item ${index}:`, e);
        
        const queue = await db.queues.get(queueId);
        if (queue) {
          await this.updateItemStatus(queueId, index, queue.items[index].status, { 
            retryCount: attempts,
            errorMsg: `Retry ${attempts}/${MAX_RETRIES}: ${e.message}` 
          });
        }

        this.consecutiveFailures++;
        if (this.consecutiveFailures >= CIRCUIT_THRESHOLD) {
          this.circuitOpen = true;
          this.shouldStopQueue = true;
          await this.updateItemStatus(queueId, index, 'error', { errorMsg: "Circuit Breaker Tripped. API Unstable." });
          return null;
        }

        const delay = BASE_DELAY * Math.pow(2, attempts);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    await this.updateItemStatus(queueId, index, 'error', { errorMsg: "Max Retries Exceeded" });
    return null;
  }

  private async updateItemStatus(queueId: string, index: number, status: SyllabusItem['status'], extra?: Partial<SyllabusItem>) {
    const queue = await db.queues.get(queueId);
    if (queue) {
      queue.items[index] = { ...queue.items[index], status, ...extra };
      await db.queues.put(queue);
    }
  }
}

Comlink.expose(new AIWorker());
