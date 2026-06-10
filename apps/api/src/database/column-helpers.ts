// Evaluated once at module load time; env vars are set before NestJS bootstraps.
export const IS_SQLITE = (process.env.DB_TYPE ?? 'sqlite').toLowerCase() !== 'postgres';

// Returns TypeORM column options for a JSON column.
// PostgreSQL uses native jsonb; SQLite uses simple-json (TEXT serialized by TypeORM).
// Drop the SQL default for simple-json — callers must use class property initializers instead.
export function jsonColumn(opts: { nullable?: boolean } = {}) {
  return {
    type: (IS_SQLITE ? 'simple-json' : 'jsonb') as 'simple-json' | 'jsonb',
    ...opts,
  };
}

// Returns the appropriate column type for timestamp-with-timezone columns.
// PostgreSQL supports timestamptz; SQLite uses datetime (stored as ISO text).
export function tsColType(): 'timestamptz' | 'datetime' {
  return IS_SQLITE ? 'datetime' : 'timestamptz';
}

// Returns the appropriate column type for enum columns.
// PostgreSQL uses native enum; SQLite uses simple-enum (stored as TEXT).
export function enumColType(): 'simple-enum' | 'enum' {
  return IS_SQLITE ? 'simple-enum' : 'enum';
}
