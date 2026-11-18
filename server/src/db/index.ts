import { config } from '../config/index.js';
import { IDatabase } from './types.js';
import { AtomicFileDatabase } from './atomic.js';
import { PostgresDatabase } from './postgres.js';

let dbInstance: IDatabase | null = null;

export async function getDatabase(): Promise<IDatabase> {
  if (dbInstance) return dbInstance;

  if (config.DB_TYPE === 'postgres' && config.DATABASE_URL) {
    dbInstance = new PostgresDatabase(config.DATABASE_URL);
  } else {
    // Pure TypeScript zero-dependency atomic database (immune to C++ native ABI mismatches)
    dbInstance = new AtomicFileDatabase(config.STORAGE_DIR);
  }

  await dbInstance.init();
  return dbInstance;
}
