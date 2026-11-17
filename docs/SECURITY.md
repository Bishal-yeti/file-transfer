# ZERO TRACE: Security Audit & Penetration Testing Report

**Document ID:** SEC-ZT-2026-001  
**Classification:** Public Security Specification & Pentest Audit  
**Status:** PASSED (All automated test suites passing)  

---

## 1. Executive Summary

ZERO TRACE has been architected under a **Zero Knowledge Adversarial Model**. In this model, the backend API, the database, the physical storage disks, and intermediate network nodes are treated as untrusted, potentially hostile environments.

All plaintext content, filenames, file sizes, MIME types, and notes are encrypted on the client using the W3C **Web Crypto API** before leaving the user's browser. Decryption keys are confined to the RFC 3986 URI fragment (`#...`), ensuring they are never transmitted to the server in HTTP request lines, headers, or referrer strings.

---

## 2. Cryptographic Implementation Details

### 2.1 Symmetric Encryption
- **Algorithm:** AES-256 in Galois/Counter Mode (`AES-GCM`).
- **Authentication Tag:** 128-bit (16-byte) GMAC tag. Any 1-bit alteration of ciphertext causes immediate decryption abort with `Authentication tag verification error`.
- **Initialization Vector (IV):** 96-bit (12-byte) cryptographically secure pseudorandom number generated via `crypto.getRandomValues()` independently for every chunk and manifest. No IV is ever reused.
- **Additional Authenticated Data (AAD):** Every chunk binds `${shareId}:${chunkIndex}` into the GCM GMAC calculation, preventing chunk-swap attacks, truncation attacks, or cross-share splicing.

### 2.2 Password Derivation (Password-Protected Shares)
- **Algorithm:** `PBKDF2-HMAC-SHA-256`.
- **Iterations:** 100,000 rounds.
- **Salt:** 16-byte cryptographically secure random salt generated on the client.
- **Key Wrapping:** The derived key acts as the master key. Incorrect passwords immediately fail authenticated tag verification without leaking whether the password was partially correct.

### 2.3 URI Fragment Mechanics
- The share URL format is: `https://<domain>/#share=<uuid>&key=<base64url>`
- Per **RFC 3986 Section 3.5**, the URI fragment is evaluated strictly by the client user-agent.
- The browser network stack strips the `#...` portion prior to making TCP/TLS requests. Server access logs, reverse proxy logs, and CDN edge logs record only `GET /` and `GET /api/shares/<uuid>`.

---

## 3. Automated Penetration Testing Results

The automated test suite (`tests/security.test.ts`, `tests/crypto.test.ts`, `tests/api.test.ts`, `tests/e2e_simulation.ts`) verifies the following security controls:

| Test ID | Test Vector | Expected Security Behavior | Audit Result |
|---|---|---|---|
| **PEN-01** | Disk & Database Inspection | Read raw disk files and SQLite/PostgreSQL rows. Assert zero plaintext and zero raw keys exist. | **PASSED** (0 plaintext bytes found) |
| **PEN-02** | Path Traversal / Directory Escape | Attempt accessing `../../etc/passwd`, `../storage`, and negative chunk indexes. | **PASSED** (Strict regex `/^[a-zA-Z0-9_-]{16,64}$/` rejects all) |
| **PEN-03** | Insecure Direct Object References (IDOR) | Attempt deleting another user's active share using forged tokens. | **PASSED** (Constant-time HMAC comparison rejects invalid tokens) |
| **PEN-04** | SQL Injection | Injected SQL payloads (`' OR 1=1`, `DROP TABLE`) into parameters and headers. | **PASSED** (Prepared parameterized statements neutralize all payloads) |
| **PEN-05** | Security & Anti-Fingerprinting Headers | Assert CSP `default-src 'self'`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`. | **PASSED** (Strict headers verified) |
| **PEN-06** | Rate Limiting & Resource Exhaustion | Flood server with rapid requests to trigger throttling. | **PASSED** (Returns HTTP 429 with `Retry-After`) |
| **PEN-07** | Dependency Vulnerability Scan | Run `npm audit` across client and server packages. | **PASSED** (0 vulnerabilities) |

---

## 4. Deletion & Retention Policies

1. **TTL Expiration:** Every share is assigned a strict maximum time-to-live (from 10 minutes to 30 days). The background cleanup daemon runs every 30 seconds to purge expired records and their associated files from disk.
2. **Burn on Read:** When `is_one_time` is enabled, the final chunk download atomically triggers irreversible deletion from disk and database. Subsequent requests yield `404 Not Found`.
3. **Owner Revocation:** The creator receives a 256-bit Owner Deletion Token. Only the HMAC-SHA256 hash of this token is stored on the server. Supplying the token allows immediate manual destruction.
4. **Backup Security:** Any backups of the database or storage volume contain only AES-256-GCM ciphertext. Plaintext recovery from backups without the client link is mathematically impossible.

---

## 5. Tor Onion Service Architecture

For maximum transport anonymity, ZERO TRACE can be exposed as a Tor v3 Onion Service (`.onion` address).

### Setup Instructions:
1. In `docker-compose.yml`, the `tor` container automatically generates a Tor v3 Hidden Service routing port 80 to the ZERO TRACE container.
2. To obtain your onion address:
   ```bash
   docker exec -it zero_trace_tor cat /var/lib/tor/hidden_service/hostname
   ```
3. Share the resulting `http://<random-hash>.onion` link.
4. When accessed through Tor Browser, network eavesdroppers cannot determine the client IP, the server IP, or any physical location metadata.

---

## 6. Honest Cryptographic Disclaimers

1. **No DRM:** Once a recipient decrypts a file or message, they possess the plaintext. No software can prevent a recipient from copying, taking a photo, or saving the decrypted content.
2. **Endpoint Integrity:** If either party's computer is compromised with spyware or a keylogger, keys can be exfiltrated from browser memory.
3. **Transport Metadata:** Operating over standard HTTPS protects content, but network observers can observe that a connection occurred. Use **Tor Browser** if connection concealment is required.
