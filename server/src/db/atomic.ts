import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CreateShareParams, IDatabase, ShareRecord } from './types.js';

export class AtomicFileDatabase implements IDatabase {
  private dbPath: string;
  private shares: Map<string, ShareRecord> = new Map();
  private isSaving = false;
  private savePending = false;

  constructor(storageDir: string) {
    this.dbPath = path.join(path.resolve(storageDir), 'zero_trace_db.json');
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    if (existsSync(this.dbPath)) {
      try {
        const raw = await fs.readFile(this.dbPath, 'utf8');
        const list: ShareRecord[] = JSON.parse(raw);
        for (const item of list) {
          this.shares.set(item.id, {
            ...item,
            is_password_protected: Boolean(item.is_password_protected),
            is_one_time: Boolean(item.is_one_time),
            is_destroyed: Boolean(item.is_destroyed),
          });
        }
      } catch (err) {
        console.warn('Warning: Database file was corrupted, starting fresh:', err);
        this.shares.clear();
      }
    }
  }

  private async persist(): Promise<void> {
    if (this.isSaving) {
      this.savePending = true;
      return;
    }
    this.isSaving = true;

    try {
      const records = Array.from(this.shares.values());
      const tempPath = `${this.dbPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      await fs.writeFile(tempPath, JSON.stringify(records, null, 2), 'utf8');
      await fs.rename(tempPath, this.dbPath);
    } catch (err) {
      console.error('Failed to persist database state:', err);
    } finally {
      this.isSaving = false;
      if (this.savePending) {
        this.savePending = false;
        await this.persist();
      }
    }
  }

  async createShare(params: CreateShareParams): Promise<void> {
    const record: ShareRecord = {
      id: params.id,
      owner_token_hash: params.owner_token_hash,
      is_password_protected: Boolean(params.is_password_protected),
      password_salt: params.password_salt || null,
      is_one_time: Boolean(params.is_one_time),
      max_downloads: params.max_downloads,
      download_count: 0,
      created_at: new Date().toISOString(),
      expires_at: params.expires_at,
      total_size_bytes: params.total_size_bytes,
      chunk_count: params.chunk_count,
      encrypted_manifest: params.encrypted_manifest,
      is_destroyed: false,
      destroyed_reason: null,
    };

    this.shares.set(record.id, record);
    await this.persist();
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    const record = this.shares.get(id);
    if (!record) return null;
    return { ...record };
  }

  async incrementDownloadCount(id: string): Promise<number> {
    const record = this.shares.get(id);
    if (!record || record.is_destroyed) return 0;
    record.download_count += 1;
    await this.persist();
    return record.download_count;
  }

  async destroyShare(id: string, reason: string): Promise<void> {
    const record = this.shares.get(id);
    if (!record) return;
    record.is_destroyed = true;
    record.destroyed_reason = reason;
    await this.persist();
  }

  async deleteSharePermanent(id: string): Promise<void> {
    this.shares.delete(id);
    await this.persist();
  }

  async getExpiredOrDestroyedShares(nowIso: string): Promise<ShareRecord[]> {
    const nowTime = new Date(nowIso).getTime();
    const result: ShareRecord[] = [];

    for (const record of this.shares.values()) {
      const expTime = new Date(record.expires_at).getTime();
      if (record.is_destroyed || expTime <= nowTime) {
        result.push({ ...record });
      }
    }

    return result;
  }

  async close(): Promise<void> {
    await this.persist();
  }
}
