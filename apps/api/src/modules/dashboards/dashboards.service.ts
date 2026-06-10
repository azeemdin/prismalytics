import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  Dashboard, DashboardShare, DashboardStatus, DashboardVisibility,
  TeamMember, User, Visualization, Query, Datasource, DatasourceStatus,
  QueryFolder, QueryVisibility,
} from '../../database/entities';
import { CreateDashboardDto, UpdateDashboardDto } from './dto/dashboard.dto';

export interface DashboardBundle {
  version: '1';
  exportedAt: string;
  dashboard: {
    name: string;
    description?: string;
    layout: { i: string; x: number; y: number; w: number; h: number }[];
    filters?: unknown[];
    visibility: string;
    status: string;
  };
  visualizations: Array<{
    id: string;
    title: string;
    chartType: string;
    chartConfig: Record<string, unknown>;
    columnMapping?: unknown;
    inlineSql?: string;
    defaultParameters?: Record<string, string>;
    parameterMappings?: Record<string, string>;
    sortOrder: number;
    queryId?: string;
  }>;
  queries: Array<{
    id: string;
    name: string;
    description?: string;
    sql: string;
    targetCollection?: string;
    targetDatabase?: string;
    parameters?: unknown[];
    datasourceId: string;
  }>;
  datasources: Array<{
    id: string;
    name: string;
    description?: string;
    type: string;
    config: Record<string, unknown>;
  }>;
}

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(Dashboard) private dashboardRepo: Repository<Dashboard>,
    @InjectRepository(DashboardShare) private shareRepo: Repository<DashboardShare>,
    @InjectRepository(TeamMember) private teamRepo: Repository<TeamMember>,
    @InjectRepository(Visualization) private vizRepo: Repository<Visualization>,
    @InjectRepository(Query) private queryRepo: Repository<Query>,
    @InjectRepository(Datasource) private datasourceRepo: Repository<Datasource>,
    @InjectRepository(QueryFolder) private folderRepo: Repository<QueryFolder>,
  ) {}

  async create(tenantId: string, user: User, dto: CreateDashboardDto) {
    const dashboard = this.dashboardRepo.create({
      tenantId,
      createdById: user.id,
      name: dto.name,
      description: dto.description,
      visibility: dto.visibility,
      refreshIntervalSeconds: dto.refreshIntervalSeconds,
      layout: [],
    });
    return this.dashboardRepo.save(dashboard);
  }

  async findAll(tenantId: string, page = 1, limit = 20, publishedOnly = false, userId?: string) {
    if (publishedOnly && userId) {
      const [dashboards, total] = await this.dashboardRepo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.createdBy', 'createdBy')
        // per-user share grant
        .leftJoin(DashboardShare, 'ds', 'ds.dashboardId = d.id AND ds.userId = :userId', { userId })
        // owner's team membership
        .leftJoin(
          TeamMember,
          'tm',
          'tm.ownerId = d.createdById AND tm.memberId = :userId',
          { userId },
        )
        .where('d.tenantId = :tenantId', { tenantId })
        .andWhere('d.status = :status', { status: DashboardStatus.PUBLISHED })
        .andWhere(
          '(d.visibility = :pub OR ds.userId IS NOT NULL OR (d.visibility = :team AND tm.memberId IS NOT NULL))',
          { pub: DashboardVisibility.PUBLIC, team: DashboardVisibility.TEAM },
        )
        .orderBy('d.updatedAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
      return { dashboards, total, page, limit };
    }

    const [dashboards, total] = await this.dashboardRepo.findAndCount({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
      relations: ['createdBy'],
      skip: (page - 1) * limit,
      take: limit,
    });
    return { dashboards, total, page, limit };
  }

  async findOne(id: string, tenantId: string, publishedOnly = false, userId?: string) {
    const dashboard = await this.dashboardRepo.findOne({
      where: { id, tenantId },
      relations: ['createdBy'],
    });
    if (!dashboard) throw new NotFoundException('Dashboard not found');
    if (publishedOnly && userId) {
      if (dashboard.status !== DashboardStatus.PUBLISHED) {
        throw new ForbiddenException('This dashboard is not published');
      }
      if (dashboard.visibility === DashboardVisibility.PUBLIC) {
        // public — always accessible
      } else if (dashboard.visibility === DashboardVisibility.TEAM) {
        const member = await this.teamRepo.findOne({
          where: { ownerId: dashboard.createdById, memberId: userId },
        });
        const share = member ? null : await this.shareRepo.findOne({ where: { dashboardId: id, userId } });
        if (!member && !share) throw new ForbiddenException('You do not have access to this dashboard');
      } else {
        // private — requires explicit share
        const share = await this.shareRepo.findOne({ where: { dashboardId: id, userId } });
        if (!share) throw new ForbiddenException('You do not have access to this dashboard');
      }
    }
    return dashboard;
  }

  async update(id: string, tenantId: string, dto: UpdateDashboardDto) {
    const dashboard = await this.findOne(id, tenantId);
    Object.assign(dashboard, dto);
    return this.dashboardRepo.save(dashboard);
  }

  async delete(id: string, tenantId: string) {
    const dashboard = await this.findOne(id, tenantId);
    await this.dashboardRepo.remove(dashboard);
  }

  async duplicate(id: string, tenantId: string, user: User) {
    const src = await this.findOne(id, tenantId);
    const copy = this.dashboardRepo.create({
      ...src,
      id: undefined as unknown as string,
      name: `${src.name} (copy)`,
      createdById: user.id,
      createdAt: undefined as unknown as Date,
      updatedAt: undefined as unknown as Date,
    });
    return this.dashboardRepo.save(copy);
  }

  async generateShareToken(id: string, tenantId: string) {
    const dashboard = await this.findOne(id, tenantId);
    dashboard.shareToken = crypto.randomUUID();
    return this.dashboardRepo.save(dashboard);
  }

  async revokeShareToken(id: string, tenantId: string) {
    const dashboard = await this.findOne(id, tenantId);
    await this.dashboardRepo
      .createQueryBuilder()
      .update()
      .set({ shareToken: null as unknown as string })
      .where('id = :id', { id: dashboard.id })
      .execute();
    dashboard.shareToken = undefined;
    return dashboard;
  }

  async findByShareToken(token: string) {
    const dashboard = await this.dashboardRepo.findOne({
      where: { shareToken: token },
      relations: ['createdBy'],
    });
    if (!dashboard) throw new NotFoundException('Dashboard not found or link has been revoked');
    return dashboard;
  }

  // ─── Per-user sharing ────────────────────────────────────────────────────────

  async getSharees(dashboardId: string, tenantId: string) {
    await this.findOne(dashboardId, tenantId);
    return this.shareRepo.find({
      where: { dashboardId, tenantId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async shareWithUser(dashboardId: string, userId: string, tenantId: string, grantedById: string) {
    await this.findOne(dashboardId, tenantId);
    const existing = await this.shareRepo.findOne({ where: { dashboardId, userId } });
    if (existing) throw new ConflictException('Dashboard already shared with this user');
    const share = this.shareRepo.create({ dashboardId, userId, tenantId, grantedById });
    return this.shareRepo.save(share);
  }

  async unshareWithUser(dashboardId: string, userId: string, tenantId: string) {
    await this.findOne(dashboardId, tenantId);
    await this.shareRepo.delete({ dashboardId, userId });
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  async exportBundle(id: string, tenantId: string): Promise<DashboardBundle> {
    const dashboard = await this.findOne(id, tenantId);

    const vizs = await this.vizRepo.find({
      where: { dashboardId: id, tenantId },
      relations: ['query', 'query.datasource'],
      order: { sortOrder: 'ASC' },
    });

    const seenQueryIds = new Set<string>();
    const seenDsIds = new Set<string>();
    const queries: Query[] = [];
    const datasources: Datasource[] = [];

    for (const v of vizs) {
      if (v.query && !seenQueryIds.has(v.query.id)) {
        seenQueryIds.add(v.query.id);
        queries.push(v.query);
        if (v.query.datasource && !seenDsIds.has(v.query.datasource.id)) {
          seenDsIds.add(v.query.datasource.id);
          datasources.push(v.query.datasource);
        }
      }
    }

    return {
      version: '1',
      exportedAt: new Date().toISOString(),
      dashboard: {
        name: dashboard.name,
        description: dashboard.description,
        layout: dashboard.layout ?? [],
        filters: dashboard.filters,
        visibility: dashboard.visibility,
        status: dashboard.status,
      },
      visualizations: vizs.map((v) => ({
        id: v.id,
        title: v.title,
        chartType: v.chartType,
        chartConfig: v.chartConfig,
        columnMapping: v.columnMapping,
        inlineSql: v.inlineSql,
        defaultParameters: v.defaultParameters,
        parameterMappings: v.parameterMappings,
        sortOrder: v.sortOrder,
        queryId: v.queryId,
      })),
      queries: queries.map((q) => ({
        id: q.id,
        name: q.name,
        description: q.description,
        sql: q.sql,
        targetCollection: q.targetCollection,
        targetDatabase: q.targetDatabase,
        parameters: q.parameters,
        datasourceId: q.datasourceId,
      })),
      datasources: datasources.map((ds) => {
        // Strip any password that may have leaked into the config object
        const { password: _pw, ...safeConfig } = ds.config as Record<string, unknown> & { password?: unknown };
        return {
          id: ds.id,
          name: ds.name,
          description: ds.description,
          type: ds.type,
          config: safeConfig,
        };
      }),
    };
  }

  // ─── Import ──────────────────────────────────────────────────────────────────

  async importBundle(
    tenantId: string,
    user: User,
    bundle: DashboardBundle,
  ): Promise<{ dashboard: Dashboard; newDatasourceIds: string[] }> {
    if (bundle.version !== '1') {
      throw new BadRequestException('Unsupported bundle version');
    }

    // 1. Resolve or create datasources (no credentials — import as INACTIVE)
    const dsIdMap = new Map<string, string>();
    const newDatasourceIds: string[] = [];

    for (const ds of bundle.datasources ?? []) {
      const existing = await this.datasourceRepo.findOne({
        where: { tenantId, name: ds.name, type: ds.type as Datasource['type'] },
      });
      if (existing) {
        dsIdMap.set(ds.id, existing.id);
      } else {
        const created = await this.datasourceRepo.save(
          this.datasourceRepo.create({
            tenantId,
            createdById: user.id,
            name: ds.name,
            description: ds.description,
            type: ds.type as Datasource['type'],
            config: ds.config,
            status: DatasourceStatus.INACTIVE,
          }),
        );
        dsIdMap.set(ds.id, created.id);
        newDatasourceIds.push(created.id);
      }
    }

    // 2. Create a query folder (same name as dashboard, mirrors Auto Dashboard behaviour)
    const folder = await this.folderRepo.save(
      this.folderRepo.create({
        tenantId,
        createdById: user.id,
        name: bundle.dashboard.name,
        visibility: QueryVisibility.EDITORS,
      }),
    );

    // 3. Create queries inside the folder with remapped datasource IDs
    const queryIdMap = new Map<string, string>();
    for (const q of bundle.queries ?? []) {
      const newDsId = dsIdMap.get(q.datasourceId) ?? q.datasourceId;
      const created = await this.queryRepo.save(
        this.queryRepo.create({
          tenantId,
          createdById: user.id,
          name: q.name,
          description: q.description,
          sql: q.sql,
          targetCollection: q.targetCollection,
          targetDatabase: q.targetDatabase,
          parameters: q.parameters as Query['parameters'],
          datasourceId: newDsId,
          folderId: folder.id,
        }),
      );
      queryIdMap.set(q.id, created.id);
    }

    // 4. Create dashboard (always private + draft on import)
    const dashboard = await this.dashboardRepo.save(
      this.dashboardRepo.create({
        tenantId,
        createdById: user.id,
        name: bundle.dashboard.name,
        description: bundle.dashboard.description,
        layout: [],
        filters: bundle.dashboard.filters as Dashboard['filters'],
        visibility: DashboardVisibility.PRIVATE,
        status: DashboardStatus.DRAFT,
      }),
    );

    // 5. Create visualizations with remapped query IDs
    const vizIdMap = new Map<string, string>();
    for (const v of bundle.visualizations ?? []) {
      const newQueryId = v.queryId ? (queryIdMap.get(v.queryId) ?? undefined) : undefined;
      const created = await this.vizRepo.save(
        this.vizRepo.create({
          tenantId,
          dashboardId: dashboard.id,
          title: v.title,
          chartType: v.chartType as Visualization['chartType'],
          chartConfig: v.chartConfig,
          columnMapping: v.columnMapping as Visualization['columnMapping'],
          inlineSql: v.inlineSql,
          defaultParameters: v.defaultParameters,
          parameterMappings: v.parameterMappings,
          sortOrder: v.sortOrder,
          queryId: newQueryId,
        }),
      );
      vizIdMap.set(v.id, created.id);
    }

    // 6. Remap layout viz IDs and persist
    const remappedLayout = (bundle.dashboard.layout ?? []).map((item) => ({
      ...item,
      i: vizIdMap.get(item.i) ?? item.i,
    }));
    dashboard.layout = remappedLayout;
    await this.dashboardRepo.save(dashboard);

    return { dashboard, newDatasourceIds };
  }
}
