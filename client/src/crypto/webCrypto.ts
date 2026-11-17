/**
 * ZERO TRACE Cryptographic Engine
 *
 * Implements genuine end-to-end client-side authenticated encryption using
 * the standard Web Crypto API (AES-256-GCM + PBKDF2-SHA-256).
 *
 * Key Properties:
 * 1. AES-256-GCM with 128-bit authentication tag for authenticated encryption.
 * 2. 96-bit (12-byte) cryptographically secure random IV generated per encryption.
 * 3. Additional Authenticated Data (AAD) binding ciphertext to shareId and chunkIndex.
 * 4. PBKDF2-HMAC-SHA-256 with 100,000 iterations for password-derived key wrapping.
 * 5. Pre-encryption SHA-256 integrity hash verification.
 */

// Helper: Cross-environment crypto subtle access (Browser window.crypto.subtle or Node.js global crypto.subtle)
export const getSubtle = (): SubtleCrypto => {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (subtle) is unavailable in this environment');
};

export const getRandomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    throw new Error('Secure random generation unavailable');
  }
  return bytes;
};

// Base64URL encoding/decoding (RFC 4648 Section 5 - safe for URL fragments)
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa !== 'undefined'
      ? btoa(binary)
      : (globalThis as any).Buffer?.from(binary, 'binary').toString('base64') || '';
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary =
    typeof atob !== 'undefined'
      ? atob(base64)
      : (globalThis as any).Buffer?.from(base64, 'base64').toString('binary') || '';
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// 1. Generate 256-bit AES-GCM Master Key
export async function generateMasterKey(): Promise<CryptoKey> {
  const subtle = getSubtle();
  return await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

// Export raw key to base64url string
export async function exportKeyToBase64Url(key: CryptoKey): Promise<string> {
  const subtle = getSubtle();
  const raw = await subtle.exportKey('raw', key);
  return bytesToBase64Url(new Uint8Array(raw));
}

// Import raw key from base64url string
export async function importKeyFromBase64Url(base64url: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const rawBytes = base64UrlToBytes(base64url);
  return await subtle.importKey('raw', rawBytes as BufferSource, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

// 2. Password Key Derivation (PBKDF2-HMAC-SHA-256, 100,000 iterations)
export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const passwordKey = await subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// Encrypt Master Key with Password-derived KEK
export async function wrapMasterKeyWithPassword(
  masterKey: CryptoKey,
  password: string,
  saltHex: string
): Promise<string> {
  const subtle = getSubtle();
  const salt = hexToBytes(saltHex);
  const kek = await deriveKeyFromPassword(password, salt);

  const rawMasterKey = await subtle.exportKey('raw', masterKey);
  const iv = getRandomBytes(12);

  const encryptedRawKey = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    rawMasterKey as BufferSource
  );

  // Combine IV (12 bytes) + Encrypted Master Key (32 bytes + 16 bytes tag = 48 bytes) = 60 bytes total
  const combined = new Uint8Array(iv.length + encryptedRawKey.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedRawKey), iv.length);

  return bytesToBase64Url(combined);
}

// Decrypt Master Key with Password
export async function unwrapMasterKeyWithPassword(
  wrappedKeyBase64: string,
  password: string,
  saltHex: string
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const salt = hexToBytes(saltHex);
  const kek = await deriveKeyFromPassword(password, salt);

  const combined = base64UrlToBytes(wrappedKeyBase64);
  if (combined.length < 28) {
    throw new Error('Invalid wrapped key format');
  }

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const rawMasterKey = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    ciphertext as BufferSource
  );

  return await subtle.importKey('raw', rawMasterKey, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

// 3. Chunk Encryption (AES-256-GCM with AAD binding)
export async function encryptChunk(
  plaintext: Uint8Array,
  key: CryptoKey,
  shareId: string,
  chunkIndex: number
): Promise<Uint8Array> {
  const subtle = getSubtle();
  const iv = getRandomBytes(12);
  const aad = new TextEncoder().encode(`${shareId}:${chunkIndex}`);

  const ciphertextWithTag = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      additionalData: aad as BufferSource,
      tagLength: 128,
    },
    key,
    plaintext as BufferSource
  );

  // Format: [12 bytes IV][Ciphertext + 16 bytes GMAC Tag]
  const result = new Uint8Array(12 + ciphertextWithTag.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertextWithTag), 12);
  return result;
}

// Chunk Decryption with Tamper Verification
export async function decryptChunk(
  encryptedPayload: Uint8Array,
  key: CryptoKey,
  shareId: string,
  chunkIndex: number
): Promise<Uint8Array> {
  const subtle = getSubtle();

  if (encryptedPayload.byteLength < 28) {
    throw new Error('Encrypted payload too short (missing IV or authentication tag)');
  }

  const iv = encryptedPayload.slice(0, 12);
  const ciphertextWithTag = encryptedPayload.slice(12);
  const aad = new TextEncoder().encode(`${shareId}:${chunkIndex}`);

  try {
    const plaintext = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: aad as BufferSource,
        tagLength: 128,
      },
      key,
      ciphertextWithTag as BufferSource
    );
    return new Uint8Array(plaintext);
  } catch (err: any) {
    throw new Error('Decryption failed: Authentication tag verification error or invalid key.');
  }
}

// 4. Manifest Encryption / Decryption
export interface ShareFileEntry {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
  chunkStart: number;
  chunkCount: number;
}

export interface ShareManifest {
  version: number;
  type: 'file' | 'media' | 'info';
  createdAt: string;
  files: ShareFileEntry[];
  textContent?: string;
  notes?: string;
  wrappedKey?: string; // If password protected
}

export async function encryptManifest(manifest: ShareManifest, key: CryptoKey): Promise<string> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const jsonStr = JSON.stringify(manifest);
  const plaintext = enc.encode(jsonStr);

  const iv = getRandomBytes(12);
  const ciphertextWithTag = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
    key,
    plaintext as BufferSource
  );

  const combined = new Uint8Array(12 + ciphertextWithTag.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextWithTag), 12);

  return bytesToBase64Url(combined);
}

export async function decryptManifest(
  encryptedBase64: string,
  key: CryptoKey
): Promise<ShareManifest> {
  const subtle = getSubtle();
  const combined = base64UrlToBytes(encryptedBase64);

  if (combined.length < 28) {
    throw new Error('Invalid manifest ciphertext');
  }

  const iv = combined.slice(0, 12);
  const ciphertextWithTag = combined.slice(12);

  try {
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 },
      key,
      ciphertextWithTag as BufferSource
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted)) as ShareManifest;
  } catch (err) {
    throw new Error('Failed to decrypt manifest: Authentication tag mismatch or incorrect key.');
  }
}

// 5. SHA-256 Checksum Calculation
export async function computeSha256(data: Uint8Array): Promise<string> {
  const subtle = getSubtle();
  const hashBuf = await subtle.digest('SHA-256', data as BufferSource);
  return bytesToHex(new Uint8Array(hashBuf));
}
