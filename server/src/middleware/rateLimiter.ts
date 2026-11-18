import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from '../config/index.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory privacy-preserving token bucket
// IP addresses are hashed with an ephemeral secret rotated hourly
class PrivacyRateLimiter {
  private cache = new Map<string, RateLimitEntry>();
  private salt = crypto.randomBytes(32).toString('hex');
  private lastSaltRotation = Date.now();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodic cleanup of expired rate limit entries every 2 minutes
    setInterval(() => this.cleanup(), 2 * 60 * 1000).unref();
  }

  private getAnonymizedClientToken(req: Request): string {
    const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    // Rotate salt every hour so historical correlations are mathematically impossible
    if (Date.now() - this.lastSaltRotation > 3600 * 1000) {
      this.salt = crypto.randomBytes(32).toString('hex');
      this.lastSaltRotation = Date.now();
      this.cache.clear();
    }

    // SHA-256 truncated hash
    return crypto.createHmac('sha256', this.salt).update(rawIp).digest('hex').slice(0, 32);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.resetAt) {
        this.cache.delete(key);
      }
    }
  }

  public middleware = (req: Request, res: Response, next: NextFunction): void => {
    const clientToken = this.getAnonymizedClientToken(req);
    const now = Date.now();

    // Chunk transfers for large files (1GB = 500+ chunks) use a high-capacity chunk bucket
    const isChunkStream = req.originalUrl?.includes('/chunks/') || req.path?.includes('/chunks/');
    const bucketLimit = isChunkStream ? 20000 : this.maxRequests;
    const cacheKey = isChunkStream ? `${clientToken}:chunks` : clientToken;

    let entry = this.cache.get(cacheKey);
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + this.windowMs };
      this.cache.set(cacheKey, entry);
    } else {
      entry.count++;
    }

    const remaining = Math.max(0, bucketLimit - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', bucketLimit);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (entry.count > bucketLimit) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please wait before making more requests.',
        retryAfter: resetSeconds,
      });
      return;
    }

    next();
  };
}

export const rateLimiter = new PrivacyRateLimiter(
  config.RATE_LIMIT_MAX_REQUESTS,
  config.RATE_LIMIT_WINDOW_MS
);
