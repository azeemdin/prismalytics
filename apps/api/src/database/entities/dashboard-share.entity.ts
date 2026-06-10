import { Entity, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { tsColType } from '../column-helpers';
import { Dashboard } from './dashboard.entity';
import { User } from './user.entity';

@Entity('dashboard_shares')
@Index(['dashboardId', 'userId'], { unique: true })
@Index(['tenantId'])
export class DashboardShare {
  @Column({ name: 'dashboard_id', primary: true })
  dashboardId: string;

  @ManyToOne(() => Dashboard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dashboard_id' })
  dashboard: Dashboard;

  @Column({ name: 'user_id', primary: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'granted_by_id' })
  grantedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'granted_by_id' })
  grantedBy: User;

  @CreateDateColumn({ type: tsColType(), name: 'created_at' })
  createdAt: Date;
}
