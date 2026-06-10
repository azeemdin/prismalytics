import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenantId: string;
  @Column() userId: string;
  @Column() name: string;
  @Column({ unique: true }) keyHash: string;
  @Column({ nullable: true }) keyPrefix: string;
  @Column({ nullable: true }) lastUsedAt: Date;
  @Column({ nullable: true }) expiresAt: Date;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
