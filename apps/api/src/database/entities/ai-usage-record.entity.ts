import { Entity, Column, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';

@Entity('ai_usage_records')
@Index(['tenantId'])
@Index(['tenantId', 'createdAt'])
export class AiUsageRecord extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id', nullable: true, type: 'varchar' })
  userId: string | null;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ type: 'varchar', length: 128 })
  model: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  feature: string | null;

  @Column({ type: 'int', default: 0 })
  tokensIn: number;

  @Column({ type: 'int', default: 0 })
  tokensOut: number;

  @Column({ type: 'int', default: 0 })
  latencyMs: number;

  @Column({ default: true })
  success: boolean;
}
