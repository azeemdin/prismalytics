import { MongoClient, Sort } from 'mongodb';
import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';
import { getSharedMongoClient } from './mongodb-client.manager';

interface FindQuery {
  collection: string;
  database?: string;
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Sort;
  limit?: number;
  skip?: number;
}

interface PipelineQuery {
  collection: string;
  database?: string;
  pipeline: Record<string, unknown>[];
}

type MongoQuery = FindQuery | PipelineQuery;

function inferType(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return 'date';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
    if (ctor && ctor !== 'Object') return ctor.toLowerCase();
    return 'object';
  }
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function extractDbFromUri(uri: string): string {
  try {
    const withoutQuery = (uri.split('?')[0] ?? '').trim();
    const noScheme = withoutQuery.replace(/^mongodb(?:\+srv)?:\/\//, '');
    const atIdx = noScheme.lastIndexOf('@');
    const afterCreds = atIdx >= 0 ? noScheme.slice(atIdx + 1) : noScheme;
    const slashIdx = afterCreds.indexOf('/');
    if (slashIdx < 0) return '';
    return afterCreds.slice(slashIdx + 1) || '';
  } catch {
    return '';
  }
}

const SYSTEM_DBS = new Set(['admin', 'local', 'config']);

function serializeForTransport(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeForTransport);
  if (typeof value === 'object') {
    const ctor = (value as Record<string, unknown>).constructor;
    if (ctor !== Object && ctor !== undefined) return String(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeForTransport(v);
    }
    return out;
  }
  return String(value);
}

function convertExtendedJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(convertExtendedJson);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('$date' in obj && Object.keys(obj).length === 1) {
      const d = obj['$date'];
      if (typeof d === 'string' || typeof d === 'number') return new Date(d);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = convertExtendedJson(v);
    }
    return out;
  }
  return value;
}

export class MongoDBConnector implements DatabaseConnector {
  private readonly client: MongoClient;
  private readonly defaultDb: string;
  private readonly uri: string;

  constructor(
    config: {
      host?: string;
      port?: number;
      database?: string;
      username?: string;
      ssl?: boolean;
      connectionStringMode?: boolean;
    },
    password: string,
  ) {
    if (config.connectionStringMode) {
      this.uri = password;
      this.defaultDb = config.database || extractDbFromUri(this.uri);
    } else {
      const auth =
        config.username && password
          ? `${encodeURIComponent(config.username)}:${encodeURIComponent(password)}@`
          : '';
      this.uri = `mongodb://${auth}${config.host ?? 'localhost'}:${config.port ?? 27017}/${config.database ?? ''}`;
      this.defaultDb = config.database ?? '';
    }

    // MongoClient v6 connects lazily — the shared client reuses the driver's connection pool
    this.client = getSharedMongoClient(this.uri);
  }

  private resolveDb(targetDatabase?: string): string {
    const db = targetDatabase || this.defaultDb;
    if (!db) {
      throw new Error(
        'No database selected. Choose a database from the picker in the editor toolbar, ' +
          'or include "database" in your query JSON: {"database":"mydb","collection":"..."}',
      );
    }
    return db;
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const pingDb = this.defaultDb || 'admin';
      await this.client.db(pingDb).command({ ping: 1 });
      return { success: true, message: 'Connection successful' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  async query(sql: string, _params?: unknown[], targetDatabase?: string): Promise<QueryResult> {
    const start = Date.now();
    let parsed: MongoQuery;
    try {
      parsed = JSON.parse(sql) as MongoQuery;
    } catch {
      throw new Error(
        'MongoDB queries must be JSON.\n' +
          'Example: {"collection":"users","filter":{},"limit":100}\n' +
          'Pipeline: {"collection":"orders","pipeline":[{"$match":{}},{"$limit":100}]}',
      );
    }
    if (!parsed.collection) throw new Error('Query JSON must include a "collection" field.');

    const dbName = this.resolveDb(targetDatabase || parsed.database);
    const converted = convertExtendedJson(parsed) as MongoQuery;

    const col = this.client.db(dbName).collection(converted.collection);
    let rows: Record<string, unknown>[];

    if ('pipeline' in converted) {
      rows = (await col.aggregate(converted.pipeline).toArray()) as Record<string, unknown>[];
    } else {
      const { filter = {}, projection, sort, limit = 1000, skip } = converted as FindQuery;
      let cursor = col.find(filter, { projection: projection ?? undefined });
      if (sort) cursor = cursor.sort(sort);
      if (skip) cursor = cursor.skip(skip);
      cursor = cursor.limit(limit);
      rows = (await cursor.toArray()) as Record<string, unknown>[];
    }

    const firstRow = rows[0];
    const columns =
      firstRow != null
        ? Object.keys(firstRow).map((k) => ({ name: k, type: inferType(firstRow[k]) }))
        : [];

    const serialized = rows.map((r) => serializeForTransport(r) as Record<string, unknown>);
    return { columns, rows: serialized, rowCount: serialized.length, durationMs: Date.now() - start };
  }

  async getDatabases(): Promise<string[]> {
    try {
      const { databases: dbList } = await this.client.db().admin().listDatabases({ nameOnly: true });
      return (dbList as { name: string }[]).map((d) => d.name).filter((n) => !SYSTEM_DBS.has(n));
    } catch {
      return this.defaultDb ? [this.defaultDb] : [];
    }
  }

  async getCollections(database: string): Promise<string[]> {
    const cols = await this.client.db(database).listCollections().toArray();
    return cols.map((c) => c.name).sort();
  }

  async getSchema(): Promise<SchemaInfo> {
    let databases: string[] = [];
    try {
      const { databases: dbList } = await this.client.db().admin().listDatabases({ nameOnly: true });
      databases = (dbList as { name: string }[]).map((d) => d.name).filter((n) => !SYSTEM_DBS.has(n));
    } catch {
      databases = this.defaultDb ? [this.defaultDb] : [];
    }

    const tables: SchemaInfo['tables'] = [];

    for (const dbName of databases) {
      const db = this.client.db(dbName);
      let collectionInfos: { name: string }[] = [];
      try {
        collectionInfos = await db.listCollections().toArray();
      } catch {
        continue;
      }

      for (const info of collectionInfos) {
        const sample = (await db.collection(info.name).find({}).limit(20).toArray()) as Record<string, unknown>[];
        const fieldMap = new Map<string, string>();
        for (const doc of sample) {
          for (const [k, v] of Object.entries(doc)) {
            if (!fieldMap.has(k)) fieldMap.set(k, inferType(v));
          }
        }
        tables.push({
          name: info.name,
          schema: dbName,
          columns: Array.from(fieldMap.entries()).map(([name, type]) => ({
            name,
            type,
            nullable: true,
            isPrimary: name === '_id',
          })),
        });
      }
    }

    return { tables };
  }

  // Client is shared — close() is a no-op; the manager handles idle eviction.
  async close(): Promise<void> {}
}
