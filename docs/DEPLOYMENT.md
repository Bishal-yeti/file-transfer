# ZERO TRACE: Production Deployment & Operations Guide

This guide details how to deploy ZERO TRACE across containerized environments, cloud VPS hosts, and Tor Onion Services.

---

## 1. Quick Start (Self-Hosted Node)

### Prerequisites
- Node.js 20 LTS or Node.js 24 LTS
- npm or pnpm

### Build and Launch
```bash
# 1. Clone repository
git clone https://github.com/your-org/zero-trace.git
cd zero-trace

# 2. Install dependencies & build both client and server
npm run build:all

# 3. Launch single-node instance with embedded SQLite
npm run start
```
The application will be live at `http://localhost:3001` serving both the authenticated API and the single-page application.

---

## 2. Docker Compose Deployment (Recommended for Production)

### 1. Configure Environment
```bash
cp .env.example .env
# Edit .env to set strong secrets
nano .env
```
Generate a strong HMAC secret:
```bash
openssl rand -hex 32
```

### 2. Launch Containers
```bash
docker compose up -d --build
```
This launches:
- `zero_trace_app`: Multi-stage built Node.js service running on port 3001.
- `zero_trace_db`: Hardened PostgreSQL 16 Alpine container with automatic schema migrations.
- `zero_trace_tor`: Automated Tor v3 Hidden Service container.

### 3. Check Status & Logs
```bash
docker compose ps
docker compose logs -f app
```

### 4. Retrieve Tor Onion Address
```bash
docker exec -it zero_trace_tor cat /var/lib/tor/hidden_service/hostname
```

---

## 3. Reverse Proxy Configuration (Nginx + HTTPS)

When hosting on a public domain, place Nginx in front of ZERO TRACE to terminate TLS and enforce HTTP/2.

```nginx
# /etc/nginx/sites-available/zero-trace.conf
server {
    listen 80;
    server_name share.example.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name share.example.org;

    ssl_certificate /etc/letsencrypt/live/share.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/share.example.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Maximum payload upload limit (matching application config)
    client_max_body_size 250M;

    # Security Headers
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for chunked streaming
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

---

## 4. Maintenance & Storage Operations

### Automated Daemon Pruning
ZERO TRACE runs an automated in-process worker every 30 seconds that executes:
```sql
SELECT id FROM shares WHERE is_destroyed = 1 OR expires_at <= NOW();
```
All associated filesystem chunks and database records are permanently unlinked and deleted.

### Emergency Database Wipe
To manually wipe all active shares immediately:
```bash
# SQLite
rm -rf storage/*

# Docker Postgres
docker compose exec postgres psql -U zerotrace_user -d zerotrace_db -c "TRUNCATE shares;"
docker compose exec app rm -rf /app/storage/*
```
