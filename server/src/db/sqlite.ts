import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { CreateShareParams, IDatabase, ShareRecord } from './types.js';

export class SqliteDatabase implements IDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(storageDir: string) {
    fs.mkdirSync(storageDir, { recursive: true });
    this.dbPath = path.join(storageDir, 'zero_trace.sqlite');
  }

  async init(): Promise<void> {
    this.db = new Database(this.dbPath);
    // Enable WAL mode for high concurrency and atomic commits
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        owner_token_hash TEXT NOT NULL,
        is_password_protected INTEGER NOT NULL DEFAULT 0,
        password_salt TEXT,
        is_one_time INTEGER NOT NULL DEFAULT 0,
        max_downloads INTEGER NOT NULL DEFAULT 0,
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        total_size_bytes INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        encrypted_manifest TEXT NOT NULL,
        is_destroyed INTEGER NOT NULL DEFAULT 0,
        destroyed_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires_at);
      CREATE INDEX IF NOT EXISTS idx_shares_destroyed ON shares(is_destroyed);
    `);
  }

  async createShare(params: CreateShareParams): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(`
      INSERT INTO shares (
        id, owner_token_hash, is_password_protected, password_salt,
        is_one_time, max_downloads, download_count, created_at,
        expires_at, total_size_bytes, chunk_count, encrypted_manifest,
        is_destroyed, destroyed_reason
      ) VALUES (
        @id, @owner_token_hash, @is_password_protected, @password_salt,
        @is_one_time, @max_downloads, 0, datetime('now'),
        @expires_at, @total_size_bytes, @chunk_count, @encrypted_manifest,
        0, NULL
      )
    `);

    stmt.run({
      id: params.id,
      owner_token_hash: params.owner_token_hash,
      is_password_protected: params.is_password_protected ? 1 : 0,
      password_salt: params.password_salt || null,
      is_one_time: params.is_one_time ? 1 : 0,
      max_downloads: params.max_downloads,
      expires_at: params.expires_at,
      total_size_bytes: params.total_size_bytes,
      chunk_count: params.chunk_count,
      encrypted_manifest: params.encrypted_manifest,
    });
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT * FROM shares WHERE id = ?');
    const row = stmt.get(id) as ShareRecord | undefined;
    if (!row) return null;
    return {
      ...row,
      is_password_protected: Boolean(row.is_password_protected),
      is_one_time: Boolean(row.is_one_time),
      is_destroyed: Boolean(row.is_destroyed),
    };
  }

  async incrementDownloadCount(id: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(`
      UPDATE shares
      SET download_count = download_count + 1
      WHERE id = ? AND is_destroyed = 0
    `);
    stmt.run(id);

    const check = this.db.prepare('SELECT download_count FROM shares WHERE id = ?').get(id) as { download_count: number } | undefined;
    return check ? check.download_count : 0;
  }

  async destroyShare(id: string, reason: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(`
      UPDATE shares
      SET is_destroyed = 1, destroyed_reason = ?
      WHERE id = ?
    `);
    stmt.run(reason, id);
  }

  async deleteSharePermanent(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('DELETE FROM shares WHERE id = ?');
    stmt.run(id);
  }

  async getExpiredOrDestroyedShares(nowIso: string): Promise<ShareRecord[]> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(`
      SELECT * FROM shares
      WHERE is_destroyed = 1 OR expires_at <= ?
    `);
    const rows = stmt.all(nowIso) as ShareRecord[];
    return rows.map((r) => ({
      ...r,
      is_password_protected: Boolean(r.is_password_protected),
      is_one_time: Boolean(r.is_one_time),
      is_destroyed: Boolean(r.is_destroyed),
    }));
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
