import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { jsonColumn, enumColType } from '../column-helpers';

export enum DashboardStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum DashboardVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public',
}

@Entity('dashboards')
@Index(['tenantId'])
@Index(['tenantId', 'createdById'])
export class Dashboard extends AppBaseEntity {
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

  @Column({ type: enumColType(), enum: DashboardStatus, default: DashboardStatus.DRAFT })
  status: DashboardStatus;

  @Column({ type: enumColType(), enum: DashboardVisibility, default: DashboardVisibility.PRIVATE })
  visibility: DashboardVisibility;

  @Column(jsonColumn())
  layout: {
    i: string;  // visualization id
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];

  @Column(jsonColumn({ nullable: true }))
  filters?: {
    id: string;
    label: string;
    type: 'date_range' | 'select' | 'text';
    defaultValue?: unknown;
  }[];

  @Column({ nullable: true })
  refreshIntervalSeconds?: number;

  @Column({ default: false })
  isTemplate: boolean;

  @Column({ name: 'share_token', nullable: true, unique: true })
  shareToken?: string;

  // AI-generated summary — persisted on demand by admin
  @Column(jsonColumn({ nullable: true }))
  aiSummary?: {
    summary: string;
    insights: string[];
    anomalies: string[];
    generatedAt: string;
  };
}
