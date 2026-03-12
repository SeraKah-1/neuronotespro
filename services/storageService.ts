
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryItem, Folder, SavedPrompt, SavedQueue, LibraryMaterial } from '../types';

// --- INDEXED DB HELPER (Raw Implementation to avoid external deps) ---
const DB_NAME = 'NeuroNoteDB';
const DB_VERSION = 1;
const STORE_CONTENT = 'note_content';
const STORE_FILES = 'knowledge_files';

class IDBAdapter {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_CONTENT)) {
          db.createObjectStore(STORE_CONTENT); // Key: Note ID, Value: Content String
        }
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES); // Key: SourceId_FileId, Value: Blob/Base64
        }
      };
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
      request.onerror = (event) => reject(event);
    });
  }

  async put(storeName: string, key: string, value: any): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async get(storeName: string, key: string): Promise<any> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export class StorageService {
  private static instance: StorageService;
  private supabase: SupabaseClient | null = null;
  private idb: IDBAdapter;
  
  private constructor() {
    this.idb = new IDBAdapter();
    this.idb.init().catch(err => console.error("Failed to init IDB", err));
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public initSupabase(url: string, key: string) {
    if (url && key) {
      try {
        this.supabase = createClient(url, key);
        // Auto-sync on init
        this.syncWithCloud();
      } catch (e) {
        console.error("Supabase Init Error", e);
      }
    }
  }

  public isCloudReady(): boolean {
    return !!this.supabase;
  }

  // --- NOTES (Hybrid: Metadata in LS, Content in IDB) ---
  
  // Helper to strip heavy content for LocalStorage
  private stripContent(note: HistoryItem): HistoryItem {
    const snippet = note.content ? note.content.substring(0, 200).replace(/[#*`]/g, '') : "";
    return { ...note, content: "", snippet }; 
  }

  // Metadata is fast and synchronous (LocalStorage)
  public getLocalNotesMetadata(): HistoryItem[] {
    const data = localStorage.getItem('neuro_notes');
    return data ? JSON.parse(data) : [];
  }

  // Content is heavy and asynchronous (IndexedDB)
  public async getNoteContent(id: string): Promise<string> {
    let content = await this.idb.get(STORE_CONTENT, id);
    
    // Fallback: If not in IDB, try Cloud (for synced/cloud notes)
    if (!content && this.supabase) {
        try {
            const { data, error } = await this.supabase
                .from('neuro_notes')
                .select('content')
                .eq('id', id)
                .single();
            
            if (data && data.content) {
                content = data.content;
                // Cache to IDB for next time
                await this.idb.put(STORE_CONTENT, id, content);
            }
        } catch (e) {
            console.warn("Failed to fetch content from cloud fallback", e);
        }
    }
    
    return content || "";
  }

  // Returns full notes (Metadata + Content) - Expensive, use carefully
  public async getUnifiedNotes(forceSync = false): Promise<HistoryItem[]> {
      if (this.supabase && forceSync) {
          await this.syncWithCloud();
      }
      return this.getLocalNotesMetadata();
  }
  
  // NEW: Get content for multiple IDs (for Context Injection)
  public async getBatchContent(ids: string[]): Promise<Record<string, string>> {
      const results: Record<string, string> = {};
      
      // 1. Try Local IDB first
      for (const id of ids) {
          const content = await this.idb.get(STORE_CONTENT, id);
          if (content) results[id] = content;
      }

      // 2. If missing and Cloud ready, try fetch (RAG fallback)
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
    // 1. Save Content to IDB
    await this.idb.put(STORE_CONTENT, note.id, note.content);

    // 2. Save Metadata to LS
    const meta = this.getLocalNotesMetadata();
    const existingIndex = meta.findIndex(n => n.id === note.id);
    const lightweightNote = this.stripContent({ ...note, _status: note._status || 'local' });

    if (existingIndex >= 0) {
      meta[existingIndex] = lightweightNote;
    } else {
      meta.push(lightweightNote);
    }
    localStorage.setItem('neuro_notes', JSON.stringify(meta));
  }

  public async deleteNoteLocal(id: string) {
    await this.idb.delete(STORE_CONTENT, id);
    const notes = this.getLocalNotesMetadata().filter(n => n.id !== id);
    localStorage.setItem('neuro_notes', JSON.stringify(notes));
  }
  
  // NEW: Dual-Write Rename (Syncs to Cloud if applicable)
  public async renameNote(id: string, newTopic: string) {
      // 1. Local Update (Optimistic UI)
      const notes = this.getLocalNotesMetadata();
      const note = notes.find(n => n.id === id);
      if (note) {
          note.topic = newTopic;
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }

      // 2. Cloud Update (Fire & Forget logic or Await based on usage)
      if (note && (note._status === 'synced' || note._status === 'cloud') && this.supabase) {
          const { error } = await this.supabase
              .from('neuro_notes')
              .update({ topic: newTopic })
              .eq('id', id);
          
          if (error) console.error("Cloud Rename Failed", error);
      }
  }

  // --- CLOUD SYNC (NEURO_NOTES TABLE) ---
  
  public async syncWithCloud(): Promise<void> {
      if (!this.supabase) return;

      try {
          // 1. Fetch Cloud Metadata
          const { data: cloudNotes, error } = await this.supabase
              .from('neuro_notes')
              .select('id, timestamp, topic, mode, provider, folder_id, parent_id, tags');
          
          if (error) throw error;
          if (!cloudNotes) return;

          // 2. Merge with Local
          const localNotes = this.getLocalNotesMetadata();
          const localMap = new Map(localNotes.map(n => [n.id, n]));
          let hasChanges = false;

          for (const cNote of cloudNotes) {
              const local = localMap.get(cNote.id);
              
              const mappedCNote: HistoryItem = {
                  id: cNote.id,
                  timestamp: cNote.timestamp,
                  topic: cNote.topic,
                  mode: cNote.mode,
                  provider: cNote.provider,
                  folderId: cNote.folder_id,
                  parentId: cNote.parent_id,
                  tags: cNote.tags,
                  content: '', // Metadata only
                  _status: 'cloud'
              };

              if (!local) {
                  // New from Cloud
                  localNotes.push(mappedCNote);
                  hasChanges = true;
              } else {
                  // Exists locally. Update status if needed.
                  if (local._status !== 'synced') {
                      local._status = 'synced';
                      hasChanges = true;
                  }
                  
                  // Update metadata if cloud is newer
                  if (cNote.timestamp > local.timestamp) {
                      local.timestamp = cNote.timestamp;
                      local.topic = cNote.topic;
                      local.mode = cNote.mode;
                      local.tags = cNote.tags;
                      local.folderId = cNote.folder_id;
                      local.parentId = cNote.parent_id;
                      hasChanges = true;
                  }
              }
          }

          if (hasChanges) {
              localStorage.setItem('neuro_notes', JSON.stringify(localNotes));
          }

      } catch (e) {
          console.error("Sync Error", e);
      }
  }

  public async uploadNoteToCloud(note: HistoryItem) {
      if (!this.supabase) throw new Error("Supabase not connected. Please check Settings.");
      
      // CRITICAL FIX: Hydrate Content from IDB if missing in the payload
      // In hybrid mode, the UI often passes metadata objects where content is ""
      let fullContent = note.content;
      if (!fullContent || fullContent.length === 0) {
          fullContent = await this.getNoteContent(note.id);
      }

      // MAPPING: Ensure payload matches 'neuro_notes' table structure exactly
      // id, timestamp, topic, mode, content, provider, folder_id, parent_id, tags
      const sqlPayload = {
          id: note.id,
          timestamp: note.timestamp, // BigInt in SQL (compatible with JS Date.now number)
          topic: note.topic,
          mode: note.mode,
          content: fullContent, // Use validated full content
          provider: note.provider,
          folder_id: note.folderId || null,
          parent_id: note.parentId || null,
          tags: note.tags && note.tags.length > 0 ? note.tags : [] // Ensure array for text[]
      };

      // CRITICAL FIX: Add onConflict to prevent "duplicate key" errors on re-sync
      const { data, error } = await this.supabase
        .from('neuro_notes')
        .upsert(sqlPayload, { onConflict: 'id' })
        .select();

      if (error) {
          console.error("Supabase Upload Error:", error);
          throw new Error(`Cloud sync failed: ${error.message}`);
      }
      
      // Update local status to synced only if successful
      const notes = this.getLocalNotesMetadata();
      const idx = notes.findIndex(n => n.id === note.id);
      if (idx >= 0) {
          notes[idx]._status = 'synced';
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }
      return data;
  }
  
  // NEW: Import/Download from Cloud to Local
  public async importCloudNote(noteMeta: HistoryItem): Promise<void> {
      if (!this.supabase) throw new Error("Supabase not connected.");

      let fullContent = noteMeta.content;

      // Fetch full content if not present
      if (!fullContent) {
          const { data, error } = await this.supabase
              .from('neuro_notes')
              .select('content')
              .eq('id', noteMeta.id)
              .single();
          
          if (error || !data) throw new Error("Failed to fetch cloud content.");
          fullContent = data.content;
      }

      // Save to local as synced
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
  public getFolders(): Folder[] {
    const data = localStorage.getItem('neuro_folders');
    return data ? JSON.parse(data) : [];
  }

  public saveFolder(folder: Folder) {
    const folders = this.getFolders();
    folders.push(folder);
    localStorage.setItem('neuro_folders', JSON.stringify(folders));
  }

  public async deleteFolder(id: string) {
    const folders = this.getFolders().filter(f => f.id !== id);
    localStorage.setItem('neuro_folders', JSON.stringify(folders));
    
    // Move notes in this folder to root
    const notes = this.getLocalNotesMetadata();
    const notesToUpdate: string[] = [];
    notes.forEach(n => {
        if (n.folderId === id) {
            n.folderId = undefined; // Root
            if (n._status === 'synced' || n._status === 'cloud') {
                notesToUpdate.push(n.id);
            }
        }
    });
    localStorage.setItem('neuro_notes', JSON.stringify(notes));

    if (notesToUpdate.length > 0 && this.supabase) {
        const { error } = await this.supabase
            .from('neuro_notes')
            .update({ folder_id: null })
            .in('id', notesToUpdate);
        if (error) console.error("Cloud Folder Delete Move Failed", error);
    }
  }

  public async moveNoteToFolder(noteId: string, folderId: string | null) {
      const notes = this.getLocalNotesMetadata();
      const note = notes.find(n => n.id === noteId);
      if (note) {
          note.folderId = folderId === 'ROOT' ? undefined : (folderId || undefined);
          localStorage.setItem('neuro_notes', JSON.stringify(notes));

          if ((note._status === 'synced' || note._status === 'cloud') && this.supabase) {
              const { error } = await this.supabase
                  .from('neuro_notes')
                  .update({ folder_id: note.folderId || null })
                  .eq('id', noteId);
              
              if (error) console.error("Cloud Move Failed", error);
          }
      }
  }

  // --- TEMPLATES ---
  public getTemplates(): SavedPrompt[] {
      const data = localStorage.getItem('neuro_templates');
      return data ? JSON.parse(data) : [];
  }

  public saveTemplate(template: SavedPrompt) {
      const templates = this.getTemplates();
      templates.push(template);
      localStorage.setItem('neuro_templates', JSON.stringify(templates));
  }

  public deleteTemplate(id: string) {
      const templates = this.getTemplates().filter(t => t.id !== id);
      localStorage.setItem('neuro_templates', JSON.stringify(templates));
  }

  // --- QUEUES ---
  public async getQueues(): Promise<SavedQueue[]> {
     const data = localStorage.getItem('neuro_saved_queues');
     return data ? JSON.parse(data) : [];
  }

  public async saveQueue(queue: SavedQueue) {
      const queues = await this.getQueues();
      const idx = queues.findIndex(q => q.id === queue.id);
      if (idx >= 0) queues[idx] = queue;
      else queues.push(queue);
      localStorage.setItem('neuro_saved_queues', JSON.stringify(queues));
  }

  public async deleteQueue(id: string) {
      const queues = await this.getQueues();
      const filtered = queues.filter(q => q.id !== id);
      localStorage.setItem('neuro_saved_queues', JSON.stringify(filtered));
  }

  // --- LIBRARY MATERIALS (Cloud - library_materials Table) ---
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
    
    // MAPPING: Ensure payload matches 'library_materials' schema
    // id, created_at (auto), title, content, processed_content, file_type, tags, size
    const payload = {
        id: material.id,
        title: material.title,
        content: material.content, // Base64
        processed_content: material.processed_content || null,
        file_type: material.file_type,
        tags: material.tags && material.tags.length > 0 ? material.tags : [],
        size: material.size || 0
    };

    // CRITICAL FIX: Add onConflict to upsert
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
