import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AiApiKey, AiUsageRecord, Datasource, Query, QueryFolder, QueryVisibility, QueryStatus, Tenant, AiPromptTemplate, User } from '../../database/entities';
import type { AiProvider, PromptFeature } from '../../database/entities';
import { DashboardStatus, DashboardVisibility } from '../../database/entities/dashboard.entity';
import type { ChartType } from '../../database/entities/visualization.entity';
import { SystemConfigService } from '../system-config/system-config.service';
import { Dashboard } from '../../database/entities/dashboard.entity';
import { Visualization } from '../../database/entities/visualization.entity';
import { createConnector } from '../datasources/connectors/connector.factory';
import { getProxyDispatcher } from '../../common/utils/proxy.util';

export interface AiConfigStatus {
  configured: boolean;
  provider: string;
  message: string;
  byokProviders: AiProvider[];
}

export interface AutoDashboardProposal {
  id: string;
  title: string;
  description: string;
  chartType: ChartType;
  sql: string;
  category: 'metric' | 'chart' | 'table';
  reasoning: string;
  columnMapping?: Partial<{ value: string; xAxis: string; yAxis: string; label: string; series: string }>;
}

// â”€â”€â”€ Encryption (mirrors datasources.service.ts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'prismalytics-default-enc-key-32byt';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0] ?? '', 'hex');
  const tag = Buffer.from(parts[1] ?? '', 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
}

// â”€â”€â”€ LLM adapter types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface LlmResponse {
  text: string;
  provider: AiProvider;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

// â”€â”€â”€ Vertex AI token cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface CachedToken { token: string; expiresAt: number; }
const vertexTokenCache = new Map<string, CachedToken>();

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
    @InjectRepository(AiApiKey) private keyRepo: Repository<AiApiKey>,
    @InjectRepository(AiUsageRecord) private usageRepo: Repository<AiUsageRecord>,
    @InjectRepository(Datasource) private datasourceRepo: Repository<Datasource>,
    @InjectRepository(Query) private queryRepo: Repository<Query>,
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectRepository(AiPromptTemplate) private promptRepo: Repository<AiPromptTemplate>,
    @InjectRepository(Dashboard) private dashboardRepo: Repository<Dashboard>,
    @InjectRepository(Visualization) private vizRepo: Repository<Visualization>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(QueryFolder) private folderRepo: Repository<QueryFolder>,
  ) {}

  private async getCallTimeoutMs(): Promise<number> {
    const stored = await this.systemConfig.get('ai.timeout');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed * 1_000;
    }
    const envSeconds = this.config.get<string>('AI_TIMEOUT');
    if (envSeconds) {
      const parsed = parseInt(envSeconds, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed * 1_000;
    }
    return 60_000; // default 60 s
  }

  // â”€â”€â”€ BYOK key management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listApiKeys(tenantId: string) {
    const keys = await this.keyRepo.find({ where: { tenantId } });
    return keys.map((k) => ({ id: k.id, provider: k.provider, model: k.model, enabled: k.enabled, createdAt: k.createdAt }));
  }

  async upsertApiKey(tenantId: string, provider: AiProvider, rawKey?: string, model?: string) {
    let entry = await this.keyRepo.findOne({ where: { tenantId, provider } });
    if (!entry) {
      if (!rawKey) throw new Error('API key is required when adding a new provider');
      entry = this.keyRepo.create({ tenantId, provider, encryptedKey: '', enabled: true, model: null });
    }
    if (rawKey) entry.encryptedKey = encrypt(rawKey);
    entry.enabled = true;
    entry.model = model?.trim() || null;
    return this.keyRepo.save(entry);
  }

  async deleteApiKey(tenantId: string, provider: AiProvider) {
    const entry = await this.keyRepo.findOne({ where: { tenantId, provider } });
    if (!entry) throw new NotFoundException('API key not found');
    await this.keyRepo.remove(entry);
  }

  private async resolveApiKey(
    tenantId: string,
    provider: AiProvider | 'ollama',
  ): Promise<{ key: string; model: string | null } | null> {
    // BYOK first, then fall back to server-level env variable
    const entry = await this.keyRepo.findOne({ where: { tenantId, provider: provider as AiProvider, enabled: true } });
    if (entry) return { key: decrypt(entry.encryptedKey), model: entry.model };

    if (provider === 'ollama') {
      const baseUrl = this.config.get<string>('OLLAMA_BASE_URL');
      return baseUrl ? { key: baseUrl, model: this.config.get<string>('OLLAMA_MODEL') ?? 'llama3.2' } : null;
    }

    if (provider === 'gemini-vertex') {
      const saJson = this.config.get<string>('VERTEX_SA_JSON');
      if (!saJson) return null;
      const region = this.config.get<string>('VERTEX_REGION') ?? 'us-central1';
      const model = this.config.get<string>('VERTEX_MODEL') ?? 'gemini-1.5-flash-001';
      return { key: saJson, model: `${region}:${model}` };
    }

    const envKey = provider === 'gemini'
      ? this.config.get<string>('GEMINI_API_KEY')
      : provider === 'claude'
        ? this.config.get<string>('CLAUDE_API_KEY')
        : this.config.get<string>('OPENROUTER_API_KEY');

    return envKey ? { key: envKey, model: null } : null;
  }

  // â”€â”€â”€ Config status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getConfigStatus(tenantId?: string): Promise<AiConfigStatus> {
    const provider = (this.config.get<string>('AI_DEFAULT_PROVIDER') ?? 'gemini') as AiProvider;
    const byokKeys = tenantId
      ? await this.keyRepo.find({ where: { tenantId, enabled: true } })
      : [];
    const byokProviders = byokKeys.map((k) => k.provider);

    const serverKey = this.config.get<string>('GEMINI_API_KEY')
      || this.config.get<string>('VERTEX_SA_JSON')
      || this.config.get<string>('CLAUDE_API_KEY')
      || this.config.get<string>('OPENROUTER_API_KEY');

    const configured = !!(serverKey || byokProviders.length);

    let message: string;
    if (!configured) {
      message = 'Configure an API key in Settings â†’ AI to enable AI features';
    } else if (byokProviders.length) {
      const byokKey = byokKeys[0]!;
      const modelLabel = byokKey.model ? ` / ${byokKey.model}` : '';
      message = `AI active BYOK: ${byokKey.provider}${modelLabel}`;
    } else {
      const serverProvider = this.config.get<string>('GEMINI_API_KEY') ? 'gemini'
        : this.config.get<string>('CLAUDE_API_KEY') ? 'claude'
        : 'openrouter';
      const envModelKey = serverProvider === 'gemini' ? 'GEMINI_MODEL'
        : serverProvider === 'claude' ? 'CLAUDE_MODEL'
        : 'OPENROUTER_MODEL';
      const envModel = this.config.get<string>(envModelKey);
      const modelLabel = envModel ? ` / ${envModel}` : '';
      message = `AI active server env: ${serverProvider}${modelLabel}`;
    }

    return { configured, provider, byokProviders, message };
  }

  // â”€â”€â”€ LLM callers (raw REST, no SDK) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async callGemini(apiKey: string, prompt: string, modelOverride?: string | null, timeoutMs = 60_000): Promise<LlmResponse> {
    const model = modelOverride ?? this.config.get<string>('GEMINI_MODEL') ?? 'gemini-1.5-flash-latest';
    const opts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(timeoutMs),
    };
    const dispatcher = getProxyDispatcher();
    if (dispatcher) (opts as Record<string, unknown>).dispatcher = dispatcher;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      opts,
    );
    if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return {
      text, provider: 'gemini', model,
      tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  private async callClaude(apiKey: string, prompt: string, modelOverride?: string | null, timeoutMs = 60_000): Promise<LlmResponse> {
    const model = modelOverride ?? this.config.get<string>('CLAUDE_MODEL') ?? 'claude-haiku-4-5-20251001';
    const opts: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    };
    const dispatcher = getProxyDispatcher();
    if (dispatcher) (opts as Record<string, unknown>).dispatcher = dispatcher;
    const res = await fetch('https://api.anthropic.com/v1/messages', opts);
    if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      content?: { text: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = json.content?.[0]?.text ?? '';
    return {
      text, provider: 'claude', model,
      tokensIn: json.usage?.input_tokens ?? 0,
      tokensOut: json.usage?.output_tokens ?? 0,
    };
  }

  private async callOpenRouter(apiKey: string, prompt: string, modelOverride?: string | null, timeoutMs = 60_000): Promise<LlmResponse> {
    const model = modelOverride ?? this.config.get<string>('OPENROUTER_MODEL') ?? 'openai/gpt-4o-mini';
    const opts: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    };
    const dispatcher = getProxyDispatcher();
    if (dispatcher) (opts as Record<string, unknown>).dispatcher = dispatcher;
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', opts);
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      choices?: { message?: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    return {
      text, provider: 'openrouter', model,
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
    };
  }

  private async callOllama(baseUrl: string, prompt: string, model: string, timeoutMs = 60_000): Promise<LlmResponse> {
    const opts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    };
    const dispatcher = getProxyDispatcher();
    if (dispatcher) (opts as Record<string, unknown>).dispatcher = dispatcher;
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, opts);
    if (!res.ok) throw new Error(`Ollama API error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { response?: string };
    return { text: json.response ?? '', provider: 'ollama' as AiProvider, model, tokensIn: 0, tokensOut: 0 };
  }

  private buildGoogleJwt(clientEmail: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(privateKey, 'base64url');
    return `${header}.${payload}.${signature}`;
  }

  private async getVertexAccessToken(saJson: string, cacheKey: string): Promise<string> {
    const cached = vertexTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
    const jwt = this.buildGoogleJwt(sa.client_email, sa.private_key);

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    });
    const opts: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(10_000) };
    const dispatcher = getProxyDispatcher();
    if (dispatcher) (opts as Record<string, unknown>).dispatcher = dispatcher;

    const res = await fetch('https://oauth2.googleapis.com/token', opts);
    if (!res.ok) throw new Error(`Vertex AI token exchange failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    const expiresAt = Date.now() + json.expires_in * 1000;
    vertexTokenCache.set(cacheKey, { token: json.access_token, expiresAt });
    return json.access_token;
  }

  private async callGeminiVertex(saJson: string, prompt: string, modelField: string | null, cacheKey: string, timeoutMs = 60_000): Promise<LlmResponse> {
    const sa = JSON.parse(saJson) as { project_id: string; client_email: string };
    // modelField format: "{region}:{modelName}" e.g. "us-central1:gemini-1.5-flash-001"
    const parts = (modelField ?? '').split(':');
    const region = parts[0] || this.config.get<string>('VERTEX_REGION') || 'us-central1';
    const model = parts.slice(1).join(':') || this.config.get<string>('VERTEX_MODEL') || 'gemini-1.5-flash-001';
    const projectId = sa.project_id;

    const accessToken = await this.getVertexAccessToken(saJson, cacheKey);
    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`;

    const opts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(timeoutMs),
    };
    const dispatcher = getProxyDispatcher();
    if (dispatcher) (opts as Record<string, unknown>).dispatcher = dispatcher;

    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Vertex AI API error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      provider: 'gemini-vertex',
      model: `${region}:${model}`,
      tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  private async callLlm(
    tenantId: string,
    prompt: string,
    userId?: string,
    feature?: string,
  ): Promise<LlmResponse> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const defaultProvider = (
      tenant?.settings?.preferredAiProvider ??
      this.config.get<string>('AI_DEFAULT_PROVIDER') ??
      'gemini'
    ) as AiProvider;
    const others: AiProvider[] = (['gemini', 'gemini-vertex', 'claude', 'openrouter'] as AiProvider[]).filter(
      (p) => p !== defaultProvider,
    );
    // Ollama is tried last as a self-hosted fallback
    const order: (AiProvider | 'ollama')[] = [defaultProvider, ...others, 'ollama'];

    const totalTimeoutMs = await this.getCallTimeoutMs();
    const deadline = Date.now() + totalTimeoutMs;
    let lastError: string | undefined;
    let configuredProviders = 0;

    for (const provider of order) {
      const resolved = await this.resolveApiKey(tenantId, provider);
      if (!resolved) continue;
      configuredProviders++;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        lastError = `${provider}: total AI timeout (${totalTimeoutMs}ms) exceeded`;
        break;
      }
      const start = Date.now();
      let result: LlmResponse | undefined;
      let success = true;
      try {
        if (provider === 'claude') result = await this.callClaude(resolved.key, prompt, resolved.model, remaining);
        else if (provider === 'gemini') result = await this.callGemini(resolved.key, prompt, resolved.model, remaining);
        else if (provider === 'gemini-vertex') result = await this.callGeminiVertex(resolved.key, prompt, resolved.model, `${tenantId}:vertex`, remaining);
        else if (provider === 'openrouter') result = await this.callOpenRouter(resolved.key, prompt, resolved.model, remaining);
        else if (provider === 'ollama') result = await this.callOllama(resolved.key, prompt, resolved.model ?? 'llama3.2', remaining);
      } catch (err) {
        success = false;
        const errMsg = (err as Error).message;
        lastError = `${provider}: ${errMsg}`;
        this.logger.warn(`${provider} call failed: ${errMsg}`);
      }
      // Only log usage for cloud providers (not ollama no token counts available)
      if (provider !== 'ollama') {
        void this.usageRepo.save(
          this.usageRepo.create({
            tenantId,
            userId: userId ?? null,
            provider: provider as AiProvider,
            model: result?.model ?? resolved.model ?? provider,
            feature: feature ?? null,
            tokensIn: result?.tokensIn ?? 0,
            tokensOut: result?.tokensOut ?? 0,
            latencyMs: Date.now() - start,
            success,
          }),
        ).catch((e) => this.logger.error('Failed to save AI usage record', e));
      }
      if (result) return result;
    }
    if (configuredProviders === 0) {
      throw new Error('No AI provider configured. Add an API key in Settings â†’ AI.');
    }
    throw new Error(`AI provider call failed: ${lastError ?? 'unknown error'}`);
  }

  async getUsageStats(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const records = await this.usageRepo
      .createQueryBuilder('u')
      .where('u.tenantId = :tenantId AND u.createdAt >= :since', { tenantId, since })
      .orderBy('u.createdAt', 'DESC')
      .limit(500)
      .getMany();

    // Resolve user names in bulk for all records that have a userId
    const userIds = [...new Set(records.map((r) => r.userId).filter((id): id is string => !!id))];
    const userMap = new Map<string, { name: string; email: string }>();
    if (userIds.length > 0) {
      const users = await this.userRepo.find({ where: userIds.map((id) => ({ id })), select: ['id', 'name', 'email'] });
      for (const u of users) userMap.set(u.id, { name: u.name, email: u.email });
    }

    return records.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userId ? (userMap.get(r.userId)?.name ?? null) : null,
      userEmail: r.userId ? (userMap.get(r.userId)?.email ?? null) : null,
      provider: r.provider,
      model: r.model,
      feature: r.feature,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      success: r.success,
      createdAt: r.createdAt,
    }));
  }

  // â”€â”€â”€ NL-to-SQL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private buildNlPrompt(
    dsType: string,
    dbName: string,
    userPrompt: string,
    schemaContext?: string,
  ): string {
    const schema = schemaContext ? `\nAvailable schema:\n${schemaContext}\n` : '';
    const exactNames = schemaContext
      ? '- Use exact table and column names as provided in the schema above.'
      : '';

    switch (dsType) {
      case 'mongodb':
        return `You are a MongoDB query expert. Generate a valid MongoDB query for the user's request.
Target database: ${dbName}.${schema}
Rules:
- Return ONLY a valid MongoDB JSON query no SQL, no explanation, no markdown fences.
- For simple reads use find format: {"filter":{...},"projection":{...},"sort":{...},"limit":N}
- For aggregations use a pipeline array: [{"$match":{...}},{"$group":{...}},...]
- Do NOT generate SQL. MongoDB uses JSON-based queries only.
${exactNames}
- Keep the query concise and efficient.

User request: ${userPrompt}`;

      case 'mssql':
        return `You are a T-SQL (Microsoft SQL Server) expert. Generate a valid T-SQL SELECT query for the user's request.
Target database: SQL Server, database name: ${dbName}.${schema}
Rules:
- Return ONLY the raw T-SQL. No explanation, no markdown, no comments.
- Use only SELECT. No INSERT, UPDATE, DELETE, DROP, TRUNCATE, or DDL.
- Use T-SQL syntax: TOP N instead of LIMIT, GETDATE() for current timestamp, ISNULL() for null handling, CONVERT/CAST for types, square-bracket quoting for reserved words.
${exactNames}
- Keep the query concise and efficient.

User request: ${userPrompt}`;

      case 'mysql':
        return `You are a MySQL expert. Generate a valid MySQL SELECT query for the user's request.
Target database: MySQL, database name: ${dbName}.${schema}
Rules:
- Return ONLY the raw MySQL SQL. No explanation, no markdown, no comments.
- Use only SELECT. No INSERT, UPDATE, DELETE, DROP, or DDL.
- Use MySQL syntax: LIMIT/OFFSET for pagination, NOW()/CURDATE() for dates, IFNULL() for null handling, GROUP_CONCAT() for aggregation, backtick quoting for identifiers.
${exactNames}
- Keep the query concise and efficient.

User request: ${userPrompt}`;

      case 'sqlite':
        return `You are a SQLite expert. Generate a valid SQLite SELECT query for the user's request.
Target database: SQLite, file: ${dbName}.${schema}
Rules:
- Return ONLY the raw SQLite SQL. No explanation, no markdown, no comments.
- Use only SELECT. No INSERT, UPDATE, DELETE, DROP, or DDL.
- Use SQLite syntax: LIMIT/OFFSET for pagination, date('now') for current date, strftime() for formatting, COALESCE() for null handling, no RIGHT JOIN (use LEFT JOIN instead).
${exactNames}
- Keep the query concise and efficient.

User request: ${userPrompt}`;

      default: // postgresql
        return `You are a PostgreSQL expert. Generate a valid PostgreSQL SELECT query for the user's request.
Target database: PostgreSQL, database name: ${dbName}.${schema}
Rules:
- Return ONLY the raw PostgreSQL SQL. No explanation, no markdown, no comments.
- Use only SELECT. No INSERT, UPDATE, DELETE, DROP, or DDL.
- Use PostgreSQL syntax: LIMIT/OFFSET for pagination, NOW() for timestamps, COALESCE() for null handling, :: for casting, DATE_TRUNC() and TO_CHAR() for date formatting, ILIKE for case-insensitive matching.
${exactNames}
- Keep the query concise and efficient.

User request: ${userPrompt}`;
    }
  }

  async nlToSql(tenantId: string, prompt: string, datasourceId: string, schemaContext?: string, userId?: string) {
    const ds = await this.datasourceRepo.findOne({ where: { id: datasourceId, tenantId } });
    if (!ds) throw new NotFoundException('Datasource not found');

    const systemPrompt = this.buildNlPrompt(
      ds.type,
      String(ds.config.database ?? 'unknown'),
      prompt,
      schemaContext,
    );

    const result = await this.callLlm(tenantId, systemPrompt, userId, 'nl_to_sql');

    const sql = result.text
      .replace(/```sql\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    return { sql, provider: result.provider, model: result.model };
  }

  async generateReport(tenantId: string, queryId: string): Promise<{ title: string; sections: { heading: string; content: string }[]; insights: string[] }> {
    const query = await this.queryRepo.findOne({ where: { id: queryId, tenantId } });
    if (!query) throw new NotFoundException('Query not found');

    const ds = await this.datasourceRepo.findOne({
      where: { id: query.datasourceId, tenantId },
      select: { id: true, type: true, config: true, encryptedPassword: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');

    // Decrypt password using same helper as datasources.service.ts
    const parts = ds.encryptedPassword ? ds.encryptedPassword.split(':') : [];
    let password = '';
    if (parts.length === 3) {
      const iv = Buffer.from(parts[0] ?? '', 'hex');
      const tag = Buffer.from(parts[1] ?? '', 'hex');
      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      password = decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
    }

    const connector = createConnector(ds, password);
    let rows: Record<string, unknown>[] = [];
    let columns: string[] = [];
    try {
      const result = await connector.query(query.sql, [], query.targetDatabase);
      rows = (result.rows as Record<string, unknown>[]).slice(0, 200);
      columns = result.columns.map((c: { name: string }) => c.name);
    } finally {
      await connector.close().catch(() => {});
    }

    const prompt = `You are a data analyst. Generate a structured business intelligence report for this query.

Query name: ${query.name}
SQL: ${query.sql}
Total rows: ${rows.length}
Columns: ${columns.join(', ')}
Sample data (first 5 rows):
${JSON.stringify(rows.slice(0, 5), null, 2)}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "title": "Report title",
  "sections": [
    {"heading": "Executive Summary", "content": "..."},
    {"heading": "Key Findings", "content": "..."},
    {"heading": "Trends & Patterns", "content": "..."},
    {"heading": "Recommendations", "content": "..."}
  ],
  "insights": ["insight 1", "insight 2", "insight 3"]
}`;

    const result = await this.callLlm(tenantId, prompt, undefined, 'report_gen');

    let text = result.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(text) as { title: string; sections: { heading: string; content: string }[]; insights: string[] };
    } catch {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        text = text.slice(first, last + 1);
        return JSON.parse(text) as { title: string; sections: { heading: string; content: string }[]; insights: string[] };
      }
      throw new Error('LLM returned invalid JSON for report generation');
    }
  }

  async chat(
    tenantId: string,
    messages: { role: string; content: string }[],
    datasourceId?: string,
    schemaFilter?: string,
  ): Promise<{ reply: string }> {
    const fallbackSystem = 'You are a helpful analytics assistant for a BI platform called prismalytics. Help users understand their data, write SQL queries, and derive business insights.';

    let systemContent = await this.getSystemPrompt(tenantId, 'chat_system', fallbackSystem);

    if (datasourceId) {
      const ds = await this.datasourceRepo.findOne({
        where: { id: datasourceId, tenantId },
        select: { id: true, name: true, type: true, config: true, encryptedPassword: true },
      });

      if (ds) {
        systemContent += `\n\nCurrent datasource: ${ds.name} (${ds.type})`;

        // Fetch schema and inject into context best-effort
        try {
          const parts = ds.encryptedPassword ? ds.encryptedPassword.split(':') : [];
          let password = '';
          if (parts.length === 3) {
            const iv = Buffer.from(parts[0] ?? '', 'hex');
            const tag = Buffer.from(parts[1] ?? '', 'hex');
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            password = decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
          }
          const connector = createConnector(ds, password);
          const schemaInfo = await connector.getSchema();
          await connector.close().catch(() => {});

          // Filter tables to the chosen schema if provided
          const tables = schemaFilter
            ? schemaInfo.tables.filter((t) => (t.schema ?? 'public') === schemaFilter)
            : schemaInfo.tables;

          if (tables.length > 0) {
            const schemaLines = tables.map((t) => {
              const fqn = t.schema ? `${t.schema}.${t.name}` : t.name;
              const cols = t.columns
                .map((c) => `${c.name} ${c.type}${c.isPrimary ? ' PK' : ''}${!c.nullable ? ' NOT NULL' : ''}`)
                .join(', ');
              return `${fqn}(${cols})`;
            });
            const scopeLabel = schemaFilter ? `schema "${schemaFilter}"` : 'all schemas';
            systemContent += `\n\nDatabase schema (${scopeLabel}, ${tables.length} tables):\n${schemaLines.join('\n')}`;
          }
        } catch (err) {
          this.logger.warn(`chat: schema fetch failed for ds ${datasourceId}: ${(err as Error).message}`);
        }
      }
    }

    const systemMessage = { role: 'user', content: systemContent };
    const allMessages = [systemMessage, ...messages];

    const prompt = allMessages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
    const result = await this.callLlm(tenantId, prompt, undefined, 'chat');
    return { reply: result.text.trim() };
  }

  async optimizeQuery(
    tenantId: string,
    sql: string,
    datasourceId: string,
    userId?: string,
  ): Promise<{ suggestions: { category: string; description: string; severity: 'high' | 'medium' | 'low' }[] }> {
    const ds = await this.datasourceRepo.findOne({ where: { id: datasourceId, tenantId } });
    if (!ds) throw new NotFoundException('Datasource not found');

    // Fetch schema for context (best effort don't fail if schema fetch fails)
    let schemaContext = '';
    try {
      const parts = ds.encryptedPassword ? ds.encryptedPassword.split(':') : [];
      let password = '';
      if (parts.length === 3) {
        const iv = Buffer.from(parts[0] ?? '', 'hex');
        const tag = Buffer.from(parts[1] ?? '', 'hex');
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        password = decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
      }
      const connector = createConnector(ds, password);
      const schema = await connector.getSchema();
      await connector.close().catch(() => {});
      schemaContext = schema.tables
        .slice(0, 20)
        .map((t) => `${t.schema ? t.schema + '.' : ''}${t.name}(${t.columns.map((c) => `${c.name} ${c.type}${c.isPrimary ? ' PK' : ''}`).join(', ')})`)
        .join('\n');
    } catch {
      // schema fetch is best-effort
    }

    const schemaSection = schemaContext ? `\nSchema:\n${schemaContext}\n` : '';

    const prompt = `You are a database performance expert. Analyse the SQL query below and return optimization suggestions.
${schemaSection}
SQL:
${sql}

Rules:
- Return ONLY a JSON array, no explanation, no markdown fences.
- Each item has: category (string), description (string), severity ("high"|"medium"|"low").
- Categories: "index", "rewrite", "join", "aggregation", "scan", "other".
- Severity "high" = likely causes slow queries, "medium" = notable improvement possible, "low" = minor or cosmetic.
- If the query is already optimal, return [].
- Maximum 8 suggestions.

Example: [{"category":"index","description":"Add index on orders.customer_id used in WHERE clause.","severity":"high"}]`;

    const result = await this.callLlm(tenantId, prompt, userId, 'query_optimize');

    let text = result.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      const parsed = JSON.parse(text) as unknown;
      const suggestions = Array.isArray(parsed) ? parsed : [];
      return { suggestions: suggestions as { category: string; description: string; severity: 'high' | 'medium' | 'low' }[] };
    } catch {
      const first = text.indexOf('[');
      const last = text.lastIndexOf(']');
      if (first !== -1 && last !== -1) {
        return { suggestions: JSON.parse(text.slice(first, last + 1)) as { category: string; description: string; severity: 'high' | 'medium' | 'low' }[] };
      }
      return { suggestions: [] };
    }
  }

  async recommendChartType(columns: string[], sampleRows: Record<string, unknown>[]): Promise<{ chartType: string; reasoning: string }> {
    if (!columns.length || !sampleRows.length) {
      return { chartType: 'table', reasoning: 'No data to analyse' };
    }

    const firstRow = sampleRows[0] ?? {};
    const numericCols = columns.filter((c) => typeof firstRow[c] === 'number');
    const stringCols = columns.filter((c) => typeof firstRow[c] === 'string');
    const timeLike = /date|time|month|year|day|week/i;
    const hasTimCol = columns.some((c) => timeLike.test(c));

    if (columns.length === 1 && numericCols.length === 1) {
      return { chartType: 'metric', reasoning: 'Single numeric column is best shown as a KPI metric.' };
    }
    if (hasTimCol && numericCols.length > 0) {
      return { chartType: 'line', reasoning: 'A time-based column paired with numeric values is ideal for a line chart.' };
    }
    if (stringCols.length > 0 && numericCols.length >= 1 && numericCols.length <= 2 && sampleRows.length <= 10) {
      return { chartType: 'pie', reasoning: 'Few category-to-numeric rows work well as a pie chart.' };
    }
    if (stringCols.length > 0 && numericCols.length > 0) {
      return { chartType: 'bar', reasoning: 'Category column with numeric values is best shown as a bar chart.' };
    }
    if (numericCols.length >= 2) {
      return { chartType: 'scatter', reasoning: 'Multiple numeric columns can be compared with a scatter plot.' };
    }
    return { chartType: 'table', reasoning: 'No clear chart pattern detected; a table is the safest default.' };
  }

  // â”€â”€â”€ Custom prompt templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getSystemPrompt(tenantId: string, feature: PromptFeature, fallback: string): Promise<string> {
    const tmpl = await this.promptRepo.findOne({ where: { tenantId, feature, isActive: true } });
    return tmpl?.template ?? fallback;
  }

  async listPromptTemplates(tenantId: string) {
    return this.promptRepo.find({ where: { tenantId } });
  }

  async upsertPromptTemplate(tenantId: string, feature: PromptFeature, template: string) {
    let tmpl = await this.promptRepo.findOne({ where: { tenantId, feature } });
    if (!tmpl) {
      tmpl = this.promptRepo.create({ tenantId, feature, template, isActive: true });
    } else {
      tmpl.template = template;
      tmpl.isActive = true;
    }
    return this.promptRepo.save(tmpl);
  }

  async deletePromptTemplate(tenantId: string, feature: PromptFeature) {
    const tmpl = await this.promptRepo.findOne({ where: { tenantId, feature } });
    if (tmpl) await this.promptRepo.remove(tmpl);
  }

  // â”€â”€â”€ Dashboard summarizer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async summarizeDashboard(
    dashboardId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ dashboardName: string; summary: string; insights: string[]; anomalies: string[] }> {
    const dashboard = await this.dashboardRepo.findOne({ where: { id: dashboardId, tenantId } });
    if (!dashboard) throw new NotFoundException('Dashboard not found');

    const vizs = await this.vizRepo.find({ where: { dashboardId, tenantId } });

    // Decrypt helper (re-uses same logic as generateReport)
    const decryptPassword = (encryptedPassword: string | null | undefined): string => {
      if (!encryptedPassword) return '';
      const parts = encryptedPassword.split(':');
      if (parts.length !== 3) return '';
      const iv = Buffer.from(parts[0] ?? '', 'hex');
      const tag = Buffer.from(parts[1] ?? '', 'hex');
      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
    };

    // Fetch chart data for all visualizations in parallel so total wait time is
    // bounded by the slowest single chart rather than the sum of all charts.
    const chartSections = await Promise.all(
      vizs.map(async (viz): Promise<string> => {
        let resolvedSql: string | null = viz.inlineSql ?? null;
        let targetCollection: string | null = null;
        let targetDatabase: string | null = null;
        let dsId: string | null = null;

        if (!resolvedSql && viz.queryId) {
          const q = await this.queryRepo.findOne({ where: { id: viz.queryId, tenantId } });
          resolvedSql = q?.sql ?? null;
          targetCollection = q?.targetCollection ?? null;
          targetDatabase = q?.targetDatabase ?? null;
          dsId = q?.datasourceId ?? null;
        }

        if (!resolvedSql) return `Chart: ${viz.title}\n(No query configured)`;
        if (!dsId) return `Chart: ${viz.title}\n(No datasource available)`;

        const ds = await this.datasourceRepo.findOne({
          where: { id: dsId, tenantId },
          select: { id: true, type: true, config: true, encryptedPassword: true },
        });
        if (!ds) return `Chart: ${viz.title}\n(Datasource not found)`;

        // For MongoDB: embed targetCollection into the query JSON if not already present
        let execSql = resolvedSql;
        if (ds.type === 'mongodb' && targetCollection) {
          try {
            const parsed = JSON.parse(resolvedSql) as unknown;
            const isObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
            const alreadyHasCollection = isObject && Boolean((parsed as Record<string, unknown>).collection);
            if (!alreadyHasCollection) {
              const mongoQuery: Record<string, unknown> = Array.isArray(parsed)
                ? { collection: targetCollection, pipeline: parsed }
                : { collection: targetCollection, ...(parsed as Record<string, unknown>) };
              execSql = JSON.stringify(mongoQuery);
            }
          } catch {
            // not valid JSON pass through and let connector report the error
          }
        }

        try {
          const password = decryptPassword(ds.encryptedPassword);
          const connector = createConnector(ds, password);
          const queryResult = await Promise.race([
            connector.query(execSql, [], targetDatabase ?? undefined),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 15_000)),
          ]);
          await connector.close().catch(() => {});

          const rows = (queryResult.rows as Record<string, unknown>[]).slice(0, 20);
          const colNames = queryResult.columns.map((c: { name: string }) => c.name);
          const preview = [colNames.join(' | '), ...rows.map((r) => colNames.map((c) => String(r[c] ?? '')).join(' | '))].join('\n');
          return `Chart: ${viz.title} (${viz.chartType})\nColumns: ${colNames.join(', ')}\nData preview:\n${preview}`;
        } catch (err) {
          return `Chart: ${viz.title}\n(Query failed: ${(err as Error).message})`;
        }
      }),
    );

    const fallbackPrompt = `You are a BI analyst. Given the following dashboard named "${dashboard.name}" with the data from its charts, provide:
1) A 2-3 sentence executive summary
2) Up to 5 key insights as bullet points
3) Any anomalies or notable trends (empty array if none)

Dashboard charts:
${chartSections.join('\n\n')}

Return ONLY a JSON object with no markdown:
{"summary":"...","insights":["...","..."],"anomalies":["..."]}`;

    const systemPrompt = await this.getSystemPrompt(tenantId, 'dashboard_summary', fallbackPrompt);

    const result = await this.callLlm(tenantId, systemPrompt, userId, 'dashboard_summary');

    let text = result.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      const parsed = JSON.parse(text) as { summary?: string; insights?: string[]; anomalies?: string[] };
      return {
        dashboardName: dashboard.name,
        summary: parsed.summary ?? '',
        insights: parsed.insights ?? [],
        anomalies: parsed.anomalies ?? [],
      };
    } catch {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        const parsed = JSON.parse(text.slice(first, last + 1)) as { summary?: string; insights?: string[]; anomalies?: string[] };
        return { dashboardName: dashboard.name, summary: parsed.summary ?? '', insights: parsed.insights ?? [], anomalies: parsed.anomalies ?? [] };
      }
      return { dashboardName: dashboard.name, summary: result.text.trim(), insights: [], anomalies: [] };
    }
  }

  async saveDashboardSummary(
    dashboardId: string,
    tenantId: string,
    summaryData: { summary: string; insights: string[]; anomalies: string[] },
  ): Promise<void> {
    const dashboard = await this.dashboardRepo.findOne({ where: { id: dashboardId, tenantId } });
    if (!dashboard) throw new NotFoundException('Dashboard not found');
    dashboard.aiSummary = { ...summaryData, generatedAt: new Date().toISOString() };
    await this.dashboardRepo.save(dashboard);
  }

  // â”€â”€â”€ NL alert rule generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async generateAlertRule(
    description: string,
    tenantId: string,
    datasourceId?: string,
  ): Promise<{
    name: string;
    sql: string;
    condition: string;
    threshold: number;
    columnName: string;
    schedule: string;
    reasoning: string;
  }> {
    let schemaContext = '';
    if (datasourceId) {
      try {
        const ds = await this.datasourceRepo.findOne({
          where: { id: datasourceId, tenantId },
          select: { id: true, type: true, config: true, encryptedPassword: true },
        });
        if (ds) {
          const parts = ds.encryptedPassword ? ds.encryptedPassword.split(':') : [];
          let password = '';
          if (parts.length === 3) {
            const iv = Buffer.from(parts[0] ?? '', 'hex');
            const tag = Buffer.from(parts[1] ?? '', 'hex');
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            password = decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
          }
          const connector = createConnector(ds, password);
          const schema = await connector.getSchema();
          await connector.close().catch(() => {});
          schemaContext = schema.tables
            .slice(0, 15)
            .map((t) => `${t.name}(${t.columns.map((c) => `${c.name} ${c.type}`).join(', ')})`)
            .join('\n');
        }
      } catch {
        // schema fetch is best-effort
      }
    }

    const schemaSection = schemaContext ? `\nDatabase schema:\n${schemaContext}\n` : '';

    const fallbackPrompt = `Convert this alert description into a structured alert rule. Return ONLY a JSON object with no markdown or explanation.${schemaSection}

Alert description: "${description}"

The SQL must return a single numeric value. Use aliases if needed (e.g. SELECT COUNT(*) AS value FROM ...).

Return format:
{
  "name": "Short descriptive name",
  "sql": "SELECT ... AS value FROM ...",
  "condition": "gt" | "lt" | "eq" | "gte" | "lte",
  "threshold": 100,
  "columnName": "value",
  "schedule": "0 * * * *",
  "reasoning": "Brief explanation of the rule logic"
}`;

    const systemPrompt = await this.getSystemPrompt(tenantId, 'alert_rule_gen', fallbackPrompt);
    const result = await this.callLlm(tenantId, systemPrompt, undefined, 'alert_rule_gen');

    let text = result.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(text) as { name: string; sql: string; condition: string; threshold: number; columnName: string; schedule: string; reasoning: string };
    } catch {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        return JSON.parse(text.slice(first, last + 1)) as { name: string; sql: string; condition: string; threshold: number; columnName: string; schedule: string; reasoning: string };
      }
      throw new Error('LLM returned invalid JSON for alert rule generation');
    }
  }

  // ─── Auto Dashboard ───────────────────────────────────────────────────────────

  async analyzeForAutoDashboard(
    tenantId: string,
    datasourceId: string,
    selectedTables: string[],
    userId?: string,
    selectedSchema?: string,
  ): Promise<{ proposals: AutoDashboardProposal[] }> {
    const SQL_TYPES = ['postgresql', 'mysql', 'mssql', 'sqlite', 'oracle'];

    const ds = await this.datasourceRepo.findOne({
      where: { id: datasourceId, tenantId },
      select: { id: true, type: true, name: true, config: true, encryptedPassword: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');

    if (!SQL_TYPES.includes(ds.type)) {
      throw new BadRequestException(
        'Auto Dashboard requires a SQL datasource (PostgreSQL, MySQL, MSSQL, SQLite, Oracle)',
      );
    }

    const password = ds.encryptedPassword ? decrypt(ds.encryptedPassword) : '';
    const connector = createConnector(ds, password);

    let tableSchemas: { name: string; schema?: string; columns: { name: string; type: string; nullable: boolean; isPrimary?: boolean }[] }[] = [];
    try {
      const schema = await connector.getSchema(selectedSchema);
      tableSchemas = schema.tables.filter((t) => selectedTables.includes(t.name));
    } catch (err) {
      throw new BadRequestException(`Failed to read schema: ${(err as Error).message}`);
    } finally {
      await connector.close().catch(() => {});
    }

    if (tableSchemas.length === 0) {
      throw new BadRequestException('None of the selected tables were found in the schema');
    }

    const schemaPrefix = selectedSchema ? `${selectedSchema}.` : '';
    const schemaText = tableSchemas
      .map(
        (t) =>
          `${schemaPrefix}${t.name}(${t.columns
            .map((c) => `${c.name} ${c.type}${c.isPrimary ? ' PK' : ''}${!c.nullable ? ' NOT NULL' : ''}`)
            .join(', ')})`,
      )
      .join('\n');

    const proposalCount = Math.min(12, Math.max(6, selectedTables.length * 3));
    const dbName = ((ds.config as Record<string, unknown>).database as string | undefined) ?? ds.name;
    const dialectHints = this.getAutoDashboardDialectHints(ds.type);
    const schemaQualifyRule = selectedSchema
      ? `- ALWAYS qualify every table reference with the schema prefix: ${selectedSchema}.TableName — never omit it`
      : '- Use table names exactly as listed above';

    const fallbackPrompt = `You are a senior BI analyst. Analyze the following database schema and generate exactly ${proposalCount} diverse, high-value dashboard proposals.

Database type: ${ds.type}
Database name: ${dbName}${selectedSchema ? `\nSelected schema: ${selectedSchema}` : ''}

Tables selected by the user (listed as schema.table):
${schemaText}

Requirements:
- Generate a balanced mix: ~30% metric cards, ~50% charts, ~20% data tables
- Metric cards (category "metric", chartType "metric"): single-row SELECT returning one numeric "value" column
- Charts (category "chart"): chartType one of line, bar, area, pie, scatter, funnel
- Tables (category "table"): chartType "table", return relevant columns with LIMIT 100
- Every SQL must start with SELECT only — no mutations
${schemaQualifyRule}
- Column aliases must be lowercase with underscores
- For metrics alias the result as "value"
${dialectHints}

Return ONLY a valid JSON object with no markdown fences, no explanation:
{
  "proposals": [
    {
      "id": "p1",
      "title": "Short chart title (max 8 words)",
      "description": "One sentence describing what this shows and why it matters",
      "chartType": "metric|line|bar|area|pie|scatter|funnel|table",
      "sql": "SELECT ...",
      "category": "metric|chart|table",
      "reasoning": "Why this KPI or visualization is important for this dataset",
      "columnMapping": { "value": "col", "xAxis": "col", "yAxis": "col", "label": "col" }
    }
  ]
}`;

    const systemPrompt = await this.getSystemPrompt(tenantId, 'auto_dashboard', fallbackPrompt);
    const result = await this.callLlm(tenantId, systemPrompt, userId, 'auto_dashboard');

    let text = result.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed: { proposals: AutoDashboardProposal[] };
    try {
      parsed = JSON.parse(text) as { proposals: AutoDashboardProposal[] };
    } catch {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        parsed = JSON.parse(text.slice(first, last + 1)) as { proposals: AutoDashboardProposal[] };
      } else {
        throw new Error('LLM returned invalid JSON for auto dashboard analysis');
      }
    }

    const SQL_ALLOWLIST = /^\s*SELECT\b/i;
    const SQL_BLOCKLIST = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

    const cleanProposals = (parsed.proposals ?? [])
      .filter((p) => p.sql && SQL_ALLOWLIST.test(p.sql) && !SQL_BLOCKLIST.test(p.sql))
      .map((p, i) => ({
        id: p.id ?? `p${i + 1}`,
        title: p.title ?? `Chart ${i + 1}`,
        description: p.description ?? '',
        chartType: (p.chartType ?? 'table') as ChartType,
        sql: p.sql,
        category: (p.category ?? 'chart') as 'metric' | 'chart' | 'table',
        reasoning: p.reasoning ?? '',
        columnMapping: p.columnMapping ?? {},
      }));

    return { proposals: cleanProposals };
  }

  async generateAutoDashboard(
    tenantId: string,
    user: { id: string },
    dto: {
      dashboardName: string;
      description?: string;
      visibility?: string;
      datasourceId: string;
      proposals: AutoDashboardProposal[];
    },
  ): Promise<{ dashboardId: string; queriesCreated: number; chartsCreated: number; folderName: string }> {
    const { dashboardName, description, visibility, datasourceId, proposals } = dto;

    const dsCount = await this.datasourceRepo.count({ where: { id: datasourceId, tenantId } });
    if (!dsCount) throw new NotFoundException('Datasource not found');

    const folder = this.folderRepo.create({
      tenantId,
      createdById: user.id,
      name: dashboardName,
      visibility: QueryVisibility.EDITORS,
    });
    const savedFolder = await this.folderRepo.save(folder);

    const dashboard = this.dashboardRepo.create({
      tenantId,
      createdById: user.id,
      name: dashboardName,
      description: description ?? undefined,
      visibility: (visibility as DashboardVisibility) ?? DashboardVisibility.PRIVATE,
      status: DashboardStatus.DRAFT,
      layout: [],
    });
    const savedDashboard = await this.dashboardRepo.save(dashboard);

    const SQL_ALLOWLIST = /^\s*SELECT\b/i;
    const SQL_BLOCKLIST = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

    const vizItems: { vizId: string; chartType: string }[] = [];
    let queriesCreated = 0;
    let chartsCreated = 0;

    for (const proposal of proposals) {
      if (!SQL_ALLOWLIST.test(proposal.sql) || SQL_BLOCKLIST.test(proposal.sql)) {
        this.logger.warn(`Auto dashboard: skipping "${proposal.title}" — invalid SQL`);
        continue;
      }
      try {
        const query = this.queryRepo.create({
          tenantId,
          createdById: user.id,
          datasourceId,
          name: `${dashboardName} — ${proposal.title}`,
          sql: proposal.sql,
          folderId: savedFolder.id,
          visibility: QueryVisibility.EDITORS,
          status: QueryStatus.PUBLISHED,
        });
        const savedQuery = await this.queryRepo.save(query);
        queriesCreated++;

        const viz = this.vizRepo.create({
          tenantId,
          dashboardId: savedDashboard.id,
          queryId: savedQuery.id,
          title: proposal.title,
          chartType: proposal.chartType as ChartType,
          columnMapping: proposal.columnMapping ?? undefined,
          chartConfig: {},
          sortOrder: chartsCreated,
        });
        const savedViz = await this.vizRepo.save(viz);
        chartsCreated++;
        vizItems.push({ vizId: savedViz.id, chartType: proposal.chartType as string });
      } catch (err) {
        this.logger.error(`Auto dashboard: failed to create "${proposal.title}": ${(err as Error).message}`);
      }
    }

    savedDashboard.layout = this.computeAutoDashboardLayout(vizItems);
    await this.dashboardRepo.save(savedDashboard);

    return { dashboardId: savedDashboard.id, queriesCreated, chartsCreated, folderName: savedFolder.name };
  }

  private getAutoDashboardDialectHints(dsType: string): string {
    const hints: Record<string, string> = {
      postgresql: "- Use DATE_TRUNC('month', date_col) for monthly grouping; cast with ::date\n- Quote identifiers with double quotes when needed",
      mysql: "- Use DATE_FORMAT(date_col, '%Y-%m') for monthly grouping\n- Use backticks for reserved-word identifiers",
      mssql: "- Use FORMAT(date_col, 'yyyy-MM') or DATETRUNC for grouping\n- Use [square brackets] for identifiers",
      sqlite: "- Use strftime('%Y-%m', date_col) for monthly grouping\n- No schema prefix",
      oracle: "- Use TRUNC(date_col, 'MONTH') for monthly grouping; TO_CHAR for formatting\n- Use double quotes for case-sensitive identifiers",
    };
    return hints[dsType] ?? '';
  }

  private computeAutoDashboardLayout(
    items: { vizId: string; chartType: string }[],
  ): { i: string; x: number; y: number; w: number; h: number }[] {
    const layout: { i: string; x: number; y: number; w: number; h: number }[] = [];
    let curX = 0;
    let curY = 0;
    let rowH = 0;

    for (const item of items) {
      const isMetric = item.chartType === 'metric';
      const isTable = item.chartType === 'table' || item.chartType === 'pivot';
      // Grid has 12 columns. metrics: 3 per row (w=4), tables: full width (w=12), charts: 2 per row (w=6)
      const w = isTable ? 12 : isMetric ? 4 : 6;
      const h = isTable ? 8 : isMetric ? 3 : 5;

      if (curX + w > 12) {
        curX = 0;
        curY += rowH;
        rowH = 0;
      }

      layout.push({ i: item.vizId, x: curX, y: curY, w, h });
      curX += w;
      rowH = Math.max(rowH, h);
    }

    return layout;
  }
}
