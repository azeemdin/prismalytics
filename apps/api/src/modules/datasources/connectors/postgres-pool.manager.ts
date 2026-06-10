import { Pool, PoolConfig } from 'pg';
import { createHash } from 'crypto';

interface PoolEntry {
  pool: Pool;
  lastUsedAt: number;
}

// Pool idle timeout: close pools unused for 10 minutes
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

const pools = new Map<string, PoolEntry>();

function poolKey(config: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}): string {
  const pwHash = createHash('sha256').update(config.password).digest('hex').slice(0, 8);
  return `${config.host}:${config.port}:${config.database}:${config.username}:${config.ssl ? 1 : 0}:${pwHash}`;
}

export function getSharedPool(config: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}): Pool {
  const key = poolKey(config);
  const existing = pools.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.pool;
  }

  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    min: 1,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  const pool = new Pool(poolConfig);

  pool.on('error', () => {
    pools.delete(key);
  });

  pools.set(key, { pool, lastUsedAt: Date.now() });
  return pool;
}

export function releaseSharedPool(config: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}): void {
  const key = poolKey(config);
  const entry = pools.get(key);
  if (entry) {
    void entry.pool.end();
    pools.delete(key);
  }
}

// Evict pools idle longer than IDLE_TIMEOUT_MS
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pools.entries()) {
    if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
      void entry.pool.end();
      pools.delete(key);
    }
  }
}, 60_000).unref();
