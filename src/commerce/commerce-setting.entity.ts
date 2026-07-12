import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommerceSettingKey } from './enums';

@Entity('commerce_settings')
export class CommerceSetting {
  @PrimaryColumn({ type: 'varchar' })
  key: CommerceSettingKey;

  @Column({ type: 'varchar' })
  value: string;

  @Column({ nullable: true, type: 'uuid' })
  updatedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
