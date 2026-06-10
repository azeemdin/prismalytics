import { Entity, Column } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { jsonColumn } from '../column-helpers';

@Entity('tenants')
export class Tenant extends AppBaseEntity {
  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column(jsonColumn({ nullable: true }))
  branding?: {
    logoUrl?: string;
    logoText?: string;
    primaryColor?: string;
    faviconUrl?: string;
  };

  @Column(jsonColumn({ nullable: true }))
  settings?: {
    maxUsers?: number;
    maxDatasources?: number;
    queryTimeoutSeconds?: number;
    preferredAiProvider?: string;
  };
}
