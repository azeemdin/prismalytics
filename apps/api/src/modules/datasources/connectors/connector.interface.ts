export interface QueryResult {
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export interface SchemaInfo {
  tables: {
    name: string;
    schema?: string;
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      isPrimary?: boolean;
    }[];
  }[];
}

export interface DatabaseConnector {
  test(): Promise<{ success: boolean; message: string }>;
  query(sql: string, params?: unknown[], targetDatabase?: string): Promise<QueryResult>;
  getDatabases(): Promise<string[]>;
  getCollections(database: string): Promise<string[]>;
  getSchema(schema?: string): Promise<SchemaInfo>;
  close(): Promise<void>;
}
