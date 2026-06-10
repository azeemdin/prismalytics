import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Query,
  QueryExecution,
  User,
  Datasource,
  QueryVisibility,
  TeamMember,
  Visualization,
} from '../../database/entities';
import { CreateQueryDto, UpdateQueryDto, ExecuteQueryDto } from './dto/query.dto';
import { DatasourcesService } from '../datasources/datasources.service';
import { createConnector } from '../datasources/connectors/connector.factory';
import { QueryResult } from '../datasources/connectors/connector.interface';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';

const QUERY_TIMEOUT_MS = 30_000;
const MAX_ROWS = 10_000;

const SQL_ALLOWLIST = /^\s*SELECT\b/i;
const SQL_BLOCKLIST = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|EXEC|EXECUTE|CALL)\b/i;

function validateSql(sql: string) {
  if (!SQL_ALLOWLIST.test(sql)) {
    throw new BadRequestException('Only SELECT statements are permitted');
  }
  if (SQL_BLOCKLIST.test(sql)) {
    throw new BadRequestException('Query contains disallowed SQL operations');
  }
}

function coerceParam(val: string): unknown {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== '') return n;
  return val;
}

function resolveMongoParameters(node: unknown, params: Record<string, unknown>): unknown {
  if (typeof node === 'string') {
    const m = node.match(/^:([a-zA-Z_]\w*)$/);
    if (m && m[1] !== undefined && m[1] in params) {
      const raw = params[m[1]];
      return coerceParam(String(raw));
    }
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => resolveMongoParameters(item, params));
  }
  if (node !== null && typeof node === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      result[k] = resolveMongoParameters(v, params);
    }
    return result;
  }
  return node;
}

@Injectable()
export class QueriesService {
  private readonly logger = new Logger(QueriesService.name);

  constructor(
    @InjectRepository(Query) private queryRepo: Repository<Query>,
    @InjectRepository(QueryExecution) private execRepo: Repository<QueryExecution>,
    @InjectRepository(Datasource) private datasourceRepo: Repository<Datasource>,
    @InjectRepository(TeamMember) private teamMemberRepo: Repository<TeamMember>,
    @InjectRepository(Visualization) private visualizationRepo: Repository<Visualization>,
    private datasourcesService: DatasourcesService,
    private cacheService: CacheService,
    private metrics: MetricsService,
  ) {}

  async create(tenantId: string, user: User, dto: CreateQueryDto) {
    await this.ensureDatasourceBelongsToTenant(dto.datasourceId, tenantId);
    const query = this.queryRepo.create({
      tenantId,
      createdById: user.id,
      datasourceId: dto.datasourceId,
      name: dto.name,
      description: dto.description,
      sql: dto.sql,
      targetCollection: dto.targetCollection,
      targetDatabase: dto.targetDatabase,
      parameters: dto.parameters,
      folderId: dto.folderId ?? undefined,
      visibility: dto.visibility ?? QueryVisibility.EDITORS,
    });
    return this.queryRepo.save(query);
  }

  async findAll(user: User, options: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 200 } = options;
    const { tenantId, id: userId, role } = user;

    // Keep this deliberately simple — no QueryBuilder JOINs, just TypeORM findAndCount.
    // Visibility filtering and search are done client-side on the fetched result.
    const whereConditions =
      role === 'admin'
        ? [{ tenantId }]
        : [
            { tenantId, createdById: userId },                          // own (any visibility)
            { tenantId, visibility: QueryVisibility.EDITORS },          // shared with all editors
            { tenantId, visibility: QueryVisibility.TEAM, createdById: userId }, // own team-shared
          ];

    const [queries, total] = await this.queryRepo.findAndCount({
      where: whereConditions,
      order: { createdAt: 'DESC' },
      relations: ['createdBy', 'datasource', 'folder'],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Also include team-shared queries from users whose team this user belongs to
    if (role !== 'admin') {
      const memberships = await this.teamMemberRepo.find({ where: { memberId: userId } });
      if (memberships.length > 0) {
        const ownerIds = memberships.map((m) => m.ownerId);
        const teamQueries = await this.queryRepo.find({
          where: ownerIds.map((ownerId) => ({
            tenantId,
            createdById: ownerId,
            visibility: QueryVisibility.TEAM,
          })),
          relations: ['createdBy', 'datasource', 'folder'],
        });
        // Merge, dedup, re-sort
        const seen = new Set(queries.map((q) => q.id));
        for (const tq of teamQueries) {
          if (!seen.has(tq.id)) queries.push(tq);
        }
        queries.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
      }
    }

    return { queries, total, page, limit };
  }

  async findOne(id: string, tenantId: string) {
    const query = await this.queryRepo.findOne({
      where: { id, tenantId },
      relations: ['createdBy', 'datasource'],
    });
    if (!query) throw new NotFoundException('Query not found');
    return query;
  }

  async update(id: string, tenantId: string, dto: UpdateQueryDto) {
    const query = await this.findOne(id, tenantId);
    // Empty string clears the folder; a UUID moves it; undefined leaves it unchanged
    if (dto.folderId === '') {
      query.folderId = undefined;
    } else if (dto.folderId !== undefined) {
      query.folderId = dto.folderId;
    }
    const { folderId: _f, ...rest } = dto;
    Object.assign(query, rest);
    return this.queryRepo.save(query);
  }

  async delete(id: string, tenantId: string) {
    const query = await this.findOne(id, tenantId);

    const usages = await this.visualizationRepo.find({
      where: { queryId: id, tenantId },
      relations: ['dashboard'],
      select: { id: true, title: true, dashboardId: true, dashboard: { id: true, name: true } } as never,
    });

    if (usages.length > 0) {
      const locations = [...new Set(
        usages.map((v) =>
          v.dashboard ? `dashboard "${v.dashboard.name}"` : `chart library ("${v.title}")`
        ),
      )];
      throw new BadRequestException(
        `Query is still used in ${locations.join(', ')}. Remove those charts first, then delete the query.`,
      );
    }

    await this.queryRepo.remove(query);
  }

  async execute(tenantId: string, user: User, dto: ExecuteQueryDto) {
    const ds = await this.datasourceRepo.findOne({
      where: { id: dto.datasourceId, tenantId },
      select: { id: true, type: true, config: true, encryptedPassword: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');

    const isMongo = ds.type === 'mongodb';
    const isCsv = ds.type === 'csv';
    const isRestApi = ds.type === 'rest_api';
    const isElastic = ds.type === 'elasticsearch';
    if (!isMongo && !isCsv && !isRestApi && !isElastic) {
      validateSql(dto.sql);
    }

    let rawSql = dto.sql;
    if (isMongo && dto.targetCollection) {
      try {
        const trimmed = dto.sql.trim();
        const parsed = JSON.parse(trimmed) as unknown;
        const isFullQuery =
          !Array.isArray(parsed) &&
          typeof parsed === 'object' &&
          parsed !== null &&
          Boolean((parsed as Record<string, unknown>).collection);

        if (!isFullQuery) {
          const mongoQuery: Record<string, unknown> = Array.isArray(parsed)
            ? { collection: dto.targetCollection, pipeline: parsed }
            : { collection: dto.targetCollection, filter: parsed };
          rawSql = JSON.stringify(mongoQuery);
        }
      } catch {
        throw new BadRequestException(
          'Invalid JSON. Enter a filter {} or pipeline [{$match:{}}]',
        );
      }
    }

    const cacheKey = CacheService.buildKey(dto.datasourceId, rawSql, dto.parameters);
    if (!isCsv) {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        this.metrics.recordCacheHit();
        return JSON.parse(cached) as QueryResult & { truncated?: boolean };
      }
      this.metrics.recordCacheMiss();
    }

    const password = this.datasourcesService.getDecryptedPassword(ds);
    const connector = createConnector(ds, password);

    const execution = this.execRepo.create({
      tenantId,
      executedById: user.id,
      datasourceId: dto.datasourceId,
      sql: rawSql,
      parameters: dto.parameters,
    });

    try {
      let execSql = rawSql;
      const execValues: unknown[] = [];
      if (isMongo) {
        if (dto.parameters && Object.keys(dto.parameters).length > 0) {
          try {
            const parsed = JSON.parse(rawSql) as unknown;
            const resolved = resolveMongoParameters(parsed, dto.parameters as Record<string, unknown>);
            execSql = JSON.stringify(resolved);
          } catch {
            throw new BadRequestException('Failed to resolve parameters in MongoDB query');
          }
        }
      } else {
        const resolved = this.resolveParameters(rawSql, dto.parameters);
        execSql = resolved.sql;
        execValues.push(...resolved.values);
      }

      const resultPromise = connector.query(execSql, execValues, dto.targetDatabase);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout exceeded')), QUERY_TIMEOUT_MS),
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);

      if (result.rows.length > MAX_ROWS) {
        result.rows = result.rows.slice(0, MAX_ROWS);
      }

      execution.success = true;
      execution.rowCount = result.rowCount;
      execution.durationMs = result.durationMs;
      await this.execRepo.save(execution);

      this.metrics.recordQuery('success', result.durationMs);
      const finalResult = { ...result, truncated: result.rowCount > MAX_ROWS };
      if (!isCsv) {
        void this.cacheService.set(cacheKey, JSON.stringify(finalResult));
      }
      return finalResult;
    } catch (err) {
      execution.success = false;
      execution.errorMessage = (err as Error).message;
      await this.execRepo.save(execution);
      this.metrics.recordQuery('error', 0);
      throw new BadRequestException(`Query failed: ${(err as Error).message}`);
    } finally {
      await connector.close().catch(() => {});
    }
  }

  async executeById(id: string, tenantId: string, user: User, params?: Record<string, unknown>) {
    const query = await this.findOne(id, tenantId);

    let targetCollection = query.targetCollection;
    let targetDatabase = query.targetDatabase;

    if (!targetCollection) {
      try {
        const parsed = JSON.parse(query.sql);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.collection) {
          targetCollection = parsed.collection as string;
          targetDatabase = targetDatabase ?? (parsed.database as string | undefined);
        }
      } catch {
        // not JSON
      }
    }

    return this.execute(tenantId, user, {
      sql: query.sql,
      datasourceId: query.datasourceId,
      parameters: params,
      targetCollection,
      targetDatabase,
    });
  }

  async getHistory(tenantId: string, queryId?: string, page = 1, limit = 20) {
    const where = queryId ? { tenantId, queryId } : { tenantId };
    const [executions, total] = await this.execRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: ['executedBy'],
      skip: (page - 1) * limit,
      take: limit,
    });
    return { executions, total, page, limit };
  }

  private resolveParameters(
    sql: string,
    params?: Record<string, unknown>,
  ): { sql: string; values: unknown[] } {
    if (!params || Object.keys(params).length === 0) {
      return { sql, values: [] };
    }

    const values: unknown[] = [];
    let index = 1;
    const resolved = sql.replace(/:(\w+)/g, (_match, name: string) => {
      if (name in params) {
        values.push(params[name]);
        return `$${index++}`;
      }
      return `:${name}`;
    });

    return { sql: resolved, values };
  }

  private async ensureDatasourceBelongsToTenant(datasourceId: string, tenantId: string) {
    const exists = await this.datasourceRepo.count({ where: { id: datasourceId, tenantId } });
    if (!exists) throw new ForbiddenException('Datasource not found or access denied');
  }
}
