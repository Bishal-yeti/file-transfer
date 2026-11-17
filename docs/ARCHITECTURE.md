# ZERO TRACE: Architecture, Cryptographic Design & Threat Model

**Version:** 1.0.0-PROD  
**Status:** Approved Architecture Specification  
**Classification:** Public Security Whitepaper  

---

## 1. System Overview & Core Philosophy

**ZERO TRACE** is an anonymous, zero-knowledge, end-to-end encrypted (E2EE) sharing platform engineered for untrusted network environments and untrusted server infrastructure.

The core principle of ZERO TRACE is **Zero Knowledge by Mathematical Guarantee**:
1. **The Server is Untrusted**: Even in the event of full server compromise, database dump, or cloud subpoena, stored content cannot be decrypted by any party lacking the client-side decryption key.
2. **Zero Metadata Leakage**: Content names, MIME types, file sizes, and plaintext contents are encrypted client-side inside an authenticated manifest before leaving the browser.
3. **No Identity Footprint**: No accounts, cookies, tracking pixels, browser fingerprinting, email addresses, or phone numbers.
4. **URL Fragment Key Isolation**: Decryption keys reside exclusively in the RFC 3986 URI fragment (`#...`), which standard web browsers never transmit to the server in HTTP request headers or request URIs.

---

## 2. System Architecture & Components

```
+-----------------------------------------------------------------------------+
|                                CLIENT BROWSER                               |
|                                                                             |
|  +--------------------+   +-----------------------+   +------------------+  |
|  | Web Crypto Engine  |   | File Chunking Engine  |   | UI/UX Interface  |  |
|  | AES-256-GCM        |   | 2MB Chunk Pipeline    |   | Files / Media /  |  |
|  | PBKDF2 / Argon2id  |   | Streaming Decryptor   |   | Information      |  |
|  +--------------------+   +-----------------------+   +------------------+  |
+-----------------------------------------------------------------------------+
               |                                           ^
               | POST /api/shares                          | GET /api/shares/:id
               | POST /api/shares/:id/chunks               | GET /api/shares/:id/chunks/:i
               | [Ciphertext & Tag Only]                   | [Ciphertext Only]
               v                                           |
+-----------------------------------------------------------------------------+
|                            ZERO TRACE BACKEND API                           |
|                                                                             |
|  +--------------------+   +-----------------------+   +------------------+  |
|  | Strict Security MW |   | Lifecycle & Deletion  |   | Rate Limiter     |  |
|  | CSP / CORS / HSTS  |   | Auto-Burn & Expiry    |   | Token Bucket     |  |
|  +--------------------+   +-----------------------+   +------------------+  |
+-----------------------------------------------------------------------------+
               |                                           |
               v                                           v
+-------------------------------+           +---------------------------------+
|       DATABASE (PostgreSQL)    |           |    ENCRYPTED BLOB STORAGE       |
|                               |           |  (Local Encrypted Store / S3)   |
| - Random Share ID (UUIDv4/Hex)|           |                                 |
| - SHA-256 Hashed Owner Token  |           | - /storage/:share_id/manifest   |
| - Expiration & Burn Counters  |           | - /storage/:share_id/chunk_000  |
| - Salt (if password protected)|           | - /storage/:share_id/chunk_001  |
| - Ciphertext chunk counts     |           |                                 |
+-------------------------------+           +---------------------------------+
```

### Component Roles

1. **Client (Browser Application)**:
   - Evaluates Web Crypto API (`window.crypto.subtle`) natively.
   - Generates high-entropy master keys (256-bit cryptographically secure random bytes via `crypto.getRandomValues`).
   - Encrypts payload and file metadata locally.
   - Parses share URL fragments locally: `https://domain.tld/share/<shareId>#key=<rawBase64Key>&iv=<rawBase64IV>`.
2. **Backend API (Node.js & TypeScript)**:
   - Serves as an unprivileged, blind broker of ciphertext.
   - Enforces upload quotas, rate limits, access control tokens (deletion token verification via constant-time HMAC/SHA-256 comparison).
   - Manages expiration timers and atomic burn counters.
3. **Database Layer (PostgreSQL / SQLite fallback)**:
   - Persists share records with minimal anonymous metadata.
   - Never stores encryption keys, plaintexts, or unhashed secrets.
4. **Encrypted Blob Storage (Local Secure Storage / S3 MinIO)**:
   - Stores raw ciphertext chunks and encrypted manifests.
   - Enforces strict path traversal defenses and UUID isolation.

---

## 3. Cryptographic Specification

### 3.1 Cipher Suite & Parameters
- **Symmetric Cipher**: `AES-256-GCM` (Galois/Counter Mode, 256-bit key).
- **Authentication Tag**: 128-bit (16-byte) GMAC tag appended to ciphertext.
- **Nonce (IV) Generation**: 96-bit (12-byte) cryptographically secure pseudorandom numbers per encryption operation.
- **Nonce Uniqueness**: Every chunk and manifest receives an independent unique IV to prevent nonce reuse catastrophic failures in GCM.
- **Key Derivation (Password-Protected Shares)**:
  - Default: `PBKDF2-HMAC-SHA-256` with 100,000 iterations (W3C Web Crypto standard across desktop, mobile, and Tor Browser).
  - Salt: 16-byte cryptographically secure random salt generated on client.
  - Salt is public and passed to server, but master key is never derivable without the user password.

### 3.2 Manifest & Chunked File Protocol
For streaming reliability, memory safety, and large file capability without exhausting browser memory:
1. **File Manifest**:
   Contains encrypted JSON object:
   ```json
   {
     "version": 1,
     "type": "file" | "media" | "text",
     "files": [
       {
         "id": "f_0",
         "name": "financial_report.pdf",
         "mimeType": "application/pdf",
         "size": 18452102,
         "sha256": "4a7d...",
         "totalChunks": 9
       }
     ],
     "createdAt": "2026-11-17T13:00:00.000Z",
     "notes": "Optional client-encrypted note"
   }
   ```
2. **Chunk Division**:
   - Files are partitioned into chunks of 2,097,152 bytes (2 MB).
   - Each chunk $C_i$ is encrypted independently:
     $$\text{Ciphertext}_i = \text{AES-256-GCM}_{K}(\text{Chunk}_i, \text{IV}_i, \text{AAD}_i)$$
   - Additional Authenticated Data (AAD): Bound to `share_id || file_id || chunk_index` to prevent chunk swap or chunk truncation attacks.
   - IV generation: Each chunk contains a distinct random 96-bit IV stored in the chunk header (first 12 bytes of uploaded chunk payload).

### 3.3 Key Sharing & URI Fragment Mechanics
The share link has the format:
```
https://zero-trace.org/share/68b8e0b6-f28e-4a47-a124-7471415e98bb#key=u83h9x_...&type=direct
```
- By Section 3.5 of RFC 3986, the fragment identifier `#...` is strictly evaluated by the user agent (client) and **is never included in the HTTP request line or Host headers**.
- To prevent accidental Referrer leakage, strict HTTP headers are sent:
  ```http
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...
  ```

### 3.4 Owner Deletion Token
Upon successful upload, the client generates a 256-bit random secret (`ownerToken`).
- Client receives: `ownerToken`
- Client sends: `ownerToken` once during creation.
- Server computes:
  $$\text{StoredHash} = \text{HMAC-SHA-256}(\text{ServerSecret}, \text{ownerToken})$$
- Only the hash is saved. When the owner requests deletion (`DELETE /api/shares/:id`), the client provides the token in the `X-Deletion-Token` header.
- Server validates using constant-time comparison (`crypto.timingSafeEqual`).
- If matched, the share record and all encrypted blobs are immediately purged.

---

## 4. Database Schema (Zero Metadata)

```sql
CREATE TABLE IF NOT EXISTS shares (
    id VARCHAR(64) PRIMARY KEY,
    owner_token_hash VARCHAR(128) NOT NULL,
    is_password_protected BOOLEAN NOT NULL DEFAULT FALSE,
    password_salt VARCHAR(64) NULL,
    is_one_time BOOLEAN NOT NULL DEFAULT FALSE,
    max_downloads INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    total_size_bytes BIGINT NOT NULL,
    chunk_count INTEGER NOT NULL,
    is_destroyed BOOLEAN NOT NULL DEFAULT FALSE,
    destroyed_reason VARCHAR(64) NULL
);

CREATE INDEX idx_shares_expires_at ON shares(expires_at);
CREATE INDEX idx_shares_is_destroyed ON shares(is_destroyed);
```

**Privacy Safeguard**: The database table has NO columns for:
- IP addresses
- User-Agent strings
- Plaintext filenames
- Plaintext extensions
- Decryption keys or IVs
- Geolocation or headers

---

## 5. Storage Design & Chunk Lifecycle

Each share is allocated an isolated directory or bucket prefix:
```
storage/
  └── <share_id>/
        ├── manifest.enc     # Encrypted JSON manifest (contains names, sizes, hashes)
        ├── chunk_0000.enc   # First 12 bytes: IV; remaining bytes: ciphertext + tag
        ├── chunk_0001.enc
        └── ...
```

### Destruction Lifecycle
Shares are irrecoverably deleted under any of four conditions:
1. **TTL Expiration**: Cron/Worker daemon queries `expires_at < NOW()`, deletes files from disk/bucket, and truncates the DB row.
2. **One-Time Download / Burn on Read**: Download counter reaches 1 (or `max_downloads`); trigger atomic destruction pipeline.
3. **Owner Revocation**: Verified `X-Deletion-Token` matches `owner_token_hash`.
4. **Emergency Admin Purge**: Server admin can purge abusive/spam encrypted shares without ever having had access to contents.

---

## 6. Threat Model & Security Boundaries

### 6.1 Threat Actors & Capabilities

| Threat Actor | Capabilities | Zero Trace Defense |
|---|---|---|
| **Rogue Hosting Provider / Cloud Admin** | Full access to database, disks, memory dumps, network packets | All data on disk and in database is AES-256-GCM ciphertext. Keys were generated on client and transmitted via URL fragment. Host cannot decrypt. |
| **Network Eavesdropper / ISP / Passive MITM** | Intercepts HTTP traffic, DNS queries, TLS handshakes | Strict TLS 1.3, HSTS (`preload`), no-referrer headers. Fragment `#key=...` is never transmitted across wire. |
| **Malicious Recipient** | Possesses valid decryption key and link | Can decrypt legitimate content. **Limitation**: Cannot prevent recipient from taking screenshots, saving plaintext to local drive, or redistributing. |
| **Tampering Attacker** | Injects altered bytes into ciphertext chunks or database | AES-256-GCM 128-bit authentication tag verification fails on client. Browser rejects data and halts execution. |
| **DoS / Flooding Attacker** | Automated bots uploading gigabytes to exhaust disk | Token-bucket rate limiting per IP subnet, strict file size ceiling (e.g. 100MB per share default), automatic short-lived TTLs. |

### 6.2 Known Limitations & Explicit Disclaimers
1. **Recipient Exfiltration**: If Bob receives a decrypted file, Bob can copy it or forward it. Digital rights management (DRM) in an open web platform is mathematically impossible.
2. **Endpoint Compromise**: If Alice's or Bob's machine has spyware/keyloggers, the key or plaintext can be intercepted from browser memory.
3. **Traffic Metadata**: The hosting provider can see network-level TCP/IP connections. Users requiring complete transport anonymity must access the service via **Tor Browser** or a VPN.

---

## 7. Next Steps & Development Checklist

- [x] Phase 1: Architecture & Threat Model Documentation
- [ ] Phase 2: Secure Backend API & Storage Management
- [ ] Phase 3: Client-side Web Crypto Engine & Manifest Builder
- [ ] Phase 4: UI/UX Implementation (File, Information, Media)
- [ ] Phase 5: End-to-End Integration
- [ ] Phase 6: Automated Security & Penetration Testing Suite
- [ ] Phase 7: Production Docker & Deployment Configuration
- [ ] Phase 8: Final Verification & Dual-Browser Validation
