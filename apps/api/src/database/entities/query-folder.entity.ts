import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { enumColType } from '../column-helpers';

export enum QueryVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  EDITORS = 'editors',
}

@Entity('query_folders')
@Index(['tenantId'])
@Index(['tenantId', 'parentId'])
export class QueryFolder extends AppBaseEntity {
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

  @Column({ name: 'parent_id', nullable: true })
  parentId?: string;

  @ManyToOne(() => QueryFolder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent?: QueryFolder;

  @Column({ type: enumColType(), enum: QueryVisibility, default: QueryVisibility.PRIVATE })
  visibility: QueryVisibility;
}
