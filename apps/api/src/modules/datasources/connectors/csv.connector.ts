import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';

export class CsvConnector implements DatabaseConnector {
  constructor(
    private readonly rows: Record<string, unknown>[],
    private readonly cols: { name: string; type: string }[],
  ) {}

  async test(): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: `CSV datasource: ${this.rows.length} rows, ${this.cols.length} columns`,
    };
  }

  async getDatabases(): Promise<string[]> {
    return ['csv'];
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async query(_sql: string, _params: unknown[] = []): Promise<QueryResult> {
    const start = Date.now();
    return {
      columns: this.cols,
      rows: this.rows,
      rowCount: this.rows.length,
      durationMs: Date.now() - start,
    };
  }

  async getSchema(): Promise<SchemaInfo> {
    return {
      tables: [
        {
          name: 'data',
          columns: this.cols.map((c) => ({ name: c.name, type: c.type, nullable: true })),
        },
      ],
    };
  }

  async close(): Promise<void> {}
}
