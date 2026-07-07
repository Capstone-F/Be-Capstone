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

  /** 0 = Sunday .. 6 = Saturday (matches JS Date.getDay()) */
  @Column({ type: 'int' })
  dayOfWeek: number;

  /** Inclusive start hour (9-17) */
  @Column({ type: 'int' })
  startHour: number;

  /** Exclusive end hour (10-18) */
  @Column({ type: 'int' })
  endHour: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
