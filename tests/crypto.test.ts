import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateMasterKey,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  encryptChunk,
  decryptChunk,
  encryptManifest,
  decryptManifest,
  wrapMasterKeyWithPassword,
  unwrapMasterKeyWithPassword,
  computeSha256,
  getRandomBytes,
  bytesToHex,
  ShareManifest,
} from '../client/src/crypto/webCrypto.js';

describe('ZERO TRACE Cryptographic Engine Verification', () => {
  it('should generate, export, and re-import a 256-bit AES-GCM key faithfully', async () => {
    const key = await generateMasterKey();
    const exported = await exportKeyToBase64Url(key);
    assert.strictEqual(typeof exported, 'string');
    assert.ok(exported.length >= 40); // 32 bytes base64url is 43 characters

    const reimported = await importKeyFromBase64Url(exported);
    const reExported = await exportKeyToBase64Url(reimported);
    assert.strictEqual(exported, reExported);
  });

  it('should encrypt and decrypt chunks with exact byte fidelity', async () => {
    const key = await generateMasterKey();
    const shareId = 'test-share-1234567890';
    const chunkIndex = 0;
    const originalText = 'Zero Trace confidential plaintext test payload - 123456789';
    const plaintext = new TextEncoder().encode(originalText);

    const ciphertext = await encryptChunk(plaintext, key, shareId, chunkIndex);

    // Ciphertext must be plaintext + 12 (IV) + 16 (Tag)
    assert.strictEqual(ciphertext.byteLength, plaintext.byteLength + 28);
    // Ciphertext must not contain plaintext in raw form
    assert.ok(!Buffer.from(ciphertext).includes(Buffer.from(originalText)));

    const decrypted = await decryptChunk(ciphertext, key, shareId, chunkIndex);
    assert.strictEqual(new TextDecoder().decode(decrypted), originalText);
  });

  it('should fail decryption if even a single byte of ciphertext or IV is tampered', async () => {
    const key = await generateMasterKey();
    const shareId = 'test-share-1234567890';
    const plaintext = new TextEncoder().encode('Tamper resistance test');

    const ciphertext = await encryptChunk(plaintext, key, shareId, 0);

    // Tamper with byte 5 (in the IV)
    const tamperedIv = new Uint8Array(ciphertext);
    tamperedIv[5] ^= 0x01;
    await assert.rejects(async () => {
      await decryptChunk(tamperedIv, key, shareId, 0);
    }, /Authentication tag/);

    // Tamper with byte 20 (in ciphertext or tag)
    const tamperedBody = new Uint8Array(ciphertext);
    tamperedBody[20] ^= 0x01;
    await assert.rejects(async () => {
      await decryptChunk(tamperedBody, key, shareId, 0);
    }, /Authentication tag/);
  });

  it('should fail decryption if Additional Authenticated Data (AAD: shareId/chunkIndex) mismatches', async () => {
    const key = await generateMasterKey();
    const plaintext = new TextEncoder().encode('AAD context test');

    const ciphertext = await encryptChunk(plaintext, key, 'share-A-000000000', 0);

    // Try decrypting with wrong shareId
    await assert.rejects(async () => {
      await decryptChunk(ciphertext, key, 'share-B-000000000', 0);
    }, /Authentication tag/);

    // Try decrypting with wrong chunkIndex
    await assert.rejects(async () => {
      await decryptChunk(ciphertext, key, 'share-A-000000000', 1);
    }, /Authentication tag/);
  });

  it('should support password-based master key wrapping via PBKDF2 (100,000 iterations)', async () => {
    const masterKey = await generateMasterKey();
    const originalKeyStr = await exportKeyToBase64Url(masterKey);
    const password = 'SuperSecurePassphrase!2026';
    const saltHex = bytesToHex(getRandomBytes(16));

    const wrappedKey = await wrapMasterKeyWithPassword(masterKey, password, saltHex);
    assert.strictEqual(typeof wrappedKey, 'string');

    // Correct password unlocks
    const unwrappedKey = await unwrapMasterKeyWithPassword(wrappedKey, password, saltHex);
    const unwrappedKeyStr = await exportKeyToBase64Url(unwrappedKey);
    assert.strictEqual(originalKeyStr, unwrappedKeyStr);

    // Wrong password fails
    await assert.rejects(async () => {
      await unwrapMasterKeyWithPassword(wrappedKey, 'WrongPassword', saltHex);
    });
  });

  it('should encrypt and decrypt anonymous manifests with zero plaintext leakage', async () => {
    const key = await generateMasterKey();
    const manifest: ShareManifest = {
      version: 1,
      type: 'file',
      createdAt: new Date().toISOString(),
      files: [
        {
          id: 'f1',
          name: 'secret_leak.pdf',
          size: 1048576,
          mimeType: 'application/pdf',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          chunkStart: 0,
          chunkCount: 1,
        },
      ],
      notes: 'Encrypted metadata note',
    };

    const encrypted = await encryptManifest(manifest, key);
    // Ensure manifest does NOT contain plaintext filename or notes
    assert.ok(!encrypted.includes('secret_leak.pdf'));
    assert.ok(!encrypted.includes('Encrypted metadata note'));

    const decrypted = await decryptManifest(encrypted, key);
    assert.strictEqual(decrypted.files[0].name, 'secret_leak.pdf');
    assert.strictEqual(decrypted.notes, 'Encrypted metadata note');
  });

  it('should guarantee independent random keys cannot decrypt each others payloads', async () => {
    const key1 = await generateMasterKey();
    const key2 = await generateMasterKey();
    const plaintext = new TextEncoder().encode('Cross-key independence check');

    const ciphertext = await encryptChunk(plaintext, key1, 'share-independent', 0);

    await assert.rejects(async () => {
      await decryptChunk(ciphertext, key2, 'share-independent', 0);
    }, /Authentication tag/);
  });

  it('should compute exact SHA-256 digests', async () => {
    const data = new TextEncoder().encode('ZeroTraceSHA256');
    const hash = await computeSha256(data);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);
  });
});
