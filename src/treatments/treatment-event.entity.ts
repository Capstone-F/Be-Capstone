import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Expert } from '../users/expert.entity';
import { TreatmentEventType } from './enums';
import { Treatment } from './treatment.entity';

@Entity('treatment_events')
export class TreatmentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  treatmentId: string;

  @ManyToOne(() => Treatment, (treatment) => treatment.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'treatmentId' })
  treatment: Treatment;

  @Column({
    type: 'varchar',
    enum: TreatmentEventType,
  })
  type: TreatmentEventType;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  note: string | null;

  @Column({ nullable: true, type: 'varchar' })
  photoUrl: string | null;

  @Column({ type: 'datetime' })
  occurredAt: Date;

  @Column({ nullable: true, type: 'uuid' })
  createdByExpertId: string | null;

  @ManyToOne(() => Expert, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByExpertId' })
  createdByExpert: Expert | null;

  @CreateDateColumn()
  createdAt: Date;
}
