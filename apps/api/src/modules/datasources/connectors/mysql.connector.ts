import * as mysql from 'mysql2/promise';
import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';
import { getSharedMySQLPool } from './mysql-pool.manager';

export class MySQLConnector implements DatabaseConnector {
  private pool: mysql.Pool;

  constructor(config: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  }) {
    this.pool = getSharedMySQLPool(config);
  }

  async test(): Promise<{ success: boolean; message: string }> {
    const conn = await this.pool.getConnection();
    try {
      await conn.query('SELECT 1');
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    } finally {
      conn.release();
    }
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async getDatabases(): Promise<string[]> {
    const result = await this.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys') ORDER BY schema_name",
    );
    return result.rows.map((r) => r['schema_name'] as string);
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const start = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [rows, fields] = await this.pool.execute(sql, params as any);
    const durationMs = Date.now() - start;

    const columns = (fields as mysql.FieldPacket[]).map((f) => ({
      name: f.name,
      type: f.type?.toString() ?? 'unknown',
    }));

    const rowsArr = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    return { columns, rows: rowsArr, rowCount: rowsArr.length, durationMs };
  }

  async getSchema(): Promise<SchemaInfo> {
    const [dbRows] = await this.pool.query('SELECT DATABASE() AS db');
    const dbName = (dbRows as Record<string, unknown>[])[0]?.['db'] as string;

    const [tableRows] = await this.pool.query(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE"',
      [dbName],
    );

    const tables = await Promise.all(
      (tableRows as Record<string, unknown>[]).map(async (row) => {
        const [colRows] = await this.pool.query(
          `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [dbName, row['TABLE_NAME']],
        );

        return {
          name: row['TABLE_NAME'] as string,
          columns: (colRows as Record<string, unknown>[]).map((c) => ({
            name: c['COLUMN_NAME'] as string,
            type: c['DATA_TYPE'] as string,
            nullable: c['IS_NULLABLE'] === 'YES',
            isPrimary: c['COLUMN_KEY'] === 'PRI',
          })),
        };
      }),
    );

    return { tables };
  }

  // Pool is shared — close() is a no-op; the manager handles idle eviction.
  async close(): Promise<void> {}
}
