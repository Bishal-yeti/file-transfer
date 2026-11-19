# File Transfer — Starting Procedure Cheat Sheet

**GitHub Repository:** `https://github.com/Bishal-yeti/file-transfer.git`  
**Local Web Interface:** `http://localhost:3001`  

---

## ⚡ 1. The Simplest Way to Start (Recommended)

Just run:

```bash
./start.sh
```

This interactive launcher will:
1. Verify Node.js version (18+ / 20+).
2. Auto-build client and server if needed.
3. Ask you whether to run:
   - **[1] Local / Wi-Fi Mode**: Available on `http://localhost:3001` and your local network IP.
   - **[2] Global Public Mode**: Generates an instant, secure public HTTPS URL (via Cloudflare Tunnel) to share with any phone, tablet, or PC worldwide.

---

## 🌐 2. 1-Click Worldwide Public Mode (Direct)

To launch immediately in public mode with no prompts:

```bash
./start-public.sh
```

---

## 🔄 3. Pulling Updates on Any Machine

If you already cloned the repo previously and want the latest updates:

```bash
cd file-transfer || cd zero-trace
git pull
./start.sh
```

---

## 🛠️ 4. Manual Commands (If Preferred)

| Action | Command |
|---|---|
| First-time install & build | `npm run setup` |
| Start local server | `npm run start` |
| Start worldwide public tunnel | `npm run start:public` |
| Run all 20 automated tests | `npm run test:all` |
| Dev mode (Server) | `npm run dev:server` |
| Dev mode (Frontend Vite) | `npm run dev:client` |

---

## 🔒 Security Reminder

- Encryption keys (`#key=...`) are strictly kept in the URL fragment and **never** touch the server or tunnel logs.
- Anyone receiving a link can only download the file if they have the complete URL including the `#key` portion.
- For maximum security, use **1-time burn** (`Self-destruct after first download`) for sensitive files.
