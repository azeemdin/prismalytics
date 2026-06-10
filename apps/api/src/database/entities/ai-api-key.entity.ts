import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';

export type AiProvider = 'gemini' | 'gemini-vertex' | 'claude' | 'openrouter';

@Entity('ai_api_keys')
@Index(['tenantId', 'provider'], { unique: true })
export class AiApiKey extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 32 })
  provider: AiProvider;

  // Stored encrypted using the same AES utility as datasource passwords
  @Column({ name: 'encrypted_key', type: 'text' })
  encryptedKey: string;

  // Optional model override — if null, falls back to the env-var default for the provider
  @Column({ nullable: true, type: 'varchar', length: 128 })
  model: string | null;

  @Column({ default: true })
  enabled: boolean;
}
