import * as sql from 'mssql';
import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';
import { getSharedMSSQLPool } from './mssql-pool.manager';

export class MSSQLConnector implements DatabaseConnector {
  private readonly poolPromise: Promise<sql.ConnectionPool>;

  constructor(config: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  }) {
    this.poolPromise = getSharedMSSQLPool(config);
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const pool = await this.poolPromise;
      await pool.request().query('SELECT 1 AS test');
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  async getDatabases(): Promise<string[]> {
    const result = await this.query(`
      SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME NOT IN ('information_schema','sys','INFORMATION_SCHEMA','guest')
      ORDER BY SCHEMA_NAME
    `);
    return result.rows.map((r) => r['SCHEMA_NAME'] as string);
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async query(tsql: string, params: unknown[] = [], targetDatabase?: string): Promise<QueryResult> {
    const start = Date.now();
    const pool = await this.poolPromise;
    const request = pool.request();

    // Replace $1, $2, ... with @p0, @p1, ... and register inputs
    let resolvedSql = tsql.replace(/\$(\d+)/g, (_m, n: string) => `@p${Number(n) - 1}`);
    params.forEach((val, i) => {
      request.input(`p${i}`, val);
    });

    if (targetDatabase) {
      resolvedSql = `USE [${targetDatabase}];\n${resolvedSql}`;
    }

    const result = await request.query(resolvedSql);
    const durationMs = Date.now() - start;
    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    const columns =
      rows.length > 0
        ? Object.keys(rows[0]!).map((name) => ({ name, type: 'unknown' }))
        : [];

    return { columns, rows, rowCount: rows.length, durationMs };
  }

  async getSchema(): Promise<SchemaInfo> {
    const tablesResult = await this.query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_SCHEMA NOT IN ('sys','INFORMATION_SCHEMA','information_schema','guest')
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    const tables = await Promise.all(
      tablesResult.rows.map(async (row) => {
        const colsResult = await this.query(`
          SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE,
            CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PRIMARY
          FROM INFORMATION_SCHEMA.COLUMNS c
          LEFT JOIN (
            SELECT ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
              ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
              AND ku.TABLE_SCHEMA = '${row['TABLE_SCHEMA'] as string}'
              AND ku.TABLE_NAME = '${row['TABLE_NAME'] as string}'
          ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
          WHERE c.TABLE_SCHEMA = '${row['TABLE_SCHEMA'] as string}'
            AND c.TABLE_NAME = '${row['TABLE_NAME'] as string}'
          ORDER BY c.ORDINAL_POSITION
        `);

        return {
          name: row['TABLE_NAME'] as string,
          schema: row['TABLE_SCHEMA'] as string,
          columns: colsResult.rows.map((c) => ({
            name: c['COLUMN_NAME'] as string,
            type: c['DATA_TYPE'] as string,
            nullable: c['IS_NULLABLE'] === 'YES',
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
