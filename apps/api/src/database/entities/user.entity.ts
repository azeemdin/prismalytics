import { Entity, Column, ManyToOne, JoinColumn, Index, BeforeInsert, BeforeUpdate } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { enumColType } from '../column-helpers';

export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum AuthProvider {
  LOCAL = 'local',
  KEYCLOAK = 'keycloak',
}

@Entity('users')
@Index(['tenantId', 'email'], { unique: true })
export class User extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ nullable: true, select: false })
  passwordHash?: string;

  @Column({ type: enumColType(), enum: UserRole, default: UserRole.VIEWER })
  role: UserRole;

  @Column({ type: enumColType(), enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ default: true })
  isActive: boolean;

  // Admin can disable AI features for individual users (e.g. cost control)
  @Column({ name: 'ai_enabled', default: true })
  aiEnabled: boolean;

  @Column({ nullable: true })
  lastLoginAt?: Date;

  @Column({ nullable: true, select: false })
  refreshTokenHash?: string;

  async validatePassword(password: string): Promise<boolean> {
    if (!this.passwordHash) return false;
    return bcrypt.compare(password, this.passwordHash);
  }

  @BeforeInsert()
  @BeforeUpdate()
  async hashPasswordIfChanged() {
    // Password hashing is done in the service to control when it runs
  }
}
