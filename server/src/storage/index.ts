import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../config/index.js';

export interface IStorageEngine {
  init(): Promise<void>;
  saveChunk(shareId: string, chunkIndex: number, data: Buffer): Promise<void>;
  getChunk(shareId: string, chunkIndex: number): Promise<Buffer | null>;
  hasChunk(shareId: string, chunkIndex: number): Promise<boolean>;
  deleteShareBlobs(shareId: string): Promise<void>;
}

export class LocalStorageEngine implements IStorageEngine {
  private baseDir: string;
  private readonly validIdRegex = /^[a-zA-Z0-9_-]{16,64}$/;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private validateShareId(shareId: string): void {
    if (!this.validIdRegex.test(shareId)) {
      throw new Error('Invalid share identifier format');
    }
  }

  private validateChunkIndex(chunkIndex: number): void {
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > config.MAX_SHARE_CHUNKS) {
      throw new Error('Invalid chunk index');
    }
  }

  private getShareDir(shareId: string): string {
    this.validateShareId(shareId);
    const resolved = path.resolve(this.baseDir, shareId);
    // Path traversal defense check
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error('Directory traversal detected');
    }
    return resolved;
  }

  private getChunkPath(shareId: string, chunkIndex: number): string {
    this.validateChunkIndex(chunkIndex);
    const shareDir = this.getShareDir(shareId);
    return path.join(shareDir, `chunk_${chunkIndex.toString().padStart(5, '0')}.bin`);
  }

  async saveChunk(shareId: string, chunkIndex: number, data: Buffer): Promise<void> {
    const shareDir = this.getShareDir(shareId);
    await fs.mkdir(shareDir, { recursive: true });

    // Validate size limit per chunk (2MB + 64 bytes tag/IV envelope allowance)
    if (data.length > config.CHUNK_SIZE_BYTES + 1024) {
      throw new Error('Chunk exceeds allowed maximum size');
    }

    const chunkPath = this.getChunkPath(shareId, chunkIndex);
    // Write atomically via temporary file to prevent corrupted partial chunks
    const tempPath = `${chunkPath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, chunkPath);
  }

  async getChunk(shareId: string, chunkIndex: number): Promise<Buffer | null> {
    const chunkPath = this.getChunkPath(shareId, chunkIndex);
    if (!existsSync(chunkPath)) {
      return null;
    }
    return await fs.readFile(chunkPath);
  }

  async hasChunk(shareId: string, chunkIndex: number): Promise<boolean> {
    const chunkPath = this.getChunkPath(shareId, chunkIndex);
    return existsSync(chunkPath);
  }

  async deleteShareBlobs(shareId: string): Promise<void> {
    try {
      const shareDir = this.getShareDir(shareId);
      if (existsSync(shareDir)) {
        await fs.rm(shareDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`Error deleting blobs for share ${shareId}:`, err);
    }
  }
}

let storageEngine: IStorageEngine | null = null;

export async function getStorageEngine(): Promise<IStorageEngine> {
  if (storageEngine) return storageEngine;
  storageEngine = new LocalStorageEngine(config.STORAGE_DIR);
  await storageEngine.init();
  return storageEngine;
}
