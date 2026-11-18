import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  PORT: number;
  NODE_ENV: string;
  STORAGE_DIR: string;
  DB_TYPE: 'sqlite' | 'postgres';
  DATABASE_URL?: string;
  MAX_FILE_SIZE_BYTES: number;
  MAX_SHARE_CHUNKS: number;
  CHUNK_SIZE_BYTES: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  RATE_LIMIT_WINDOW_MS: number;
  SERVER_HMAC_SECRET: string;
  CLEANUP_INTERVAL_MS: number;
  MAX_EXPIRATION_SECONDS: number;
}

const defaultStorageDir = path.resolve(process.cwd(), 'storage');

export const config: AppConfig = {
  PORT: Number.parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  STORAGE_DIR: process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : defaultStorageDir,
  DB_TYPE: process.env.DATABASE_URL?.startsWith('postgres') ? 'postgres' : 'sqlite',
  DATABASE_URL: process.env.DATABASE_URL,
  MAX_FILE_SIZE_BYTES: Number.parseInt(process.env.MAX_FILE_SIZE_BYTES || `${1024 * 1024 * 1024}`, 10), // 1 GB (1,073,741,824 bytes)
  MAX_SHARE_CHUNKS: 1000, // up to 2GB total per share (500 chunks for 1GB at 2MB/chunk)
  CHUNK_SIZE_BYTES: 2 * 1024 * 1024, // 2MB chunk standard
  RATE_LIMIT_MAX_REQUESTS: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '150', 10),
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
  SERVER_HMAC_SECRET: process.env.SERVER_HMAC_SECRET || crypto.randomBytes(32).toString('hex'),
  CLEANUP_INTERVAL_MS: 30 * 1000, // every 30 seconds
  MAX_EXPIRATION_SECONDS: 30 * 24 * 60 * 60, // 30 days max
};
