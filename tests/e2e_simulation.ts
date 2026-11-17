import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { app } from '../server/src/index.js';
import { getDatabase } from '../server/src/db/index.js';
import { getStorageEngine } from '../server/src/storage/index.js';
import {
  generateMasterKey,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  encryptChunk,
  decryptChunk,
  encryptManifest,
  decryptManifest,
  deriveKeyFromPassword,
  computeSha256,
  getRandomBytes,
  bytesToHex,
  hexToBytes,
  ShareManifest,
} from '../client/src/crypto/webCrypto.js';

let server: http.Server;
let port: number;
let baseUrl: string;

before(async () => {
  await getDatabase();
  await getStorageEngine();

  await new Promise<void>((resolve) => {
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

describe('ZERO TRACE Dual-Browser End-to-End Simulation', () => {
  it('Simulates Browser A (Uploader) and Browser B (Recipient) anonymous E2EE workflow', async () => {
    // ==========================================
    // BROWSER A: Uploader Session (No Account)
    // ==========================================
    const originalPdfText = '%PDF-1.7 Confidential Report on Privacy Infrastructure 2026';
    const originalPdfBytes = new TextEncoder().encode(originalPdfText);
    const pdfSha256 = await computeSha256(originalPdfBytes);

    const originalImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
    const imageSha256 = await computeSha256(originalImageBytes);

    // 1. Browser A generates 256-bit AES master key in memory
    const masterKeyA = await generateMasterKey();
    const rawKeyBase64A = await exportKeyToBase64Url(masterKeyA);
    const ownerTokenA = bytesToHex(getRandomBytes(32));

    // 2. Browser A constructs anonymous manifest
    const manifestA: ShareManifest = {
      version: 1,
      type: 'file',
      createdAt: new Date().toISOString(),
      files: [
        {
          id: 'f_pdf',
          name: 'audit_report.pdf',
          size: originalPdfBytes.byteLength,
          mimeType: 'application/pdf',
          sha256: pdfSha256,
          chunkStart: 0,
          chunkCount: 1,
        },
        {
          id: 'f_img',
          name: 'secret_diagram.png',
          size: originalImageBytes.byteLength,
          mimeType: 'image/png',
          sha256: imageSha256,
          chunkStart: 1,
          chunkCount: 1,
        },
      ],
      notes: 'Browser A client-encrypted note',
    };

    // 3. Browser A encrypts manifest locally
    const encryptedManifestA = await encryptManifest(manifestA, masterKeyA);

    // 4. Browser A posts share metadata
    const initRes = await fetch(`${baseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken: ownerTokenA,
        isPasswordProtected: false,
        isOneTime: false,
        maxDownloads: 3,
        expiresInSeconds: 3600,
        totalSizeBytes: originalPdfBytes.byteLength + originalImageBytes.byteLength,
        chunkCount: 2,
        encryptedManifest: encryptedManifestA,
      }),
    });
    assert.strictEqual(initRes.status, 201);
    const { shareId } = await initRes.json();

    // 5. Browser A encrypts chunks with AES-GCM and unique IVs
    const chunk0Cipher = await encryptChunk(originalPdfBytes, masterKeyA, shareId, 0);
    const chunk1Cipher = await encryptChunk(originalImageBytes, masterKeyA, shareId, 1);

    // 6. Browser A streams encrypted chunks to server
    const up0 = await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunk0Cipher,
    });
    assert.strictEqual(up0.status, 200);

    const up1 = await fetch(`${baseUrl}/api/shares/${shareId}/chunks/1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunk1Cipher,
    });
    assert.strictEqual(up1.status, 200);

    // Browser A generates sharing link:
    const shareLink = `${baseUrl}/#share=${shareId}&key=${rawKeyBase64A}`;

    // ==========================================
    // BROWSER B: Recipient Session (Zero Auth)
    // ==========================================
    // Browser B receives link, parses fragment locally:
    const fragment = shareLink.split('#')[1];
    const params = new URLSearchParams(fragment);
    const recipientShareId = params.get('share')!;
    const recipientKeyBase64 = params.get('key')!;

    assert.strictEqual(recipientShareId, shareId);
    assert.strictEqual(recipientKeyBase64, rawKeyBase64A);

    // 1. Browser B fetches public metadata (without transmitting key)
    const metaRes = await fetch(`${baseUrl}/api/shares/${recipientShareId}`);
    assert.strictEqual(metaRes.status, 200);
    const metaData = await metaRes.json();

    // 2. Browser B imports key and decrypts manifest locally
    const masterKeyB = await importKeyFromBase64Url(recipientKeyBase64);
    const decryptedManifestB = await decryptManifest(metaData.share.encrypted_manifest, masterKeyB);

    assert.strictEqual(decryptedManifestB.files.length, 2);
    assert.strictEqual(decryptedManifestB.files[0].name, 'audit_report.pdf');
    assert.strictEqual(decryptedManifestB.files[1].name, 'secret_diagram.png');
    assert.strictEqual(decryptedManifestB.notes, 'Browser A client-encrypted note');

    // 3. Browser B downloads encrypted chunks and decrypts in memory
    const dl0 = await fetch(`${baseUrl}/api/shares/${recipientShareId}/chunks/0`);
    assert.strictEqual(dl0.status, 200);
    const dl0Cipher = new Uint8Array(await dl0.arrayBuffer());
    const dl0Plain = await decryptChunk(dl0Cipher, masterKeyB, recipientShareId, 0);

    // Verify PDF byte equality and SHA-256 integrity
    assert.strictEqual(new TextDecoder().decode(dl0Plain), originalPdfText);
    const computedPdfSha = await computeSha256(dl0Plain);
    assert.strictEqual(computedPdfSha, pdfSha256);

    const dl1 = await fetch(`${baseUrl}/api/shares/${recipientShareId}/chunks/1`);
    assert.strictEqual(dl1.status, 200);
    const dl1Cipher = new Uint8Array(await dl1.arrayBuffer());
    const dl1Plain = await decryptChunk(dl1Cipher, masterKeyB, recipientShareId, 1);

    // Verify Image byte equality and SHA-256 integrity
    assert.deepStrictEqual(Array.from(dl1Plain), Array.from(originalImageBytes));
    const computedImgSha = await computeSha256(dl1Plain);
    assert.strictEqual(computedImgSha, imageSha256);
  });

  it('Simulates Password-Protected E2EE workflow with PBKDF2 (100k rounds)', async () => {
    const secretPassphrase = 'CorrectHorseBatteryStaple!2026';
    const saltHex = bytesToHex(getRandomBytes(16));
    const ownerToken = bytesToHex(getRandomBytes(32));
    const privateNote = 'Confidential bank routing instructions';

    // 1. Browser A derives key from passphrase + salt
    const masterKeyA = await deriveKeyFromPassword(secretPassphrase, hexToBytes(saltHex));

    const manifestA: ShareManifest = {
      version: 1,
      type: 'info',
      createdAt: new Date().toISOString(),
      files: [],
      textContent: privateNote,
    };
    const encryptedManifestA = await encryptManifest(manifestA, masterKeyA);

    const createRes = await fetch(`${baseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken,
        isPasswordProtected: true,
        passwordSalt: saltHex,
        isOneTime: true,
        maxDownloads: 1,
        expiresInSeconds: 3600,
        totalSizeBytes: privateNote.length,
        chunkCount: 1,
        encryptedManifest: encryptedManifestA,
      }),
    });
    const { shareId } = await createRes.json();

    const chunkCipher = await encryptChunk(new TextEncoder().encode(privateNote), masterKeyA, shareId, 0);
    await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunkCipher,
    });

    // 2. Browser B opens link `#share=<id>&pwd=1`
    const metaRes = await fetch(`${baseUrl}/api/shares/${shareId}`);
    const metaData = await metaRes.json();
    assert.strictEqual(metaData.share.is_password_protected, true);
    assert.strictEqual(metaData.share.password_salt, saltHex);

    // 3. Browser B enters WRONG password -> Decryption fails
    const wrongKey = await deriveKeyFromPassword('WrongPassword123', hexToBytes(metaData.share.password_salt));
    await assert.rejects(async () => {
      await decryptManifest(metaData.share.encrypted_manifest, wrongKey);
    }, /Authentication tag mismatch/);

    // 4. Browser B enters CORRECT password -> Decryption succeeds
    const correctKey = await deriveKeyFromPassword(secretPassphrase, hexToBytes(metaData.share.password_salt));
    const decryptedManifestB = await decryptManifest(metaData.share.encrypted_manifest, correctKey);
    assert.strictEqual(decryptedManifestB.textContent, privateNote);

    // 5. Browser B downloads chunk and verifies burn on read
    const chunkRes = await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`);
    assert.strictEqual(chunkRes.status, 200);
    assert.strictEqual(chunkRes.headers.get('x-share-burned'), 'true');

    // 6. Subsequence access should return 404 because share was burned
    const postBurnRes = await fetch(`${baseUrl}/api/shares/${shareId}`);
    assert.strictEqual(postBurnRes.status, 404);
  });
});
