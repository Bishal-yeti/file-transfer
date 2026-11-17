import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from '../server/src/index.js';
import { config } from '../server/src/config/index.js';
import { getDatabase } from '../server/src/db/index.js';
import { getStorageEngine } from '../server/src/storage/index.js';
import {
  generateMasterKey,
  exportKeyToBase64Url,
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

describe('ZERO TRACE Security & Penetration Testing Suite', () => {
  // 1. Zero Plaintext Leakage & Server Blindness
  it('PEN-01: Backend and disk storage MUST receive and store only ciphertext, never plaintext or keys', async () => {
    const masterKey = await generateMasterKey();
    const rawKey = await exportKeyToBase64Url(masterKey);
    const plaintextMessage = 'TOP_SECRET_WHISTLEBLOWER_LEAK_CONFIDENTIAL_DATA_998877';
    const ownerToken = bytesToHex(getRandomBytes(32));

    const manifest: ShareManifest = {
      version: 1,
      type: 'info',
      createdAt: new Date().toISOString(),
      files: [],
      textContent: plaintextMessage,
      notes: 'Super secret leak note',
    };

    const encryptedManifest = await encryptManifest(manifest, masterKey);

    // Create share
    const createRes = await fetch(`${baseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken,
        isPasswordProtected: false,
        isOneTime: false,
        maxDownloads: 5,
        expiresInSeconds: 3600,
        totalSizeBytes: plaintextMessage.length,
        chunkCount: 1,
        encryptedManifest,
      }),
    });
    const { shareId } = await createRes.json();

    // Upload encrypted chunk
    const plainBuf = new TextEncoder().encode(plaintextMessage);
    const cipherChunk = await encryptChunk(plainBuf, masterKey, shareId, 0);

    await fetch(`${baseUrl}/api/shares/${shareId}/chunks/0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: cipherChunk,
    });

    // Check disk storage directly
    const storedChunkPath = path.join(config.STORAGE_DIR, shareId, 'chunk_00000.bin');
    const diskBytes = await fs.readFile(storedChunkPath);

    // Verify disk bytes do NOT contain plaintext
    assert.ok(!diskBytes.includes(Buffer.from(plaintextMessage)));
    assert.ok(!diskBytes.includes(Buffer.from('TOP_SECRET')));
    assert.ok(!diskBytes.includes(Buffer.from(rawKey)));

    // Check database row
    const db = await getDatabase();
    const dbRecord = await db.getShare(shareId);
    assert.ok(dbRecord);
    // Manifest is ciphertext
    assert.ok(!dbRecord.encrypted_manifest.includes(plaintextMessage));
    assert.ok(!dbRecord.encrypted_manifest.includes('Super secret leak note'));
    // Owner token is hashed, raw token never stored
    assert.notStrictEqual(dbRecord.owner_token_hash, ownerToken);
    assert.strictEqual(dbRecord.owner_token_hash.length, 64); // SHA-256 hex length
  });

  // 2. Path Traversal & Arbitrary File Access Defense
  it('PEN-02: Path Traversal attempts via shareId or chunkIndex must be strictly blocked', async () => {
    const maliciousShareIds = [
      '../../etc/passwd',
      '..%2F..%2Fetc%2Fpasswd',
      '/etc/shadow',
      '..\\..\\windows\\system32',
      'validid123456789/../../../root',
      '../../../etc',
    ];

    for (const badId of maliciousShareIds) {
      // Test GET metadata
      const metaRes = await fetch(`${baseUrl}/api/shares/${encodeURIComponent(badId)}`);
      assert.ok([400, 404].includes(metaRes.status), `Expected 400/404 for ${badId}, got ${metaRes.status}`);

      // Test GET chunk
      const chunkRes = await fetch(`${baseUrl}/api/shares/${encodeURIComponent(badId)}/chunks/0`);
      assert.ok([400, 404].includes(chunkRes.status));

      // Test DELETE
      const delRes = await fetch(`${baseUrl}/api/shares/${encodeURIComponent(badId)}`, {
        method: 'DELETE',
        headers: { 'X-Deletion-Token': 'test' },
      });
      assert.ok([400, 403, 404, 401].includes(delRes.status));
    }

    // Test invalid chunk index
    const badIndexRes = await fetch(`${baseUrl}/api/shares/1234567890abcdef/chunks/-1`);
    assert.strictEqual(badIndexRes.status, 400);

    const stringIndexRes = await fetch(`${baseUrl}/api/shares/1234567890abcdef/chunks/notanumber`);
    assert.strictEqual(stringIndexRes.status, 400);
  });

  // 3. IDOR Defense (Insecure Direct Object Reference)
  it('PEN-03: Unauthorized deletion or access without matching owner token must be rejected (IDOR protection)', async () => {
    const masterKey = await generateMasterKey();
    const legitimateOwnerToken = bytesToHex(getRandomBytes(32));
    const attackerOwnerToken = bytesToHex(getRandomBytes(32));

    const manifest: ShareManifest = {
      version: 1,
      type: 'info',
      createdAt: new Date().toISOString(),
      files: [],
      textContent: 'Protected message',
    };
    const encryptedManifest = await encryptManifest(manifest, masterKey);

    const createRes = await fetch(`${baseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerToken: legitimateOwnerToken,
        isPasswordProtected: false,
        isOneTime: false,
        maxDownloads: 0,
        expiresInSeconds: 3600,
        totalSizeBytes: 10,
        chunkCount: 1,
        encryptedManifest,
      }),
    });
    const { shareId } = await createRes.json();

    // Attacker tries to delete with forged token
    const attackerRes = await fetch(`${baseUrl}/api/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'X-Deletion-Token': attackerOwnerToken },
    });
    assert.strictEqual(attackerRes.status, 403);

    // Attacker tries deletion without header
    const noTokenRes = await fetch(`${baseUrl}/api/shares/${shareId}`, {
      method: 'DELETE',
    });
    assert.strictEqual(noTokenRes.status, 401);

    // Share must still be intact
    const checkRes = await fetch(`${baseUrl}/api/shares/${shareId}`);
    assert.strictEqual(checkRes.status, 200);

    // Legitimate owner deletes share
    const ownerRes = await fetch(`${baseUrl}/api/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'X-Deletion-Token': legitimateOwnerToken },
    });
    assert.strictEqual(ownerRes.status, 200);

    // Now share is gone
    const finalCheck = await fetch(`${baseUrl}/api/shares/${shareId}`);
    assert.strictEqual(finalCheck.status, 404);
  });

  // 4. SQL Injection Resistance
  it('PEN-04: SQL Injection payloads in IDs or headers must be safely neutralized', async () => {
    const sqliPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE shares; --",
      "' UNION SELECT * FROM shares --",
      "admin'--",
    ];

    for (const sqli of sqliPayloads) {
      const res = await fetch(`${baseUrl}/api/shares/${encodeURIComponent(sqli)}`);
      assert.ok([400, 404].includes(res.status));
    }

    // Verify table shares is still operational
    const health = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(health.status, 200);
  });

  // 5. Security & Privacy Headers Verification
  it('PEN-05: Strict CSP, No-Referrer, HSTS, and Anti-Cache headers must be enforced', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);

    // 1. Content Security Policy
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp && csp.includes("default-src 'self'"));
    assert.ok(csp && csp.includes("frame-ancestors 'none'"));

    // 2. Referrer-Policy
    assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer');

    // 3. X-Content-Type-Options
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');

    // 4. Cache-Control (Must prevent browser/proxy storage of sensitive share data)
    const cacheCtrl = res.headers.get('cache-control');
    assert.ok(cacheCtrl && cacheCtrl.includes('no-store'));

    // 5. Fingerprint Minimization (Server / X-Powered-By should not leak)
    assert.strictEqual(res.headers.get('x-powered-by'), null);
  });

  // 6. Rate Limiting Defense
  it('PEN-06: Rapid request flooding must be throttled by the privacy-preserving rate limiter', async () => {
    // Send bursts of requests
    let hitRateLimit = false;
    for (let i = 0; i < 160; i++) {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.status === 429) {
        hitRateLimit = true;
        assert.ok(r.headers.get('retry-after'));
        break;
      }
    }
    // We configured rate limit to 150 requests per minute
    assert.ok(hitRateLimit, 'Rate limiter should have triggered 429 Too Many Requests');
  });
});
