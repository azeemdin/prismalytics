import { DatabaseConnector, QueryResult, SchemaInfo } from './connector.interface';

interface RestQuery {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export class RestApiConnector implements DatabaseConnector {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(
    config: {
      baseUrl: string;
      headers?: Record<string, string>;
    },
    apiKey?: string,
  ) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(config.headers ?? {}),
    };
    if (apiKey) {
      this.defaultHeaders['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(this.baseUrl, { method: 'GET', headers: this.defaultHeaders });
      return { success: res.ok || res.status < 500, message: `HTTP ${res.status}` };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  async getDatabases(): Promise<string[]> {
    return [];
  }

  async getCollections(_database: string): Promise<string[]> {
    return [];
  }

  async query(queryJson: string, _params: unknown[] = []): Promise<QueryResult> {
    const start = Date.now();
    let request: RestQuery = {};
    try {
      request = JSON.parse(queryJson) as RestQuery;
    } catch {
      throw new Error(
        'REST API query must be a valid JSON object: {"method":"GET","path":"/endpoint","params":{}}',
      );
    }

    const method = request.method ?? 'GET';
    const path = request.path ?? '';
    const url = new URL(`${this.baseUrl}${path}`);

    if (request.params && method === 'GET') {
      Object.entries(request.params).forEach(([k, v]) => {
        url.searchParams.set(k, String(v));
      });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: { ...this.defaultHeaders, ...(request.headers ?? {}) },
    };

    if (method !== 'GET' && request.body !== undefined) {
      fetchOptions.body = JSON.stringify(request.body);
    } else if (method !== 'GET' && request.params !== undefined) {
      fetchOptions.body = JSON.stringify(request.params);
    }

    const res = await fetch(url.toString(), fetchOptions);
    if (!res.ok) {
      throw new Error(`REST API returned HTTP ${res.status}: ${await res.text()}`);
    }

    const durationMs = Date.now() - start;
    const json = (await res.json()) as unknown;

    // Normalize response into rows
    const dataArray = Array.isArray(json)
      ? json
      : json !== null && typeof json === 'object'
        ? [json]
        : [{ value: json }];

    const rows = (dataArray as Record<string, unknown>[]).map((item) =>
      typeof item === 'object' && item !== null ? item : { value: item },
    );

    const columns =
      rows.length > 0
        ? Object.keys(rows[0]!).map((name) => ({ name, type: 'text' }))
        : [];

    return { columns, rows, rowCount: rows.length, durationMs };
  }

  async getSchema(): Promise<SchemaInfo> {
    return { tables: [] };
  }

  async close(): Promise<void> {
    // No persistent connections for REST API
  }
}
