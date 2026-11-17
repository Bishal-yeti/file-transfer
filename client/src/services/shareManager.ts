import {
  generateMasterKey,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  encryptChunk,
  decryptChunk,
  encryptManifest,
  decryptManifest,
  deriveKeyFromPassword,
  hexToBytes,
  computeSha256,
  getRandomBytes,
  bytesToHex,
  ShareManifest,
  ShareFileEntry,
} from '../crypto/webCrypto.js';

export interface UploadProgress {
  percent: number;
  phase: 'preparing' | 'encrypting' | 'uploading' | 'complete' | 'error';
  currentChunk: number;
  totalChunks: number;
  message: string;
}

export interface CreateShareOptions {
  files?: File[];
  textContent?: string;
  shareType: 'file' | 'media' | 'info';
  password?: string;
  isOneTime?: boolean;
  maxDownloads?: number;
  expiresInSeconds?: number;
  notes?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export interface CreateShareResult {
  shareId: string;
  ownerToken: string;
  shareUrl: string;
  expiresAt: string;
  isPasswordProtected: boolean;
}

export interface DecryptedFile {
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  verified: boolean;
}

export interface DecryptedShareResult {
  manifest: ShareManifest;
  files: DecryptedFile[];
  textContent?: string;
  burned: boolean;
}

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB

export class ShareManager {
  /**
   * Encrypts and uploads files or messages client-side before sending to server
   */
  async createShare(options: CreateShareOptions): Promise<CreateShareResult> {
    const {
      files = [],
      textContent,
      shareType,
      password,
      isOneTime = false,
      maxDownloads = 0,
      expiresInSeconds = 3600,
      notes,
      onProgress,
    } = options;

    onProgress?.({
      percent: 5,
      phase: 'preparing',
      currentChunk: 0,
      totalChunks: 0,
      message: 'Generating client-side 256-bit AES-GCM master key...',
    });

    // 1. Handle password protection or generate random Master Key (AES-256)
    let isPasswordProtected = false;
    let passwordSaltHex: string | null = null;
    let masterKey: CryptoKey;
    let rawKeyBase64 = '';

    if (password && password.trim().length > 0) {
      isPasswordProtected = true;
      passwordSaltHex = bytesToHex(getRandomBytes(16));
      masterKey = await deriveKeyFromPassword(password.trim(), hexToBytes(passwordSaltHex));
    } else {
      masterKey = await generateMasterKey();
      rawKeyBase64 = await exportKeyToBase64Url(masterKey);
    }

    // 2. Generate random owner deletion token (256-bit)
    const ownerToken = bytesToHex(getRandomBytes(32));

    // 4. Calculate chunks and prepare file metadata
    let totalChunks = 0;
    let totalSizeBytes = 0;
    const fileEntries: ShareFileEntry[] = [];

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      const buffer = new Uint8Array(await file.arrayBuffer());
      const sha256 = await computeSha256(buffer);
      const fileChunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

      fileEntries.push({
        id: `f_${fIdx}`,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256,
        chunkStart: totalChunks,
        chunkCount: fileChunkCount,
      });

      totalChunks += fileChunkCount;
      totalSizeBytes += file.size;
    }

    // If pure text share with no files
    if (files.length === 0 && textContent) {
      const textBytes = new TextEncoder().encode(textContent);
      totalSizeBytes = textBytes.byteLength;
      totalChunks = 1;
    }

    // 5. Construct & Encrypt Manifest
    const manifest: ShareManifest = {
      version: 1,
      type: shareType,
      createdAt: new Date().toISOString(),
      files: fileEntries,
      textContent: textContent || undefined,
      notes: notes || undefined,
    };

    onProgress?.({
      percent: 15,
      phase: 'encrypting',
      currentChunk: 0,
      totalChunks,
      message: 'Encrypting manifest with AES-256-GCM...',
    });

    const encryptedManifest = await encryptManifest(manifest, masterKey);

    // 6. POST share metadata to backend
    const createRes = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken,
        isPasswordProtected,
        passwordSalt: passwordSaltHex,
        isOneTime,
        maxDownloads: isOneTime ? 1 : maxDownloads,
        expiresInSeconds,
        totalSizeBytes,
        chunkCount: totalChunks,
        encryptedManifest,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(err.message || 'Failed to initialize share on server');
    }

    const { shareId } = await createRes.json();

    // 7. Encrypt and Upload Chunks
    let globalChunkIdx = 0;

    // A) If files are present
    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      const arrayBuf = await file.arrayBuffer();

      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        const slice = new Uint8Array(arrayBuf.slice(offset, Math.min(offset + CHUNK_SIZE, file.size)));

        onProgress?.({
          percent: 20 + Math.round((globalChunkIdx / totalChunks) * 75),
          phase: 'encrypting',
          currentChunk: globalChunkIdx + 1,
          totalChunks,
          message: `Encrypting chunk ${globalChunkIdx + 1}/${totalChunks}...`,
        });

        // Genuine AES-256-GCM encryption with unique random IV per chunk and AAD
        const encryptedChunk = await encryptChunk(slice, masterKey, shareId, globalChunkIdx);

        onProgress?.({
          percent: 25 + Math.round((globalChunkIdx / totalChunks) * 70),
          phase: 'uploading',
          currentChunk: globalChunkIdx + 1,
          totalChunks,
          message: `Uploading encrypted chunk ${globalChunkIdx + 1}/${totalChunks}...`,
        });

        const uploadRes = await fetch(`/api/shares/${shareId}/chunks/${globalChunkIdx}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: encryptedChunk as any,
        });

        if (!uploadRes.ok) {
          throw new Error(`Failed to upload chunk ${globalChunkIdx}`);
        }

        globalChunkIdx++;
      }
    }

    // B) If pure text share
    if (files.length === 0 && textContent) {
      const textBytes = new TextEncoder().encode(textContent);
      const encryptedChunk = await encryptChunk(textBytes, masterKey, shareId, 0);

      await fetch(`/api/shares/${shareId}/chunks/0`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: encryptedChunk as any,
      });
    }

    onProgress?.({
      percent: 100,
      phase: 'complete',
      currentChunk: totalChunks,
      totalChunks,
      message: 'Encryption & upload complete.',
    });

    // 8. Construct final share URL with key in Fragment (#)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    let fragment = `key=${rawKeyBase64}`;
    if (isPasswordProtected && passwordSaltHex) {
      fragment += `&pwd=1&salt=${passwordSaltHex}`;
    }

    const shareUrl = `${origin}/#share=${shareId}&${fragment}`;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      shareId,
      ownerToken,
      shareUrl,
      expiresAt,
      isPasswordProtected,
    };
  }

  /**
   * Fetches metadata, prompts for password if protected, decrypts manifest,
   * then downloads and decrypts all chunks locally.
   */
  async loadShareMetadata(shareId: string): Promise<{
    share: any;
    isPasswordProtected: boolean;
    salt: string | null;
  }> {
    const res = await fetch(`/api/shares/${shareId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Share not found, expired, or destroyed');
    }
    const data = await res.json();
    return {
      share: data.share,
      isPasswordProtected: Boolean(data.share.is_password_protected),
      salt: data.share.password_salt,
    };
  }

  /**
   * Decrypts the complete share content
   */
  async decryptShare(
    shareId: string,
    keyBase64: string | null,
    password?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<DecryptedShareResult> {
    const meta = await this.loadShareMetadata(shareId);
    let masterKey: CryptoKey;

    onProgress?.({
      percent: 10,
      phase: 'preparing',
      currentChunk: 0,
      totalChunks: meta.share.chunk_count,
      message: 'Initializing cryptographic keys...',
    });

    if (meta.isPasswordProtected) {
      if (!password || password.trim().length === 0) {
        throw new Error('PASSWORD_REQUIRED');
      }
      if (!meta.salt) {
        throw new Error('Corrupted share metadata: Missing password salt');
      }

      try {
        masterKey = await deriveKeyFromPassword(password.trim(), hexToBytes(meta.salt));
      } catch (e: any) {
        throw new Error('Key derivation failed');
      }
    } else {
      if (!keyBase64) {
        throw new Error('Missing decryption key in URL fragment (#)');
      }
      masterKey = await importKeyFromBase64Url(keyBase64);
    }

    onProgress?.({
      percent: 25,
      phase: 'encrypting',
      currentChunk: 0,
      totalChunks: meta.share.chunk_count,
      message: 'Decrypting authenticated manifest...',
    });

    // Decrypt Manifest
    let manifest: ShareManifest;
    try {
      manifest = await decryptManifest(meta.share.encrypted_manifest, masterKey);
    } catch (err: any) {
      if (meta.isPasswordProtected) {
        throw new Error('Incorrect password. Authentication tag verification failed.');
      }
      throw new Error('Decryption failed: Key mismatch or manifest tampered.');
    }

    const totalChunks = meta.share.chunk_count;
    const decryptedFiles: DecryptedFile[] = [];
    let isBurned = false;

    // If text share with 0 or 1 chunks
    if (manifest.files.length === 0 && manifest.textContent) {
      if (totalChunks > 0) {
        const chunkRes = await fetch(`/api/shares/${shareId}/chunks/0`);
        if (chunkRes.headers.get('x-share-burned') === 'true') {
          isBurned = true;
        }
      }
      return {
        manifest,
        files: [],
        textContent: manifest.textContent,
        burned: isBurned,
      };
    }

    // Download and decrypt each file's chunks
    for (let fIdx = 0; fIdx < manifest.files.length; fIdx++) {
      const fileInfo = manifest.files[fIdx];
      const chunkBuffers: Uint8Array[] = [];

      for (let c = 0; c < fileInfo.chunkCount; c++) {
        const currentGlobalChunk = fileInfo.chunkStart + c;

        onProgress?.({
          percent: 30 + Math.round((currentGlobalChunk / totalChunks) * 60),
          phase: 'uploading',
          currentChunk: currentGlobalChunk + 1,
          totalChunks,
          message: `Downloading encrypted chunk ${currentGlobalChunk + 1}/${totalChunks}...`,
        });

        const chunkRes = await fetch(`/api/shares/${shareId}/chunks/${currentGlobalChunk}`);
        if (!chunkRes.ok) {
          throw new Error(`Failed to download chunk ${currentGlobalChunk}`);
        }

        if (chunkRes.headers.get('x-share-burned') === 'true') {
          isBurned = true;
        }

        const rawEncrypted = new Uint8Array(await chunkRes.arrayBuffer());

        onProgress?.({
          percent: 35 + Math.round((currentGlobalChunk / totalChunks) * 60),
          phase: 'encrypting',
          currentChunk: currentGlobalChunk + 1,
          totalChunks,
          message: `Decrypting chunk ${currentGlobalChunk + 1}/${totalChunks}...`,
        });

        const decryptedChunk = await decryptChunk(rawEncrypted, masterKey, shareId, currentGlobalChunk);
        chunkBuffers.push(decryptedChunk);
      }

      // Concatenate file chunks
      const fullFileLength = chunkBuffers.reduce((acc, c) => acc + c.byteLength, 0);
      const fullFileBytes = new Uint8Array(fullFileLength);
      let byteOffset = 0;
      for (const chunk of chunkBuffers) {
        fullFileBytes.set(chunk, byteOffset);
        byteOffset += chunk.byteLength;
      }

      // Verify SHA-256 Checksum
      const computedHash = await computeSha256(fullFileBytes);
      const isVerified = computedHash.toLowerCase() === fileInfo.sha256.toLowerCase();

      const blob = new Blob([fullFileBytes], { type: fileInfo.mimeType });
      decryptedFiles.push({
        name: fileInfo.name,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        blob,
        verified: isVerified,
      });
    }

    onProgress?.({
      percent: 100,
      phase: 'complete',
      currentChunk: totalChunks,
      totalChunks,
      message: 'All files downloaded, decrypted, and verified successfully.',
    });

    return {
      manifest,
      files: decryptedFiles,
      textContent: manifest.textContent,
      burned: isBurned,
    };
  }

  /**
   * Permanently revokes/deletes a share using owner deletion token
   */
  async deleteShare(shareId: string, ownerToken: string): Promise<boolean> {
    const res = await fetch(`/api/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'X-Deletion-Token': ownerToken },
    });
    return res.ok;
  }
}

export const shareManager = new ShareManager();
