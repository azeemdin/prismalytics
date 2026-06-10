import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';

interface EsConfig {
  host: string;
  port: number;
  ssl?: boolean;
  index?: string;
}

export class ElasticsearchConnector implements DatabaseConnector {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: EsConfig, apiKey?: string) {
    const scheme = config.ssl ? 'https' : 'http';
    this.baseUrl = `${scheme}://${config.host}:${config.port}`;
    this.headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      // Supports both "ApiKey base64" and "Bearer token" formats
      this.headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `ApiKey ${apiKey}`;
    }
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(this.baseUrl, { headers: this.headers });
      const json = (await res.json()) as { version?: { number: string } };
      return {
        success: res.ok,
        message: res.ok
          ? `Elasticsearch ${json.version?.number ?? 'connected'}`
          : `HTTP ${res.status}`,
      };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  async getDatabases(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/_cat/indices?h=index&format=json`, {
        headers: this.headers,
      });
      const json = (await res.json()) as { index: string }[];
      return Array.isArray(json)
        ? json.map((i) => i.index).filter((i) => !i.startsWith('.'))
        : [];
    } catch {
      return [];
    }
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async query(queryJson: string, _params: unknown[] = [], targetIndex?: string): Promise<QueryResult> {
    const start = Date.now();
    const index = targetIndex ?? '_all';
    let body: Record<string, unknown>;

    try {
      const parsed = JSON.parse(queryJson) as {
        index?: string;
        query?: unknown;
        size?: number;
        aggs?: unknown;
        sort?: unknown;
      };
      body = {
        query: parsed.query ?? { match_all: {} },
        size: parsed.size ?? 100,
      };
      if (parsed.aggs) body['aggs'] = parsed.aggs;
      if (parsed.sort) body['sort'] = parsed.sort;
    } catch {
      // Treat raw string as Lucene query
      body = { query: { query_string: { query: queryJson } }, size: 100 };
    }

    const res = await fetch(`${this.baseUrl}/${index}/_search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Elasticsearch error: HTTP ${res.status} — ${await res.text()}`);
    }

    const json = (await res.json()) as {
      hits?: {
        total?: { value: number };
        hits?: { _source: Record<string, unknown>; _id: string; _index: string }[];
      };
    };

    const hits = json.hits?.hits ?? [];
    const rows = hits.map((h) => ({ _id: h._id, _index: h._index, ...h._source }));
    const columns =
      rows.length > 0
        ? Object.keys(rows[0]!).map((name) => ({ name, type: 'text' }))
        : [];

    return { columns, rows, rowCount: rows.length, durationMs: Date.now() - start };
  }

  async getSchema(): Promise<SchemaInfo> {
    try {
      const indices = await this.getDatabases();
      const tables = await Promise.all(
        indices.slice(0, 30).map(async (idx) => {
          try {
            const res = await fetch(`${this.baseUrl}/${idx}/_mapping`, { headers: this.headers });
            const json = (await res.json()) as Record<
              string,
              { mappings?: { properties?: Record<string, { type?: string }> } }
            >;
            const props = json[idx]?.mappings?.properties ?? {};
            return {
              name: idx,
              columns: [
                { name: '_id', type: 'keyword', nullable: false, isPrimary: true },
                ...Object.entries(props).map(([name, f]) => ({
                  name,
                  type: f.type ?? 'object',
                  nullable: true,
                })),
              ],
            };
          } catch {
            return { name: idx, columns: [{ name: '_id', type: 'keyword', nullable: false, isPrimary: true }] };
          }
        }),
      );
      return { tables };
    } catch {
      return { tables: [] };
    }
  }

  async close(): Promise<void> {
    // Stateless HTTP — no connection to close
  }
}
