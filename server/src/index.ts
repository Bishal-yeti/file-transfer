import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config/index.js';
import { getDatabase } from './db/index.js';
import { getStorageEngine } from './storage/index.js';
import { shareRouter } from './routes/shares.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { securityHeaders, privacyHeaders, errorHandler } from './middleware/security.js';
import { shareService } from './services/shareService.js';

export const app = express();

// 1. Security & Privacy Middleware
app.use(securityHeaders);
app.use(privacyHeaders);
app.use(rateLimiter.middleware);

// 2. CORS configuration (restrictive)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. same-origin, curl, mobile native or file://)
      if (!origin || allowedOrigins.includes(origin) || config.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('CORS policy: Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Deletion-Token', 'X-Requested-With'],
    credentials: false,
  })
);

// 3. Body Parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 4. API Endpoints
app.use('/api/shares', shareRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'zero-trace-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: config.DB_TYPE,
  });
});

// 5. Serve client build if available (Production unified serving)
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // Single-page application route fallback
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
      return;
    }
    next();
  });
}

// 6. Centralized Error Handler
app.use(errorHandler);

// 7. Background Cleanup Daemon
let cleanupInterval: NodeJS.Timeout | null = null;

export async function startServer(): Promise<{ server: any; close: () => Promise<void> }> {
  // Ensure DB and Storage are initialized
  const db = await getDatabase();
  const storage = await getStorageEngine();

  // Run initial cleanup
  await shareService.cleanupExpiredShares();

  // Setup periodic cleanup worker
  cleanupInterval = setInterval(async () => {
    try {
      const purged = await shareService.cleanupExpiredShares();
      if (purged > 0 && process.env.NODE_ENV !== 'test') {
        console.log(`[Daemon] Purged ${purged} expired/burned shares`);
      }
    } catch (err) {
      console.error('[Daemon Error] Cleanup failure:', err);
    }
  }, config.CLEANUP_INTERVAL_MS);

  const server = app.listen(config.PORT, () => {
    console.log(`[ZERO TRACE] Server active on port ${config.PORT} [${config.NODE_ENV}]`);
    console.log(`[ZERO TRACE] Storage: ${config.STORAGE_DIR} | DB: ${config.DB_TYPE}`);
  });

  const close = async () => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  };

  return { server, close };
}

// Auto-start if directly executed
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  });
}
