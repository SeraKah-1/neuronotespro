import Dexie, { Table } from 'dexie';
import { HistoryItem, Folder, SavedQueue, SavedPrompt, KnowledgeSource, KnowledgeFile, SyncMetadata } from './types';

export class NeuroDB extends Dexie {
  notes!: Table<HistoryItem, string>;
  folders!: Table<Folder, string>;
  queues!: Table<SavedQueue, string>;
  templates!: Table<SavedPrompt, string>;
  kbSources!: Table<KnowledgeSource, string>;
  kbFiles!: Table<KnowledgeFile, string>;
  sync_metadata!: Table<SyncMetadata, string>;

  constructor() {
    super('NeuroDB');
    this.version(4).stores({
      notes: 'id, timestamp, updated_at, keycard_id, folderId, _status, _deleted',
      folders: 'id, timestamp',
      queues: 'id, timestamp',
      templates: 'id',
      kbSources: 'id',
      kbFiles: 'id, sourceId',
      sync_metadata: 'id'
    });
  }
}

export const db = new NeuroDB();

