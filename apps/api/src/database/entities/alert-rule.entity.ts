import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { jsonColumn, tsColType } from '../column-helpers';

@Entity('alert_rules')
@Index(['tenantId'])
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: 'datasource_id', nullable: true })
  datasourceId: string;

  @Column({ type: 'text' })
  sql: string;

  @Column()
  condition: string; // 'gt'|'lt'|'eq'|'gte'|'lte'

  @Column({ type: 'float' })
  threshold: number;

  @Column({ name: 'column_name' })
  columnName: string;

  @Column()
  schedule: string; // cron expression

  @Column(jsonColumn())
  channels: Array<{ type: 'email' | 'slack' | 'webhook'; target: string; autoApprove?: boolean }> = [];

  @Column({ name: 'is_active', default: false })
  isActive: boolean;

  @Column({ name: 'notifications_enabled', default: false })
  notificationsEnabled: boolean;

  @Column({ name: 'last_evaluated_at', nullable: true })
  lastEvaluatedAt: Date;

  @Column({ name: 'last_status', nullable: true })
  lastStatus: string; // 'ok'|'firing'|'error'

  @CreateDateColumn({ name: 'created_at', type: tsColType() })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: tsColType() })
  updatedAt: Date;
}
