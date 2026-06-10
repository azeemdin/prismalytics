import * as sql from 'mssql';
import { createHash } from 'crypto';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

interface PoolEntry {
  poolPromise: Promise<sql.ConnectionPool>;
  lastUsedAt: number;
}

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
  return `mssql:${config.host}:${config.port}:${config.database}:${config.username}:${config.ssl ? 1 : 0}:${pwHash}`;
}

export function getSharedMSSQLPool(config: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}): Promise<sql.ConnectionPool> {
  const key = poolKey(config);
  const existing = pools.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.poolPromise;
  }

  const poolPromise = new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    options: {
      encrypt: config.ssl ?? false,
      trustServerCertificate: !config.ssl,
      enableArithAbort: true,
    },
    pool: {
      min: 1,
      max: 10,
      idleTimeoutMillis: 30_000,
    },
    connectionTimeout: 15_000,
    requestTimeout: 30_000,
  })
    .connect()
    .catch((err: Error) => {
      pools.delete(key);
      throw err;
    });

  pools.set(key, { poolPromise, lastUsedAt: Date.now() });
  return poolPromise;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pools.entries()) {
    if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
      void entry.poolPromise.then((p) => p.close()).catch(() => {});
      pools.delete(key);
    }
  }
}, 60_000).unref();
