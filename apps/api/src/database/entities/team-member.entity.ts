import { Entity, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { tsColType } from '../column-helpers';
import { User } from './user.entity';

@Entity('team_members')
@Index(['ownerId', 'memberId'], { unique: true })
@Index(['tenantId'])
export class TeamMember {
  @Column({ name: 'owner_id', primary: true })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'member_id', primary: true })
  memberId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: User;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @CreateDateColumn({ type: tsColType(), name: 'created_at' })
  createdAt: Date;
}
