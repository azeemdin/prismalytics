import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Dashboard, DashboardShare, DashboardStatus, DashboardVisibility, TeamMember, User } from '../../database/entities';
import { CreateDashboardDto, UpdateDashboardDto } from './dto/dashboard.dto';

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(Dashboard) private dashboardRepo: Repository<Dashboard>,
    @InjectRepository(DashboardShare) private shareRepo: Repository<DashboardShare>,
    @InjectRepository(TeamMember) private teamRepo: Repository<TeamMember>,
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
}
