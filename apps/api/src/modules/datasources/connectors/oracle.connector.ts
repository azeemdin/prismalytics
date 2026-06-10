// oracledb v6 thin mode — pure JavaScript, no Oracle Client libraries required.
// Thin mode is enabled by default in oracledb v6+ when initOracleClient() is NOT called.
import oracledb from 'oracledb';
import { createHash } from 'crypto';
import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB]; // stream CLOBs as strings

interface PoolEntry {
  pool: oracledb.Pool;
  lastUsedAt: number;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const pools = new Map<string, PoolEntry>();

function poolKey(config: {
  host: string;
  port: number;
  serviceName: string;
  username: string;
  password: string;
  ssl?: boolean;
}): string {
  const pwHash = createHash('sha256').update(config.password).digest('hex').slice(0, 8);
  return `oracle:${config.host}:${config.port}:${config.serviceName}:${config.username}:${config.ssl ? 1 : 0}:${pwHash}`;
}

async function getOrCreatePool(config: {
  host: string;
  port: number;
  serviceName: string;
  username: string;
  password: string;
  ssl?: boolean;
}): Promise<oracledb.Pool> {
  const key = poolKey(config);
  const existing = pools.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.pool;
  }

  // connectString format: host:port/serviceName
  const connectString = `${config.host}:${config.port}/${config.serviceName}`;

  const pool = await oracledb.createPool({
    user: config.username,
    password: config.password,
    connectString,
    poolMin: 1,
    poolMax: 10,
    poolIncrement: 1,
    poolTimeout: 60,
    ...(config.ssl ? { sslServerDNMatch: false } : {}),
  });

  pools.set(key, { pool, lastUsedAt: Date.now() });
  return pool;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pools.entries()) {
    if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
      void entry.pool.close(0);
      pools.delete(key);
    }
  }
}, 60_000).unref();

export class OracleConnector implements DatabaseConnector {
  private readonly config: {
    host: string;
    port: number;
    serviceName: string;
    username: string;
    password: string;
    ssl?: boolean;
  };

  constructor(config: {
    host: string;
    port: number;
    serviceName: string;
    username: string;
    password: string;
    ssl?: boolean;
  }) {
    this.config = config;
  }

  private async withConnection<T>(fn: (conn: oracledb.Connection) => Promise<T>): Promise<T> {
    const pool = await getOrCreatePool(this.config);
    const conn = await pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      await conn.close();
    }
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      await this.withConnection((conn) => conn.execute('SELECT 1 FROM DUAL'));
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  async getDatabases(): Promise<string[]> {
    // In Oracle, "schemas" are equivalent to users/owners
    const result = await this.query(
      "SELECT username FROM all_users WHERE username NOT IN ('SYS','SYSTEM','DBSNMP','OUTLN','MDSYS','ORDSYS','EXFSYS','DMSYS','WMSYS','CTXSYS','ANONYMOUS','XDB','ORDPLUGINS','OLAPSYS','PUBLIC') ORDER BY username",
    );
    return result.rows.map((r) => r['USERNAME'] as string);
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async query(sql: string, params: unknown[] = [], _targetDatabase?: string): Promise<QueryResult> {
    const start = Date.now();

    // Convert $1/$2 positional params to :1/:2 Oracle bind syntax
    let resolvedSql = sql.replace(/\$(\d+)/g, ':$1');

    // Strip trailing semicolon — Oracle doesn't allow it in execute()
    resolvedSql = resolvedSql.replace(/;\s*$/, '');

    const result = await this.withConnection((conn) =>
      conn.execute<Record<string, unknown>>(resolvedSql, params as unknown[], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: 1000,
      }),
    );

    const durationMs = Date.now() - start;
    const rows = result.rows ?? [];
    const metaData = result.metaData ?? [];
    const columns = metaData.map((m) => ({ name: m.name, type: m.dbTypeName ?? 'unknown' }));

    return { columns, rows, rowCount: rows.length, durationMs };
  }

  async getSchema(): Promise<SchemaInfo> {
    const tablesResult = await this.query(
      "SELECT owner, table_name FROM all_tables WHERE owner = USER ORDER BY table_name",
    );

    const tables = await Promise.all(
      tablesResult.rows.map(async (row) => {
        const colsResult = await this.query(
          `SELECT column_name, data_type, nullable,
             CASE WHEN column_name IN (
               SELECT cc.column_name FROM all_cons_columns cc
               JOIN all_constraints c ON cc.constraint_name = c.constraint_name
               WHERE c.constraint_type = 'P' AND c.owner = :1 AND c.table_name = :2
             ) THEN 1 ELSE 0 END AS is_primary
           FROM all_tab_columns
           WHERE owner = :3 AND table_name = :4
           ORDER BY column_id`,
          [row['OWNER'], row['TABLE_NAME'], row['OWNER'], row['TABLE_NAME']],
        );

        return {
          name: row['TABLE_NAME'] as string,
          schema: row['OWNER'] as string,
          columns: colsResult.rows.map((c) => ({
            name: c['COLUMN_NAME'] as string,
            type: c['DATA_TYPE'] as string,
            nullable: c['NULLABLE'] === 'Y',
            isPrimary: Number(c['IS_PRIMARY']) === 1,
          })),
        };
      }),
    );

    return { tables };
  }

  // Pool is shared — close() is a no-op; the manager handles idle eviction.
  async close(): Promise<void> {}
}
