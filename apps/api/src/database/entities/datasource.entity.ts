import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { jsonColumn, enumColType } from '../column-helpers';

export enum DatasourceType {
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  MSSQL = 'mssql',
  SQLITE = 'sqlite',
  MONGODB = 'mongodb',
  REST_API = 'rest_api',
  ELASTICSEARCH = 'elasticsearch',
  CSV = 'csv',
  ORACLE = 'oracle',
}

export enum DatasourceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

export enum DatasourceVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  SHARED = 'shared',
}

@Entity('datasources')
@Index(['tenantId'])
export class Datasource extends AppBaseEntity {
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

  @Column({ type: enumColType(), enum: DatasourceType })
  type: DatasourceType;

  @Column({ type: enumColType(), enum: DatasourceStatus, default: DatasourceStatus.INACTIVE })
  status: DatasourceStatus;

  @Column({ type: enumColType(), enum: DatasourceVisibility, default: DatasourceVisibility.PRIVATE })
  visibility: DatasourceVisibility;

  @Column(jsonColumn())
  config: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    ssl?: boolean;
    url?: string;
    connectionStringMode?: boolean;
    // API-specific
    baseUrl?: string;
    headers?: Record<string, string>;
    // Oracle-specific
    serviceName?: string;
    // Elasticsearch-specific
    index?: string;
    // CSV/Excel — rows stored inline in JSONB
    csvRows?: Record<string, unknown>[];
    csvColumns?: { name: string; type: string }[];
    csvFilename?: string;
  };

  // Password stored separately (encrypted at rest via app-level AES, not in plaintext)
  @Column({ nullable: true, select: false })
  encryptedPassword?: string;

  @Column({ nullable: true })
  lastTestedAt?: Date;

  @Column({ nullable: true })
  lastErrorMessage?: string;
}
