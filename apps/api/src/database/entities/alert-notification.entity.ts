import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { AlertRule } from './alert-rule.entity';
import { User } from './user.entity';
import { jsonColumn, tsColType } from '../column-helpers';

export type AlertNotificationStatus = 'pending' | 'sent' | 'dismissed' | 'failed';

@Entity('alert_notifications')
@Index(['tenantId'])
@Index(['alertRuleId'])
@Index(['status'])
export class AlertNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'alert_rule_id' })
  alertRuleId: string;

  @ManyToOne(() => AlertRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alert_rule_id' })
  alertRule: AlertRule;

  @Column({ name: 'alert_evaluation_id', nullable: true })
  alertEvaluationId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column(jsonColumn())
  channels: Array<{ type: 'email' | 'slack' | 'webhook'; target: string; autoApprove?: boolean }> = [];

  @Column({ name: 'detected_value', type: 'float', nullable: true })
  detectedValue: number;

  @Column({ type: 'float' })
  threshold: number;

  @Column()
  condition: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'pending' })
  status: AlertNotificationStatus;

  // Per-channel dispatch failures, joined with '; '. Populated whenever a send
  // is attempted and at least one channel errors — including 'sent' rows, where
  // some channels succeeded and others did not.
  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'sent_at', nullable: true })
  sentAt: Date;

  @Column({ name: 'sent_by_id', nullable: true })
  sentById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'sent_by_id' })
  sentBy: User;

  @CreateDateColumn({ name: 'created_at', type: tsColType() })
  createdAt: Date;
}
