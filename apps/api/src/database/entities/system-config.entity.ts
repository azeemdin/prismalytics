import { Entity, Column } from 'typeorm';
import { AppBaseEntity } from './base.entity';

@Entity('system_config')
export class SystemConfig extends AppBaseEntity {
  @Column({ unique: true })
  key: string;

  @Column({ type: 'text', nullable: true })
  value: string | null;
}
