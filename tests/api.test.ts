import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { app } from '../server/src/index.js';
import { getDatabase } from '../server/src/db/index.js';
import { getStorageEngine } from '../server/src/storage/index.js';
import {
  generateMasterKey,
  exportKeyToBase64Url,
  encryptChunk,
  decryptChunk,
  encryptManifest,
  decryptManifest,
  ShareManifest,
} from '../client/src/crypto/webCrypto.js';

let server: http.Server;
let port: number;
let baseUrl: string;

before(async () => {
  await getDatabase();
  await getStorageEngine();

  await new Promise<void>((resolve) => {
    // Listen on dynamic ephemeral port for tests
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const db = await getDatabase();
  await db.close();
});

describe('ZERO TRACE REST API & Storage Verification', () => {
  it('should respond to /api/health with healthy status', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.service, 'zero-trace-backend');
  });

  it('should create an encrypted share and successfully upload/download encrypted chunks', async () => {
    const masterKey = await generateMasterKey();
    const ownerToken = 'owner-secure-token-abcdef123456';

    const manifest: ShareManifest = {
      version: 1,
      type: 'file',
      createdAt: new Date().toISOString(),
      files: [
        {
          id: 'f0',
          name: 'confidential.docx',
          size: 15,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sha256: 'fakehash123',
          chunkStart: 0,
          chunkCount: 1,
        },
      ],
    };

    const encryptedManifest = await encryptManifest(manifest, masterKey);

    // 1. Create Share
    const createRes = await fetch(`${baseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken,
        isPasswordProtected: false,
        isOneTime: false,
        maxDownloads: 5,
        expiresInSeconds: 3600,
        totalSizeBytes: 15,
        chunkCount: 1,
        encryptedManifest,
      }),
    });

    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    assert.ok(createData.shareId);
    const shareId = createData.shareId;

    // 2. Upload Encrypted Chunk
    const chunkPlaintext = new TextEncoder().encode('Confidential123');
    const encryptedChunk = await encryptChunk(chunkPlaintext, masterKey, shareId, 0);

    const uploadRes = await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: encryptedChunk,
    });
    assert.strictEqual(uploadRes.status, 200);

    // 3. Get Metadata
    const metaRes = await fetch(`${baseUrl}/api/shares/${shareId}`);
    assert.strictEqual(metaRes.status, 200);
    const metaData = await metaRes.json();
    assert.strictEqual(metaData.share.id, shareId);
    assert.strictEqual(metaData.share.chunk_count, 1);
    // Crucial: owner_token_hash must NEVER be exposed
    assert.strictEqual(metaData.share.owner_token_hash, undefined);

    // Decrypt manifest locally
    const decryptedManifest = await decryptManifest(metaData.share.encrypted_manifest, masterKey);
    assert.strictEqual(decryptedManifest.files[0].name, 'confidential.docx');

    // 4. Download Encrypted Chunk & Decrypt
    const downloadRes = await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`);
    assert.strictEqual(downloadRes.status, 200);
    const downloadedBuf = new Uint8Array(await downloadRes.arrayBuffer());

    const decryptedChunk = await decryptChunk(downloadedBuf, masterKey, shareId, 0);
    assert.strictEqual(new TextDecoder().decode(decryptedChunk), 'Confidential123');
  });

  it('should atomically burn a share marked as isOneTime after the first download', async () => {
    const masterKey = await generateMasterKey();
    const ownerToken = 'one-time-token-abcdef123456';

    const manifest: ShareManifest = {
      version: 1,
      type: 'info',
      createdAt: new Date().toISOString(),
      files: [],
      textContent: 'One time burned message',
    };
    const encryptedManifest = await encryptManifest(manifest, masterKey);

    const createRes = await fetch(`${baseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken,
        isPasswordProtected: false,
        isOneTime: true,
        maxDownloads: 1,
        expiresInSeconds: 3600,
        totalSizeBytes: 10,
        chunkCount: 1,
        encryptedManifest,
      }),
    });
    const { shareId } = await createRes.json();

    // Upload single chunk
    const encryptedChunk = await encryptChunk(new Uint8Array([1, 2, 3]), masterKey, shareId, 0);
    await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: encryptedChunk,
    });

    // First download succeeds and burns share
    const dl1 = await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`);
    assert.strictEqual(dl1.status, 200);
    assert.strictEqual(dl1.headers.get('x-share-burned'), 'true');

    // Second download MUST fail (404 / destroyed)
    const dl2 = await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`);
    assert.strictEqual(dl2.status, 404);

    // Metadata fetch MUST now return 404
    const metaRes = await fetch(`${baseUrl}/api/shares/${shareId}`);
    assert.strictEqual(metaRes.status, 404);
  });

  it('should allow share owner to permanently delete share with X-Deletion-Token, rejecting invalid tokens', async () => {
    const masterKey = await generateMasterKey();
    const ownerToken = 'my-secret-owner-token-999';

    const manifest: ShareManifest = {
      version: 1,
      type: 'file',
      createdAt: new Date().toISOString(),
      files: [],
    };
    const encryptedManifest = await encryptManifest(manifest, masterKey);

    const createRes = await fetch(`${baseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken,
        isPasswordProtected: false,
        isOneTime: false,
        maxDownloads: 0,
        expiresInSeconds: 3600,
        totalSizeBytes: 0,
        chunkCount: 0,
        encryptedManifest,
      }),
    });
    const { shareId } = await createRes.json();

    // Wrong deletion token should return 403 Forbidden
    const fakeDelRes = await fetch(`${baseUrl}/api/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'X-Deletion-Token': 'wrong-token-hacker' },
    });
    assert.strictEqual(fakeDelRes.status, 403);

    // Correct deletion token should return 200 OK
    const realDelRes = await fetch(`${baseUrl}/api/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'X-Deletion-Token': ownerToken },
    });
    assert.strictEqual(realDelRes.status, 200);

    // Share is now permanently deleted
    const metaRes = await fetch(`${baseUrl}/api/shares/${shareId}`);
    assert.strictEqual(metaRes.status, 404);
  });
});
