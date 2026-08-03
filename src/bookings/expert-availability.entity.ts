import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Expert } from '../users/expert.entity';

@Entity('expert_availability')
export class ExpertAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  expertId: string;

  @ManyToOne(() => Expert, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expertId' })
  expert: Expert;

  /** 0 = Sunday .. 6 = Saturday (Vietnam local day-of-week) */
  @Column({ type: 'int' })
  dayOfWeek: number;

  /** Inclusive start hour in GMT+7 (business hours 09–20) */
  @Column({ type: 'int' })
  startHour: number;

  /** Exclusive end hour in GMT+7 (business hours 09–20) */
  @Column({ type: 'int' })
  endHour: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
