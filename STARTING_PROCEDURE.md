# ZERO TRACE — Starting Procedure Cheat Sheet

**Repository:** `https://github.com/Bishal-yeti/zero-trace.git`  
**Default Access URL:** `http://localhost:3001`  

---

## ⚡ 1. Daily Quick Start (Production Mode)

Whenever you open a new terminal on your device:

```bash
cd ~/zero-trace
npm run start
```
> Open your browser to **`http://localhost:3001`**.

---

## 🔄 2. First-Time Setup or Pulling Updates

Whenever you pull new code or updates from GitHub:

```bash
cd ~/zero-trace
git pull
npm run setup
npm run start
```

*What `npm run setup` does:*
1. Installs all dependencies across both `server` and `client`.
2. Compiles the React 19 frontend into optimized production bundles.
3. Compiles the TypeScript backend into JavaScript.

---

## 🛠️ 3. Development Mode (With Hot Reloading)

If you are editing code and want changes to reload automatically:

* **Terminal 1 (Backend API with auto-reload on edit):**
  ```bash
  cd ~/zero-trace/server
  npm run dev
  ```

* **Terminal 2 (Frontend with instant Vite HMR):**
  ```bash
  cd ~/zero-trace/client
  npm run dev
  ```
  *(Frontend dev server runs at `http://localhost:5173` and proxies API calls to port `3001`).*

---

## 🚀 4. Running Permanently in Background (PM2)

If you want the server to keep running even after you close your terminal or disconnect SSH:

```bash
# Install PM2 globally (one time)
npm install -g pm2

# Start ZERO TRACE as a background daemon
cd ~/zero-trace/server
pm2 start dist/index.js --name "zero-trace"

# Management commands:
pm2 status             # Check server status
pm2 logs zero-trace    # View live server logs
pm2 stop zero-trace    # Stop the server
pm2 restart zero-trace # Restart the server
```

---

## 🐳 5. Docker Deployment (PostgreSQL + Tor Onion Service)

To run containerized with isolated PostgreSQL and an automated `.onion` Tor service:

```bash
cd ~/zero-trace
cp .env.example .env
docker compose up -d --build
```

*Retrieve your Tor Onion address:*
```bash
docker exec -it zero_trace_tor cat /var/lib/tor/hidden_service/hostname
```

---

## 🧪 6. Testing & Utility Commands

| Command | Action |
|---|---|
| `npm run test:all` | Run all 20 automated security, crypto, API & E2E tests |
| `npm run test:crypto` | Test Web Crypto AES-256-GCM & PBKDF2 tamper resistance |
| `npm run test:security` | Run automated penetration tests (Path traversal, SQLi, IDOR) |
| `npm run clean` | Clean all `node_modules` and compiled `dist` folders |
