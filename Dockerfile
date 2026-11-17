# ==========================================
# STAGE 1: Build Frontend (Vite + React)
# ==========================================
FROM node:24-bookworm-slim AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ==========================================
# STAGE 2: Build Backend (Node.js + TS)
# ==========================================
FROM node:24-bookworm-slim AS server-builder
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

# ==========================================
# STAGE 3: Production Runtime
# ==========================================
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    STORAGE_DIR=/app/storage

# Install curl for docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root unprivileged container user
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh -m appuser

# Copy production dependencies and built artifacts
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=client-builder /app/client/dist ./client/dist

# Initialize persistent encrypted storage directory
RUN mkdir -p /app/storage && chown -R appuser:appgroup /app

USER appuser
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

WORKDIR /app/server
CMD ["node", "dist/index.js"]
