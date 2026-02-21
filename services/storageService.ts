
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HistoryItem, Folder, SavedPrompt, SavedQueue, KnowledgeSource, KnowledgeFile, LibraryMaterial } from '../types';

// --- INDEXED DB HELPER (Raw Implementation to avoid external deps) ---
const DB_NAME = 'NeuroNoteDB';
const DB_VERSION = 1;
const STORE_CONTENT = 'note_content';
const STORE_FILES = 'knowledge_files';

class IDBAdapter {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
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
        
        // Handle connection closing (e.g. on version change or reload)
        this.db.onversionchange = () => {
            this.db?.close();
            this.db = null;
            this.initPromise = null;
        };
        
        resolve();
      };

      request.onerror = (event) => {
          console.error("IDB Open Error:", (event.target as IDBOpenDBRequest).error);
          this.initPromise = null; // Allow retry
          reject((event.target as IDBOpenDBRequest).error);
      };
    });
    
    return this.initPromise;
  }

  async put(storeName: string, key: string, value: any): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async get(storeName: string, key: string): Promise<any> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error("Database not initialized"));
      const tx = this.db.transaction(storeName, 'readwrite');
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
    return { ...note, content: "" }; 
  }

  // Metadata is fast and synchronous (LocalStorage)
  public getLocalNotesMetadata(): HistoryItem[] {
    const data = localStorage.getItem('neuro_notes');
    return data ? JSON.parse(data) : [];
  }

  // Content is heavy and asynchronous (IndexedDB)
  public async getNoteContent(id: string): Promise<string> {
    let content = await this.idb.get(STORE_CONTENT, id);
    
    // If missing locally, try fetching from Cloud (Lazy Load)
    if (!content && this.supabase) {
        const { data } = await this.supabase
            .from('neuro_notes')
            .select('content')
            .eq('id', id)
            .single();
        
        if (data && data.content) {
            content = data.content;
            // Cache it locally for next time
            await this.idb.put(STORE_CONTENT, id, content);
        }
    }
    
    return content || "";
  }

  // Returns full notes (Metadata + Content) - Expensive, use carefully
  public async getUnifiedNotes(): Promise<HistoryItem[]> {
      const localMeta = this.getLocalNotesMetadata();
      // We don't fetch all content automatically to save memory
      // But we can check cloud status here if needed
      return localMeta;
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
    
    // Ensure updated_at is set
    const updatedNote = { ...note, updated_at: Date.now() };
    const lightweightNote = this.stripContent({ ...updatedNote, _status: note._status || 'local' });

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
          note.updated_at = Date.now(); // Update timestamp
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }

      // 2. Cloud Update (Fire & Forget logic or Await based on usage)
      if (note && (note._status === 'synced' || note._status === 'cloud') && this.supabase) {
          const { error } = await this.supabase
              .from('neuro_notes')
              .update({ topic: newTopic, updated_at: new Date().toISOString() }) // Use ISO for SQL
              .eq('id', id);
          
          if (error) console.error("Cloud Rename Failed", error);
      }
  }

  // --- CLOUD SYNC (NEURO_NOTES TABLE) ---
  public async syncNotesFromCloud(): Promise<void> {
      if (!this.supabase) return;

      const { data, error } = await this.supabase
          .from('neuro_notes')
          .select('id, topic, timestamp, updated_at, mode, provider, folder_id, parent_id, tags');
      
      if (error) {
          console.error("Cloud Sync Error", error);
          return;
      }

      if (data) {
          const localNotes = this.getLocalNotesMetadata();
          const localMap = new Map(localNotes.map(n => [n.id, n]));
          const cloudIds = new Set(data.map((n: any) => n.id));
          let hasChanges = false;

          // 1. Update/Add from Cloud
          data.forEach((cloudNote: any) => {
              const local = localMap.get(cloudNote.id);
              
              // If not local, or cloud is newer (using updated_at or timestamp)
              // Convert SQL timestamp (string/bigint) to JS number if needed
              const cloudTime = new Date(cloudNote.updated_at || cloudNote.timestamp).getTime();
              const localTime = local ? (local.updated_at || local.timestamp) : 0;

              if (!local || cloudTime > localTime) {
                  const merged: HistoryItem = {
                      id: cloudNote.id,
                      topic: cloudNote.topic,
                      timestamp: new Date(cloudNote.timestamp).getTime(),
                      updated_at: cloudTime,
                      mode: cloudNote.mode,
                      provider: cloudNote.provider,
                      folderId: cloudNote.folder_id,
                      parentId: cloudNote.parent_id,
                      tags: cloudNote.tags,
                      content: local ? local.content : "", // Keep local content if exists, else empty (lazy load)
                      _status: 'synced'
                  };
                  localMap.set(cloudNote.id, merged);
                  hasChanges = true;
              } else if (local && local._status !== 'synced') {
                  // If local exists and is newer/same, just mark as synced if it matches
                  local._status = 'synced';
                  hasChanges = true;
              }
          });

          // 2. Handle Deletions (Cloud -> Local) - SAFER LOGIC
          // Only delete if:
          // a) It was previously marked as 'synced' or 'cloud' (meaning it existed on server)
          // b) It is NOT in the current cloud payload
          // c) The cloud payload is NOT empty (to prevent wiping local on empty fetch)
          if (data.length > 0) {
              for (const [id, note] of localMap.entries()) {
                  if ((note._status === 'synced' || note._status === 'cloud') && !cloudIds.has(id)) {
                      localMap.delete(id);
                      // Also clean up content from IDB to free space
                      this.idb.delete(STORE_CONTENT, id); 
                      hasChanges = true;
                  }
              }
          }

          if (hasChanges) {
              const mergedList = Array.from(localMap.values());
              localStorage.setItem('neuro_notes', JSON.stringify(mergedList));
          }
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

      // SAFETY CHECK: Do not upload empty content if we failed to retrieve it
      if (!fullContent && note.content === "") {
          console.warn(`Skipping upload for note ${note.id}: Content is empty and could not be retrieved.`);
          return null; 
      }

      // MAPPING: Ensure payload matches 'neuro_notes' table structure exactly
      // id, timestamp, topic, mode, content, provider, folder_id, parent_id, tags, updated_at
      const sqlPayload = {
          id: note.id,
          timestamp: note.timestamp, // BigInt in SQL (compatible with JS Date.now number)
          topic: note.topic,
          mode: note.mode,
          content: fullContent, // Use validated full content
          provider: note.provider,
          folder_id: note.folderId || null,
          parent_id: note.parentId || null,
          tags: note.tags && note.tags.length > 0 ? note.tags : [], // Ensure array for text[]
          updated_at: new Date().toISOString() // Explicitly set updated_at
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
          notes[idx].updated_at = new Date(sqlPayload.updated_at).getTime(); // Update local meta
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

  // --- REALTIME SUBSCRIPTIONS ---
  public subscribeToNotes(callback: (payload: any) => void) {
    if (!this.supabase) return null;
    return this.supabase
      .channel('neuro_notes_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'neuro_notes' },
        (payload) => callback(payload)
      )
      .subscribe();
  }

  public subscribeToLibrary(callback: (payload: any) => void) {
    if (!this.supabase) return null;
    return this.supabase
      .channel('library_materials_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'library_materials' },
        (payload) => callback(payload)
      )
      .subscribe();
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

  public deleteFolder(id: string) {
    const folders = this.getFolders().filter(f => f.id !== id);
    localStorage.setItem('neuro_folders', JSON.stringify(folders));
    
    // Move notes in this folder to root
    const notes = this.getLocalNotesMetadata();
    notes.forEach(n => {
        if (n.folderId === id) n.folderId = undefined; // Root
    });
    localStorage.setItem('neuro_notes', JSON.stringify(notes));
  }

  public moveNoteToFolder(noteId: string, folderId: string | null) {
      const notes = this.getLocalNotesMetadata();
      const note = notes.find(n => n.id === noteId);
      if (note) {
          note.folderId = folderId === 'ROOT' ? undefined : (folderId || undefined);
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
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

  // --- KNOWLEDGE BASE ---
  public getKnowledgeSources(): KnowledgeSource[] {
      const data = localStorage.getItem('neuro_kb_sources');
      return data ? JSON.parse(data) : [];
  }

  public saveKnowledgeSource(source: KnowledgeSource) {
      const sources = this.getKnowledgeSources();
      const idx = sources.findIndex(s => s.id === source.id);
      if (idx >= 0) sources[idx] = source;
      else sources.push(source);
      localStorage.setItem('neuro_kb_sources', JSON.stringify(sources));
  }

  public deleteKnowledgeSource(id: string) {
      const sources = this.getKnowledgeSources().filter(s => s.id !== id);
      localStorage.setItem('neuro_kb_sources', JSON.stringify(sources));
      const files = this.getKnowledgeFilesMeta(id);
      files.forEach(f => this.idb.delete(STORE_FILES, f.id));
      localStorage.removeItem(`neuro_kb_files_${id}`);
  }

  public getKnowledgeFilesMeta(sourceId: string): KnowledgeFile[] {
      const data = localStorage.getItem(`neuro_kb_files_${sourceId}`);
      return data ? JSON.parse(data) : [];
  }

  public async getKnowledgeFileContent(fileId: string): Promise<string> {
      return await this.idb.get(STORE_FILES, fileId);
  }

  public async saveKnowledgeFiles(sourceId: string, files: KnowledgeFile[]) {
      const metaFiles: KnowledgeFile[] = [];
      for (const f of files) {
          if (f.data) {
             await this.idb.put(STORE_FILES, f.id, f.data);
          }
          const { data, ...meta } = f;
          metaFiles.push(meta);
      }
      const existing = this.getKnowledgeFilesMeta(sourceId);
      const updated = [...existing];
      metaFiles.forEach(f => {
          const idx = updated.findIndex(ex => ex.id === f.id);
          if (idx >= 0) updated[idx] = f;
          else updated.push(f);
      });
      localStorage.setItem(`neuro_kb_files_${sourceId}`, JSON.stringify(updated));
  }

  public connectNotes(idA: string, idB: string) {
      const notes = this.getLocalNotesMetadata();
      const noteA = notes.find(n => n.id === idA);
      const noteB = notes.find(n => n.id === idB);
      if (noteA && noteB) {
          const linkTagA = `link:${idB}`;
          const linkTagB = `link:${idA}`;
          if (!noteA.tags) noteA.tags = [];
          if (!noteA.tags.includes(linkTagA)) noteA.tags.push(linkTagA);
          if (!noteB.tags) noteB.tags = [];
          if (!noteB.tags.includes(linkTagB)) noteB.tags.push(linkTagB);
          localStorage.setItem('neuro_notes', JSON.stringify(notes));
      }
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
