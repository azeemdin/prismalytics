import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Query } from './query.entity';
import { jsonColumn, tsColType } from '../column-helpers';

export enum ScheduledJobStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DISABLED = 'disabled',
}

@Entity('scheduled_jobs')
@Index(['tenantId'])
@Index(['tenantId', 'enabled'])
export class ScheduledJob extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'created_by_id' })
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  // Standard cron expression (5-part: min hour dom mon dow)
  @Column({ name: 'cron_expression' })
  cronExpression: string;

  // Either a saved query ID or inline SQL + datasourceId
  @Column({ name: 'query_id', nullable: true })
  queryId?: string;

  @ManyToOne(() => Query, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'query_id' })
  query?: Query;

  @Column({ name: 'inline_sql', type: 'text', nullable: true })
  inlineSql?: string;

  @Column({ name: 'datasource_id', nullable: true })
  datasourceId?: string;

  // Comma-separated or JSON array of recipient emails
  @Column(jsonColumn())
  recipients: string[] = [];

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: tsColType(), name: 'last_run_at', nullable: true })
  lastRunAt?: Date;

  @Column({ nullable: true, name: 'last_run_status' })
  lastRunStatus?: 'success' | 'failure';

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError?: string;
}
