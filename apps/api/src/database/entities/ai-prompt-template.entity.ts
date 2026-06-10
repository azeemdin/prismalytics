import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { tsColType } from '../column-helpers';

export type PromptFeature =
  | 'nl_to_sql'
  | 'report_gen'
  | 'chat_system'
  | 'dashboard_summary'
  | 'query_optimize'
  | 'alert_rule_gen'
  | 'auto_dashboard';

@Entity('ai_prompt_templates')
@Index(['tenantId'])
@Unique(['tenantId', 'feature'])
export class AiPromptTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  feature: PromptFeature;

  @Column({ type: 'text' })
  template: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: tsColType() })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: tsColType() })
  updatedAt: Date;
}
