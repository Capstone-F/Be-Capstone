import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { Expert } from '../users/expert.entity';
import { TreatmentAccessStatus } from './enums';
import { Treatment } from './treatment.entity';

@Entity('treatment_accesses')
export class TreatmentAccess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  treatmentId: string;

  @ManyToOne(() => Treatment, (treatment) => treatment.accessRecords, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'treatmentId' })
  treatment: Treatment;

  @Column()
  expertId: string;

  @ManyToOne(() => Expert, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expertId' })
  expert: Expert;

  @Column({ nullable: true, type: 'uuid' })
  clinicId: string | null;

  @ManyToOne(() => Clinic, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic | null;

  @Column({
    type: 'varchar',
    enum: TreatmentAccessStatus,
    default: TreatmentAccessStatus.ACTIVE,
  })
  status: TreatmentAccessStatus;

  @Column({ type: 'datetime' })
  grantedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
