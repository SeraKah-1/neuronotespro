
import * as Comlink from 'comlink';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db } from './db';
import { HistoryItem } from './types';

class SyncWorker {
  private supabase: SupabaseClient | null = null;
  private isSyncing = false;
  private onStatusChange: ((status: boolean) => void) | null = null;

  async init(url: string, key: string, onStatusChange?: (status: boolean) => void) {
    if (url && key) {
      this.supabase = createClient(url, key);
    }
    if (onStatusChange) {
      this.onStatusChange = onStatusChange;
    }
  }

  private setSyncing(status: boolean) {
    this.isSyncing = status;
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  async pullFromCloud(authKeyOrKeycard: string) {
    if (!this.supabase || this.isSyncing || !authKeyOrKeycard) return;
    this.setSyncing(true);

    try {
      // 1. Read last_sync_timestamp from Dexie
      const lastSyncMeta = await db.sync_metadata.get('last_sync');
      const lastSyncTimestamp = lastSyncMeta?.value || 0;

      let hasMore = true;
      let offset = 0;
      const limit = 500;
      let currentMaxUpdatedAt = lastSyncTimestamp;

      while (hasMore) {
        const { data, error } = await this.supabase
          .from('neuro_notes')
          .select('*')
          .gt('updated_at', lastSyncTimestamp)
          .eq('keycard_id', authKeyOrKeycard)
          .order('updated_at', { ascending: true })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error("Supabase Pull Error:", error);
          break;
        }

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        // 2. Upsert fetched rows into Dexie
        const notesToPut: HistoryItem[] = data.map((row: any) => ({
          ...row,
          _status: 'synced',
          _deleted: row._deleted || false
        }));

        await db.notes.bulkPut(notesToPut);

        // Update currentMaxUpdatedAt
        const maxInBatch = Math.max(...data.map((row: any) => row.updated_at));
        currentMaxUpdatedAt = Math.max(currentMaxUpdatedAt, maxInBatch);

        offset += limit;
        if (data.length < limit) {
          hasMore = false;
        }
      }

      // 3. Update last_sync_timestamp
      await db.sync_metadata.put({ id: 'last_sync', value: currentMaxUpdatedAt });

    } catch (e) {
      console.error("Sync Worker Error:", e);
    } finally {
      this.setSyncing(false);
    }
  }

  async getSyncStatus() {
    return this.isSyncing;
  }
}

Comlink.expose(new SyncWorker());
