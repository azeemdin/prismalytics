import { Entity, Column, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { jsonColumn } from '../column-helpers';

@Entity('audit_logs')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'userId'])
export class AuditLog extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ name: 'user_name', nullable: true })
  userName?: string;

  @Column()
  action: string;

  @Column()
  resource: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId?: string;

  @Column({ name: 'resource_name', nullable: true })
  resourceName?: string;

  @Column(jsonColumn({ nullable: true }))
  metadata?: Record<string, unknown>;
}
