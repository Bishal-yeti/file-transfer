import pg from 'pg';
import { CreateShareParams, IDatabase, ShareRecord } from './types.js';

export class PostgresDatabase implements IDatabase {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS shares (
          id VARCHAR(64) PRIMARY KEY,
          owner_token_hash VARCHAR(128) NOT NULL,
          is_password_protected BOOLEAN NOT NULL DEFAULT FALSE,
          password_salt VARCHAR(64),
          is_one_time BOOLEAN NOT NULL DEFAULT FALSE,
          max_downloads INTEGER NOT NULL DEFAULT 0,
          download_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          total_size_bytes BIGINT NOT NULL,
          chunk_count INTEGER NOT NULL,
          encrypted_manifest TEXT NOT NULL,
          is_destroyed BOOLEAN NOT NULL DEFAULT FALSE,
          destroyed_reason VARCHAR(64)
        );

        CREATE INDEX IF NOT EXISTS idx_pg_shares_expires ON shares(expires_at);
        CREATE INDEX IF NOT EXISTS idx_pg_shares_destroyed ON shares(is_destroyed);
      `);
    } finally {
      client.release();
    }
  }

  async createShare(params: CreateShareParams): Promise<void> {
    const query = `
      INSERT INTO shares (
        id, owner_token_hash, is_password_protected, password_salt,
        is_one_time, max_downloads, download_count, created_at,
        expires_at, total_size_bytes, chunk_count, encrypted_manifest,
        is_destroyed, destroyed_reason
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 0, CURRENT_TIMESTAMP,
        $7, $8, $9, $10, FALSE, NULL
      )
    `;
    await this.pool.query(query, [
      params.id,
      params.owner_token_hash,
      params.is_password_protected,
      params.password_salt || null,
      params.is_one_time,
      params.max_downloads,
      params.expires_at,
      params.total_size_bytes,
      params.chunk_count,
      params.encrypted_manifest,
    ]);
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    const res = await this.pool.query('SELECT * FROM shares WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      is_password_protected: Boolean(row.is_password_protected),
      is_one_time: Boolean(row.is_one_time),
      is_destroyed: Boolean(row.is_destroyed),
    };
  }

  async incrementDownloadCount(id: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE shares
       SET download_count = download_count + 1
       WHERE id = $1 AND is_destroyed = FALSE
       RETURNING download_count`,
      [id]
    );
    return res.rows[0]?.download_count ?? 0;
  }

  async destroyShare(id: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE shares
       SET is_destroyed = TRUE, destroyed_reason = $1
       WHERE id = $2`,
      [reason, id]
    );
  }

  async deleteSharePermanent(id: string): Promise<void> {
    await this.pool.query('DELETE FROM shares WHERE id = $1', [id]);
  }

  async getExpiredOrDestroyedShares(nowIso: string): Promise<ShareRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM shares
       WHERE is_destroyed = TRUE OR expires_at <= $1`,
      [nowIso]
    );
    return res.rows.map((row) => ({
      ...row,
      is_password_protected: Boolean(row.is_password_protected),
      is_one_time: Boolean(row.is_one_time),
      is_destroyed: Boolean(row.is_destroyed),
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
