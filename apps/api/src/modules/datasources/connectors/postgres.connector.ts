import { Pool } from 'pg';
import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';
import { getSharedPool } from './postgres-pool.manager';

export class PostgresConnector implements DatabaseConnector {
  private pool: Pool;
  private readonly config: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  };

  constructor(config: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  }) {
    this.config = config;
    this.pool = getSharedPool(config);
  }

  async test(): Promise<{ success: boolean; message: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    } finally {
      client.release();
    }
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async getDatabases(): Promise<string[]> {
    const result = await this.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
        AND schema_name NOT LIKE 'pg_%'
      ORDER BY schema_name
    `);
    return result.rows.map((r) => r['schema_name'] as string);
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const start = Date.now();
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      const durationMs = Date.now() - start;

      const columns = (result.fields || []).map((f) => ({
        name: f.name,
        type: f.dataTypeID.toString(),
      }));

      return {
        columns,
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rowCount ?? result.rows.length,
        durationMs,
      };
    } finally {
      client.release();
    }
  }

  async getSchema(schema?: string): Promise<SchemaInfo> {
    const tablesResult = schema
      ? await this.query(
          `SELECT t.table_schema, t.table_name
           FROM information_schema.tables t
           WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
           ORDER BY t.table_name`,
          [schema],
        )
      : await this.query(`
          SELECT t.table_schema, t.table_name
          FROM information_schema.tables t
          WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
            AND t.table_type = 'BASE TABLE'
          ORDER BY t.table_schema, t.table_name
        `);

    const tables = await Promise.all(
      tablesResult.rows.map(async (row) => {
        const colsResult = await this.query(`
          SELECT c.column_name, c.data_type, c.is_nullable,
            (SELECT COUNT(*) > 0
             FROM information_schema.key_column_usage k
             JOIN information_schema.table_constraints tc
               ON k.constraint_name = tc.constraint_name
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND k.table_schema = c.table_schema
               AND k.table_name = c.table_name
               AND k.column_name = c.column_name) AS is_primary
          FROM information_schema.columns c
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position
        `, [row['table_schema'], row['table_name']]);

        return {
          name: row['table_name'] as string,
          schema: row['table_schema'] as string,
          columns: colsResult.rows.map((c) => ({
            name: c['column_name'] as string,
            type: c['data_type'] as string,
            nullable: c['is_nullable'] === 'YES',
            isPrimary: Boolean(c['is_primary']),
          })),
        };
      }),
    );

    return { tables };
  }

  // Pool is shared — calling close() is a no-op here. The pool manager
  // handles idle pool eviction automatically.
  async close(): Promise<void> {
    // no-op: shared pool lifecycle managed by postgres-pool.manager.ts
  }
}
