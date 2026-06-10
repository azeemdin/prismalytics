import * as mysql from 'mysql2/promise';
import { createHash } from 'crypto';

interface PoolEntry {
  pool: mysql.Pool;
  lastUsedAt: number;
}

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
  return `mysql:${config.host}:${config.port}:${config.database}:${config.username}:${config.ssl ? 1 : 0}:${pwHash}`;
}

export function getSharedMySQLPool(config: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}): mysql.Pool {
  const key = poolKey(config);
  const existing = pools.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.pool;
  }

  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? {} : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10_000,
  });

  pools.set(key, { pool, lastUsedAt: Date.now() });
  return pool;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pools.entries()) {
    if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
      void entry.pool.end();
      pools.delete(key);
    }
  }
}, 60_000).unref();
