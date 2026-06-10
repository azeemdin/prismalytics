// Minimal type shim for oracledb v6 — the npm package does not bundle .d.ts files.
declare module 'oracledb' {
  interface Metadata {
    name: string;
    dbTypeName?: string;
    fetchType?: number;
    dbType?: number;
    nullable?: boolean;
  }

  interface Result<T> {
    rows?: T[];
    metaData?: Metadata[];
    rowsAffected?: number;
    lastRowid?: string;
  }

  interface ExecuteOptions {
    outFormat?: number;
    fetchArraySize?: number;
    maxRows?: number;
    resultSet?: boolean;
  }

  interface Connection {
    execute<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[] | Record<string, unknown>,
      options?: ExecuteOptions,
    ): Promise<Result<T>>;
    ping(): Promise<void>;
    close(): Promise<void>;
  }

  interface PoolAttributes {
    user: string;
    password: string;
    connectString: string;
    poolMin?: number;
    poolMax?: number;
    poolIncrement?: number;
    poolTimeout?: number;
    [key: string]: unknown;
  }

  interface Pool {
    getConnection(): Promise<Connection>;
    close(drainTime?: number): Promise<void>;
  }

  const OUT_FORMAT_OBJECT: number;
  const CLOB: number;

  let outFormat: number;
  let fetchAsString: number[];

  function createPool(attrs: PoolAttributes): Promise<Pool>;
}
