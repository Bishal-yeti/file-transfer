# File Transfer — Anonymous, End-to-End Encrypted Sharing Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Security: AES-256-GCM](https://img.shields.io/badge/Cipher-AES--256--GCM-green.svg)]()
[![Web Crypto API](https://img.shields.io/badge/Crypto-Web%20Crypto%20API-cyan.svg)]()
[![Privacy: Zero Knowledge](https://img.shields.io/badge/Privacy-Zero%20Knowledge-emerald.svg)]()
[![Global Tunnel](https://img.shields.io/badge/Global-Cloudflare%20Tunnel%20Ready-orange.svg)]()

**File Transfer** is a zero-knowledge, end-to-end encrypted web application designed for sharing files, media, documents, and sensitive text worldwide with absolute anonymity and tamper-proof security.

The platform requires **no user accounts, no email verification, no phone numbers, and no personal profile disclosures**.

---

## ⚡ 1-Minute Quick Start

### 1. Clone & Enter
```bash
git clone https://github.com/Bishal-yeti/file-transfer.git
cd file-transfer
```

### 2. Start
```bash
./start.sh
```

That's it! The launcher will automatically:
- Verify your Node.js version (18+ / 20+)
- Compile the frontend & backend if not yet built
- Let you choose between **Local / Wi-Fi Mode** or **Worldwide Global Mode** (instant HTTPS link)

---

## 🌐 Share Worldwide (Any Phone, PC, or Tablet)

To share files across different networks, Wi-Fi connections, or across the internet:

```bash
./start-public.sh
```
*(or choose option `2` in `./start.sh`)*

You will receive an instant, globally accessible HTTPS link (e.g., `https://your-tunnel.trycloudflare.com`). Anyone with this link can upload or download encrypted files from anywhere in the world!

---

## 🔒 Cryptographic Architecture

- **Client-Side Encryption:** All content is encrypted inside your browser via the W3C **Web Crypto API** before transmission.
- **Symmetric Cipher:** `AES-256-GCM` with 128-bit authentication tags and 96-bit unique random IVs per chunk.
- **URI Fragment Isolation:** Decryption keys reside exclusively in the RFC 3986 URL fragment (`#...`). Browsers never transmit fragments to the server in HTTP request headers.
- **Password Protection:** Derived via `PBKDF2-HMAC-SHA-256` with 100,000 rounds and a 16-byte random salt.
- **Chunked File Streaming:** Files (up to 1 GB) are partitioned into 2MB chunks and bound to `${shareId}:${chunkIndex}` via Additional Authenticated Data (AAD) to prevent chunk substitution or tampering.
- **Pre-Encryption Integrity:** Every file is hashed with `SHA-256` prior to encryption; the recipient's browser verifies checksums upon reassembly.
- **Auto-Destruction & Expiration:** One-time shares burn immediately upon download. Creators receive a 256-bit Owner Deletion Token for instant manual revocation. Expiration ranges from 10 minutes to 30 days.

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

Deploy File Transfer with Docker in production:

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
- `server/`: Node.js + Express 5 + TypeScript blind ciphertext broker API (Pure TypeScript crash-proof DB)
- `tests/`: Automated unit, integration, and penetration test suite
- `docs/ARCHITECTURE.md`: Detailed cryptographic design & threat model
- `docs/SECURITY.md`: Security controls, penetration test report & retention policies
- `docs/DEPLOYMENT.md`: Step-by-step production deployment & Nginx configuration

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.
