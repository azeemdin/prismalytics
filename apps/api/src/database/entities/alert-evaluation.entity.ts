import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { tsColType } from '../column-helpers';

@Entity('alert_evaluations')
@Index(['alertRuleId'])
@Index(['tenantId'])
export class AlertEvaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'alert_rule_id' })
  alertRuleId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'evaluated_at' })
  evaluatedAt: Date;

  @Column({ type: 'float', nullable: true })
  value: number;

  @Column()
  status: string; // 'ok'|'firing'|'error'

  @Column({ type: 'text', nullable: true })
  error: string;

  @CreateDateColumn({ name: 'created_at', type: tsColType() })
  createdAt: Date;
}
