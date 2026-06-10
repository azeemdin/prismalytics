import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
} from 'typeorm';
import { tsColType } from '../column-helpers';

export abstract class AppBaseEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: tsColType(), name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: tsColType(), name: 'updated_at' })
  updatedAt: Date;
}
