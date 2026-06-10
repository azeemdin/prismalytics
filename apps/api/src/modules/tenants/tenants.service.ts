import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, User, Datasource, Dashboard, Query } from '../../database/entities';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Datasource) private datasourceRepo: Repository<Datasource>,
    @InjectRepository(Dashboard) private dashboardRepo: Repository<Dashboard>,
    @InjectRepository(Query) private queryRepo: Repository<Query>,
  ) {}

  async findOne(id: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async updateSettings(
    id: string,
    settings: Partial<Tenant['settings']>,
    branding?: Partial<Tenant['branding']>,
  ) {
    const tenant = await this.findOne(id);
    if (settings) tenant.settings = { ...tenant.settings, ...settings };
    if (branding) tenant.branding = { ...tenant.branding, ...branding };
    return this.tenantRepo.save(tenant);
  }

  async getStats(tenantId: string) {
    const [users, datasources, dashboards, queries] = await Promise.all([
      this.userRepo.count({ where: { tenantId, isActive: true } }),
      this.datasourceRepo.count({ where: { tenantId } }),
      this.dashboardRepo.count({ where: { tenantId } }),
      this.queryRepo.count({ where: { tenantId } }),
    ]);
    return { tenantId, users, datasources, dashboards, queries };
  }
}
