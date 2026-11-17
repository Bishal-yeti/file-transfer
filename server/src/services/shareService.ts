import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import { getStorageEngine } from '../storage/index.js';
import { ShareRecord } from '../db/types.js';

export interface CreateShareInput {
  id?: string;
  ownerToken: string;
  isPasswordProtected: boolean;
  passwordSalt?: string | null;
  isOneTime: boolean;
  maxDownloads: number;
  expiresInSeconds: number;
  totalSizeBytes: number;
  chunkCount: number;
  encryptedManifest: string;
}

export class ShareService {
  private hashOwnerToken(token: string): string {
    return crypto
      .createHmac('sha256', config.SERVER_HMAC_SECRET)
      .update(token)
      .digest('hex');
  }

  private verifyOwnerToken(token: string, storedHash: string): boolean {
    const computedHash = this.hashOwnerToken(token);
    const computedBuf = Buffer.from(computedHash, 'utf8');
    const storedBuf = Buffer.from(storedHash, 'utf8');

    if (computedBuf.length !== storedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  }

  async createShare(input: CreateShareInput): Promise<{ shareId: string }> {
    const db = await getDatabase();

    // Generate random 128-bit secure hex identifier if not provided
    const shareId = input.id || crypto.randomBytes(16).toString('hex');

    // Strict validation
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(shareId)) {
      throw new Error('Invalid share identifier');
    }

    if (!input.ownerToken || input.ownerToken.length < 16) {
      throw new Error('Owner deletion token must be at least 16 characters');
    }

    const maxExp = config.MAX_EXPIRATION_SECONDS;
    const expSeconds = Math.max(60, Math.min(input.expiresInSeconds || 3600, maxExp));
    const expiresAt = new Date(Date.now() + expSeconds * 1000).toISOString();

    if (input.totalSizeBytes > config.MAX_FILE_SIZE_BYTES) {
      throw new Error(`Total size exceeds maximum limit of ${config.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    if (input.chunkCount > config.MAX_SHARE_CHUNKS) {
      throw new Error(`Chunk count exceeds limit of ${config.MAX_SHARE_CHUNKS}`);
    }

    if (!input.encryptedManifest || input.encryptedManifest.length > 500000) {
      throw new Error('Encrypted manifest is invalid or too large');
    }

    const ownerTokenHash = this.hashOwnerToken(input.ownerToken);

    await db.createShare({
      id: shareId,
      owner_token_hash: ownerTokenHash,
      is_password_protected: Boolean(input.isPasswordProtected),
      password_salt: input.passwordSalt || null,
      is_one_time: Boolean(input.isOneTime),
      max_downloads: input.isOneTime ? 1 : Math.max(0, input.maxDownloads || 0),
      expires_at: expiresAt,
      total_size_bytes: input.totalSizeBytes,
      chunk_count: input.chunkCount,
      encrypted_manifest: input.encryptedManifest,
    });

    return { shareId };
  }

  async uploadChunk(shareId: string, chunkIndex: number, chunkBuffer: Buffer): Promise<void> {
    const db = await getDatabase();
    const storage = await getStorageEngine();

    const share = await db.getShare(shareId);
    if (!share) {
      throw new Error('Share not found');
    }

    if (share.is_destroyed) {
      throw new Error('Share has been destroyed');
    }

    if (new Date(share.expires_at).getTime() <= Date.now()) {
      await this.destroyShare(shareId, 'expired');
      throw new Error('Share has expired');
    }

    if (chunkIndex < 0 || chunkIndex >= share.chunk_count) {
      throw new Error(`Chunk index ${chunkIndex} out of bounds (total: ${share.chunk_count})`);
    }

    await storage.saveChunk(shareId, chunkIndex, chunkBuffer);
  }

  async getShareMetadata(shareId: string): Promise<Omit<ShareRecord, 'owner_token_hash'> | null> {
    const db = await getDatabase();
    const share = await db.getShare(shareId);

    if (!share) return null;

    // Check expiration
    if (new Date(share.expires_at).getTime() <= Date.now()) {
      await this.destroyShare(shareId, 'expired');
      return null;
    }

    if (share.is_destroyed) {
      return null;
    }

    // Never return owner_token_hash
    const { owner_token_hash, ...publicShare } = share;
    return publicShare;
  }

  async downloadChunk(shareId: string, chunkIndex: number): Promise<{ buffer: Buffer; isFinal: boolean; burned: boolean }> {
    const db = await getDatabase();
    const storage = await getStorageEngine();

    const share = await db.getShare(shareId);
    if (!share || share.is_destroyed) {
      throw new Error('Share is unavailable or destroyed');
    }

    if (new Date(share.expires_at).getTime() <= Date.now()) {
      await this.destroyShare(shareId, 'expired');
      throw new Error('Share has expired');
    }

    const chunkData = await storage.getChunk(shareId, chunkIndex);
    if (!chunkData) {
      throw new Error(`Chunk ${chunkIndex} not found`);
    }

    // Determine if this is the final chunk in the share
    const isFinal = chunkIndex === Math.max(0, share.chunk_count - 1);
    let burned = false;

    if (isFinal) {
      const newCount = await db.incrementDownloadCount(shareId);

      // Check one-time or max downloads trigger
      if (share.is_one_time || (share.max_downloads > 0 && newCount >= share.max_downloads)) {
        burned = true;
        await this.destroyShare(shareId, share.is_one_time ? 'one_time_burned' : 'max_downloads_reached');
      }
    }

    return { buffer: chunkData, isFinal, burned };
  }

  async deleteShareByOwner(shareId: string, ownerToken: string): Promise<boolean> {
    const db = await getDatabase();
    const share = await db.getShare(shareId);

    if (!share) {
      return false;
    }

    const isValid = this.verifyOwnerToken(ownerToken, share.owner_token_hash);
    if (!isValid) {
      return false;
    }

    await this.destroyShare(shareId, 'owner_revoked');
    await db.deleteSharePermanent(shareId);
    return true;
  }

  async destroyShare(shareId: string, reason: string): Promise<void> {
    const db = await getDatabase();
    const storage = await getStorageEngine();

    await db.destroyShare(shareId, reason);
    await storage.deleteShareBlobs(shareId);
  }

  async cleanupExpiredShares(): Promise<number> {
    const db = await getDatabase();
    const storage = await getStorageEngine();
    const nowIso = new Date().toISOString();

    const deadShares = await db.getExpiredOrDestroyedShares(nowIso);
    let count = 0;

    for (const share of deadShares) {
      try {
        await storage.deleteShareBlobs(share.id);
        await db.deleteSharePermanent(share.id);
        count++;
      } catch (err) {
        console.error(`Failed to cleanup share ${share.id}:`, err);
      }
    }

    return count;
  }
}

export const shareService = new ShareService();
