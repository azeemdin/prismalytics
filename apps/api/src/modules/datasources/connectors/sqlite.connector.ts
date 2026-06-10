import Database from 'better-sqlite3';
import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';

export class SQLiteConnector implements DatabaseConnector {
  private db: Database.Database;

  constructor(config: { database: string; ssl?: boolean }) {
    this.db = new Database(config.database, { readonly: false, fileMustExist: false });
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      this.db.prepare('SELECT 1').get();
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  async getDatabases(): Promise<string[]> {
    return ['main'];
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const start = Date.now();
    // SQLite uses ? placeholders; replace $1, $2, ... with ?
    const resolvedSql = sql.replace(/\$\d+/g, '?');
    const stmt = this.db.prepare(resolvedSql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    const durationMs = Date.now() - start;
    const columns =
      rows.length > 0
        ? Object.keys(rows[0]!).map((name) => ({ name, type: 'text' }))
        : [];
    return { columns, rows, rowCount: rows.length, durationMs };
  }

  async getSchema(): Promise<SchemaInfo> {
    const tablesResult = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];

    const tables = tablesResult.map((row) => {
      const cols = this.db.prepare(`PRAGMA table_info(${row.name})`).all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      return {
        name: row.name,
        columns: cols.map((c) => ({
          name: c.name,
          type: c.type || 'text',
          nullable: c.notnull === 0,
          isPrimary: c.pk > 0,
        })),
      };
    });

    return { tables };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
