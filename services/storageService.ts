
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryItem, Folder, SavedPrompt, SavedQueue, KnowledgeSource, KnowledgeFile, LibraryMaterial } from '../types';
import { db } from '../db';
import { FileStorageService } from './fileStorageService';

export class StorageService {
  private static instance: StorageService;
  private supabase: SupabaseClient | null = null;
  private fileStorage: FileStorageService;
  
  private constructor() {
    this.fileStorage = FileStorageService.getInstance();
    if (typeof window !== 'undefined') {
      this.migrateFromLocalStorage().catch(err => console.error("Migration failed", err));
    }
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async migrateFromLocalStorage() {
    if (typeof window === 'undefined') return;
    const migrated = localStorage.getItem('neuro_migrated_to_dexie');
    if (migrated) return;

    try {
      // Migrate Notes
      const notesMetaStr = localStorage.getItem('neuro_notes');
      if (notesMetaStr) {
        const notesMeta: HistoryItem[] = JSON.parse(notesMetaStr);
        for (const meta of notesMeta) {
          // Try to get content from IDB
          const content = await new Promise<string>((resolve) => {
            const request = indexedDB.open('NeuroNoteDB', 1);
            request.onsuccess = (e: any) => {
              const idb = e.target.result;
              if (!idb.objectStoreNames.contains('note_content')) {
                resolve('');
                return;
              }
              const tx = idb.transaction('note_content', 'readonly');
              const store = tx.objectStore('note_content');
              const req = store.get(meta.id);
              req.onsuccess = () => resolve(req.result || '');
              req.onerror = () => resolve('');
            };
            request.onerror = () => resolve('');
          });
          
          await db.notes.put({ ...meta, content });
        }
      }

      // Migrate Folders
      const foldersStr = localStorage.getItem('neuro_folders');
      if (foldersStr) {
        const folders: Folder[] = JSON.parse(foldersStr);
        await db.folders.bulkPut(folders);
      }

      // Migrate Templates
      const templatesStr = localStorage.getItem('neuro_templates');
      if (templatesStr) {
        const templates: SavedPrompt[] = JSON.parse(templatesStr);
        await db.templates.bulkPut(templates);
      }

      // Migrate Queues
      const queuesStr = localStorage.getItem('neuro_saved_queues');
      if (queuesStr) {
        const queues: SavedQueue[] = JSON.parse(queuesStr);
        await db.queues.bulkPut(queues);
      }

      // Migrate KB Sources
      const kbSourcesStr = localStorage.getItem('neuro_kb_sources');
      if (kbSourcesStr) {
        const sources: KnowledgeSource[] = JSON.parse(kbSourcesStr);
        await db.kbSources.bulkPut(sources);
        for (const source of sources) {
          const filesStr = localStorage.getItem(`neuro_kb_files_${source.id}`);
          if (filesStr) {
            const files: KnowledgeFile[] = JSON.parse(filesStr);
            await db.kbFiles.bulkPut(files);
            localStorage.removeItem(`neuro_kb_files_${source.id}`);
          }
        }
      }

      // Clear localStorage
      localStorage.removeItem('neuro_notes');
      localStorage.removeItem('neuro_folders');
      localStorage.removeItem('neuro_templates');
      localStorage.removeItem('neuro_saved_queues');
      localStorage.removeItem('neuro_kb_sources');
      localStorage.setItem('neuro_migrated_to_dexie', 'true');
    } catch (e) {
      console.error("Migration error", e);
    }
  }

  public initSupabase(url: string, key: string) {
    if (url && key) {
      try {
        this.supabase = createClient(url, key);
      } catch (e) {
        console.error("Supabase Init Error", e);
      }
    }
  }

  public isCloudReady(): boolean {
    return !!this.supabase;
  }

  // --- NOTES ---
  public async getLocalNotesMetadata(): Promise<HistoryItem[]> {
    return await db.notes.filter(n => !n._deleted).toArray();
  }

  public async getNoteContent(id: string): Promise<string> {
    const note = await db.notes.get(id);
    if (!note || note._deleted) return "";
    return note.content || "";
  }

  public async getUnifiedNotes(): Promise<HistoryItem[]> {
    return await db.notes.filter(n => !n._deleted).toArray();
  }
  
  public async getBatchContent(ids: string[]): Promise<Record<string, string>> {
      const results: Record<string, string> = {};
      
      const notes = await db.notes.where('id').anyOf(ids).toArray();
      for (const note of notes) {
          if (note.content) results[note.id] = note.content;
      }

      const missingIds = ids.filter(id => !results[id]);
      if (missingIds.length > 0 && this.supabase) {
          const { data } = await this.supabase
              .from('neuro_notes')
              .select('id, content')
              .in('id', missingIds);
          
          if (data) {
              data.forEach((row: any) => {
                  results[row.id] = row.content;
              });
          }
      }
      return results;
  }

  public async saveNoteLocal(note: HistoryItem) {
    await db.notes.put(note);
  }

  public async deleteNoteLocal(id: string) {
    const note = await db.notes.get(id);
    if (note) {
      note._deleted = true;
      note.timestamp = Date.now();
      note._status = 'local';
      await db.notes.put(note);
    }
  }
  
  public async renameNote(id: string, newTopic: string) {
      const note = await db.notes.get(id);
      if (note) {
          note.topic = newTopic;
          await db.notes.put(note);
      }

      if (note && (note._status === 'synced' || note._status === 'cloud') && this.supabase) {
          const { error } = await this.supabase
              .from('neuro_notes')
              .update({ topic: newTopic })
              .eq('id', id);
          
          if (error) console.error("Cloud Rename Failed", error);
      }
  }

  // --- CLOUD SYNC ---
  public async uploadNoteToCloud(note: HistoryItem) {
      if (!this.supabase) throw new Error("Supabase not connected. Please check Settings.");
      
      let fullContent = note.content;
      if (!fullContent || fullContent.length === 0) {
          fullContent = await this.getNoteContent(note.id);
      }

      const sqlPayload = {
          id: note.id,
          timestamp: note.timestamp,
          topic: note.topic,
          mode: note.mode,
          content: fullContent,
          provider: note.provider,
          folder_id: note.folderId || null,
          parent_id: note.parentId || null,
          tags: note.tags && note.tags.length > 0 ? note.tags : [],
          _deleted: note._deleted || false
      };

      const { data, error } = await this.supabase
        .from('neuro_notes')
        .upsert(sqlPayload, { onConflict: 'id' })
        .select();

      if (error) {
          console.error("Supabase Upload Error:", error);
          throw new Error(`Cloud sync failed: ${error.message}`);
      }
      
      const localNote = await db.notes.get(note.id);
      if (localNote) {
          localNote._status = 'synced';
          await db.notes.put(localNote);
      }
      return data;
  }
  
  public async importCloudNote(noteMeta: HistoryItem): Promise<void> {
      if (!this.supabase) throw new Error("Supabase not connected.");

      let fullContent = noteMeta.content;

      if (!fullContent) {
          const { data, error } = await this.supabase
              .from('neuro_notes')
              .select('content')
              .eq('id', noteMeta.id)
              .single();
          
          if (error || !data) throw new Error("Failed to fetch cloud content.");
          fullContent = data.content;
      }

      const fullNote: HistoryItem = { 
          ...noteMeta, 
          content: fullContent, 
          _status: 'synced' 
      };
      
      await this.saveNoteLocal(fullNote);
  }

  public async deleteNoteFromCloud(id: string) {
      if (!this.supabase) return;
      const { error } = await this.supabase.from('neuro_notes').delete().eq('id', id);
      if (error) throw new Error(`Cloud delete failed: ${error.message}`);
  }

  // --- FOLDERS ---
  public async getFolders(): Promise<Folder[]> {
    return await db.folders.toArray();
  }

  public async saveFolder(folder: Folder) {
    await db.folders.put(folder);
  }

  public async deleteFolder(id: string) {
    await db.folders.delete(id);
    
    const notes = await db.notes.where('folderId').equals(id).toArray();
    for (const note of notes) {
        note.folderId = undefined;
        await db.notes.put(note);
    }
  }

  public async moveNoteToFolder(noteId: string, folderId: string | null) {
      const note = await db.notes.get(noteId);
      if (note) {
          note.folderId = folderId === 'ROOT' ? undefined : (folderId || undefined);
          await db.notes.put(note);
      }
  }

  // --- TEMPLATES ---
  public async getTemplates(): Promise<SavedPrompt[]> {
      return await db.templates.toArray();
  }

  public async saveTemplate(template: SavedPrompt) {
      await db.templates.put(template);
  }

  public async deleteTemplate(id: string) {
      await db.templates.delete(id);
  }

  // --- QUEUES ---
  public async getQueues(): Promise<SavedQueue[]> {
     return await db.queues.toArray();
  }

  public async saveQueue(queue: SavedQueue) {
      await db.queues.put(queue);
  }

  public async deleteQueue(id: string) {
      await db.queues.delete(id);
  }

  // --- KNOWLEDGE BASE ---
  public async getKnowledgeSources(): Promise<KnowledgeSource[]> {
      return await db.kbSources.toArray();
  }

  public async saveKnowledgeSource(source: KnowledgeSource) {
      await db.kbSources.put(source);
  }

  public async deleteKnowledgeSource(id: string) {
      await db.kbSources.delete(id);
      
      const files = await db.kbFiles.where('sourceId').equals(id).toArray();
      for (const file of files) {
          if (file.fileId) {
              await this.fileStorage.deleteFile(file.fileId);
          }
          await db.kbFiles.delete(file.id);
      }
  }

  public async getKnowledgeFilesMeta(sourceId: string): Promise<KnowledgeFile[]> {
      return await db.kbFiles.where('sourceId').equals(sourceId).toArray();
  }

  public async getKnowledgeFileContent(fileId: string): Promise<string> {
      return await this.fileStorage.getFileAsBase64(fileId);
  }

  public async saveKnowledgeFiles(sourceId: string, files: KnowledgeFile[]) {
      for (const f of files) {
          const { data, ...meta } = f;
          meta.sourceId = sourceId;
          await db.kbFiles.put(meta);
      }
  }

  public async connectNotes(idA: string, idB: string) {
      const noteA = await db.notes.get(idA);
      const noteB = await db.notes.get(idB);
      if (noteA && noteB) {
          const linkTagA = `link:${idB}`;
          const linkTagB = `link:${idA}`;
          if (!noteA.tags) noteA.tags = [];
          if (!noteA.tags.includes(linkTagA)) noteA.tags.push(linkTagA);
          if (!noteB.tags) noteB.tags = [];
          if (!noteB.tags.includes(linkTagB)) noteB.tags.push(linkTagB);
          await db.notes.put(noteA);
          await db.notes.put(noteB);
      }
  }

  // --- LIBRARY MATERIALS ---
  public async getLibraryMaterials(): Promise<LibraryMaterial[]> {
    if (!this.supabase) throw new Error("Supabase not connected");
    const { data, error } = await this.supabase
      .from('library_materials')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as LibraryMaterial[];
  }

  public async saveLibraryMaterial(material: LibraryMaterial) {
    if (!this.supabase) throw new Error("Supabase not connected");
    
    const payload = {
        id: material.id,
        title: material.title,
        content: material.content,
        processed_content: material.processed_content || null,
        file_type: material.file_type,
        tags: material.tags && material.tags.length > 0 ? material.tags : [],
        size: material.size || 0
    };

    const { error } = await this.supabase
      .from('library_materials')
      .upsert(payload, { onConflict: 'id' });
      
    if (error) {
        console.error("Library Upload Error", error);
        throw error;
    }
  }

  public async deleteLibraryMaterial(id: string) {
    if (!this.supabase) throw new Error("Supabase not connected");
    const { error } = await this.supabase
      .from('library_materials')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}

