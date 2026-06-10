import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { AuditLog } from '../../database/entities';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>) {}

  async log(entry: {
    tenantId: string;
    userId?: string;
    userName?: string;
    action: string;
    resource: string;
    resourceId?: string;
    resourceName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const log = this.auditRepo.create(entry);
    await this.auditRepo.save(log).catch(() => {}); // fire and forget; never throw
  }

  async findAll(
    tenantId: string,
    page = 1,
    limit = 50,
    filters: { action?: string; resource?: string; userId?: string; from?: string; to?: string } = {},
  ) {
    const qb = this.auditRepo.createQueryBuilder('a').where('a.tenant_id = :tenantId', { tenantId });
    if (filters.action) qb.andWhere('a.action = :action', { action: filters.action });
    if (filters.resource) qb.andWhere('a.resource = :resource', { resource: filters.resource });
    if (filters.userId) qb.andWhere('a.user_id = :userId', { userId: filters.userId });
    if (filters.from) qb.andWhere('a.created_at >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('a.created_at <= :to', { to: filters.to });
    qb.orderBy('a.created_at', 'DESC').skip((page - 1) * limit).take(limit);

    const [logs, total] = await qb.getManyAndCount();
    return { logs, total, page, limit };
  }
}
