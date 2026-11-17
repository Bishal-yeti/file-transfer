# ZERO TRACE — Anonymous, End-to-End Encrypted Sharing Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Security: AES-256-GCM](https://img.shields.io/badge/Cipher-AES--256--GCM-green.svg)]()
[![Web Crypto API](https://img.shields.io/badge/Crypto-Web%20Crypto%20API-cyan.svg)]()
[![Privacy: Zero Knowledge](https://img.shields.io/badge/Privacy-Zero%20Knowledge-emerald.svg)]()
[![Tor Compatible](https://img.shields.io/badge/Tor-Onion%20Service%20Ready-purple.svg)]()

**ZERO TRACE** is a production-ready, zero-knowledge, end-to-end encrypted web application designed for sharing files, media, documents, and sensitive information with absolute anonymity.

The platform requires **no user accounts, no email verification, no phone numbers, and no personal profile disclosures**.

---

## 🔒 Cryptographic Architecture

- **Client-Side Encryption:** All content is encrypted inside your browser via the W3C **Web Crypto API** before transmission.
- **Symmetric Cipher:** `AES-256-GCM` with 128-bit authentication tags and 96-bit unique random IVs per chunk.
- **URI Fragment Isolation:** Decryption keys reside exclusively in the RFC 3986 URL fragment (`#...`). Browsers never transmit fragments to the server in HTTP request headers.
- **Password Protection:** Derived via `PBKDF2-HMAC-SHA-256` with 100,000 rounds and a 16-byte random salt.
- **Chunked File Streaming:** Files are partitioned into 2MB chunks and bound to `${shareId}:${chunkIndex}` via Additional Authenticated Data (AAD) to prevent chunk substitution or tampering.
- **Pre-Encryption Integrity:** Every file is hashed with `SHA-256` prior to encryption; the recipient's browser verifies checksums upon reassembly.
- **Auto-Destruction:** One-time shares burn immediately upon download. Creators receive a 256-bit Owner Deletion Token for instant manual revocation.

---

## 🚀 Quick Start (Local Machine)

### 1. Clone the Repository
```bash
git clone https://github.com/Bishal-yeti/zero-trace.git
cd zero-trace
```

### 2. Install Dependencies & Build
```bash
npm run setup
```
*(Or install manually: `npm install --prefix server && npm install --prefix client && npm run build:all`)*

### 3. Launch the Server
```bash
npm run start
```
Open **`http://localhost:3001`** in your browser!

---

## 🧪 Running Automated Tests

Run the full automated test suite (20 tests covering cryptography, REST API, penetration testing, and dual-browser E2E simulation):

```bash
# Run all tests
npm run test:all

# Run specific suites
npm run test:crypto    # Web Crypto AES-256-GCM & PBKDF2 tests
npm run test:api       # Upload, download, burn & delete tests
npm run test:security  # Path traversal, SQLi, IDOR, CSP & rate limit tests
npm run test:e2e       # Multi-browser upload/download simulation
```

---

## 🐳 Docker Deployment (PostgreSQL + Tor Onion Service)

Deploy ZERO TRACE in production with a single command:

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Start containers
docker compose up -d --build

# 3. View Tor Onion Address (.onion)
docker exec -it zero_trace_tor cat /var/lib/tor/hidden_service/hostname
```

---

## 📁 Repository Structure

- `client/`: React 19 + TypeScript + Vite dark-themed cybersecurity interface
- `server/`: Node.js + Express 5 + TypeScript blind ciphertext broker API (SQLite / PostgreSQL)
- `tests/`: Automated unit, integration, and penetration test suite
- `docs/ARCHITECTURE.md`: Detailed cryptographic design & threat model
- `docs/SECURITY.md`: Security controls, penetration test report & retention policies
- `docs/DEPLOYMENT.md`: Step-by-step production deployment & Nginx configuration

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.
