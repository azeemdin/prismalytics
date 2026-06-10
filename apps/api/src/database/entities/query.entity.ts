import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Datasource } from './datasource.entity';
import { QueryFolder, QueryVisibility } from './query-folder.entity';
import { jsonColumn, enumColType } from '../column-helpers';

export enum QueryStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Entity('queries')
@Index(['tenantId'])
@Index(['tenantId', 'createdById'])
export class Query extends AppBaseEntity {
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

  @Column({ name: 'datasource_id' })
  datasourceId: string;

  @ManyToOne(() => Datasource)
  @JoinColumn({ name: 'datasource_id' })
  datasource: Datasource;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'text' })
  sql: string;

  @Column({ name: 'target_collection', nullable: true })
  targetCollection?: string;

  @Column({ name: 'target_database', nullable: true })
  targetDatabase?: string;

  @Column(jsonColumn({ nullable: true }))
  parameters?: {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    defaultValue?: unknown;
    required?: boolean;
  }[];

  @Column({ type: enumColType(), enum: QueryStatus, default: QueryStatus.DRAFT })
  status: QueryStatus;

  @Column({ default: 0 })
  runCount: number;

  @Column({ name: 'folder_id', nullable: true })
  folderId?: string;

  @ManyToOne(() => QueryFolder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'folder_id' })
  folder?: QueryFolder;

  // Default 'editors' keeps all pre-existing queries visible to everyone (backward-compatible)
  @Column({ type: enumColType(), enum: QueryVisibility, default: QueryVisibility.EDITORS })
  visibility: QueryVisibility;
}

@Entity('query_executions')
@Index(['tenantId'])
@Index(['queryId'])
export class QueryExecution extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'query_id', nullable: true })
  queryId?: string;

  @ManyToOne(() => Query, { nullable: true })
  @JoinColumn({ name: 'query_id' })
  query?: Query;

  @Column({ name: 'executed_by_id' })
  executedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'executed_by_id' })
  executedBy: User;

  @Column({ name: 'datasource_id' })
  datasourceId: string;

  @Column({ type: 'text' })
  sql: string;

  @Column(jsonColumn({ nullable: true }))
  parameters?: Record<string, unknown>;

  @Column({ default: false })
  success: boolean;

  @Column({ nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  rowCount?: number;

  @Column({ nullable: true })
  durationMs?: number;
}
