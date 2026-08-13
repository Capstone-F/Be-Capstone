import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { TreatmentPhase } from '../treatments/treatment-phase.entity';
import { Treatment } from '../treatments/treatment.entity';
import { Expert } from '../users/expert.entity';
import { User } from '../users/user.entity';
import { EscrowHoldSourceType, EscrowHoldStatus } from './enums';

@Entity('escrow_holds')
@Index('UQ_escrow_holds_consultationId', ['consultationId'], {
  unique: true,
  where: '"consultationId" IS NOT NULL',
})
@Index('UQ_escrow_holds_treatmentPhaseId', ['treatmentPhaseId'], {
  unique: true,
  where: '"treatmentPhaseId" IS NOT NULL',
})
export class EscrowHold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    enum: EscrowHoldSourceType,
  })
  sourceType: EscrowHoldSourceType;

  @Column({
    type: 'varchar',
    enum: EscrowHoldStatus,
    default: EscrowHoldStatus.HELD,
  })
  status: EscrowHoldStatus;

  @Column({ type: 'bigint' })
  amountVnd: string;

  /** Snapshotted commission rate percent at hold time (e.g. 10.00). */
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  commissionRatePct: string;

  @Column({ type: 'bigint', nullable: true })
  netVnd: string | null;

  @Column({ type: 'bigint', nullable: true })
  commissionVnd: string | null;

  @Column({ type: 'uuid' })
  clinicId: string;

  @ManyToOne(() => Clinic, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;

  @Column({ type: 'uuid' })
  expertId: string;

  @ManyToOne(() => Expert, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expertId' })
  expert: Expert;

  @Column({ type: 'uuid' })
  customerUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerUserId' })
  customerUser: User;

  @Column({ type: 'uuid', nullable: true })
  consultationId: string | null;

  @ManyToOne(() => ConsultationRequest, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'consultationId' })
  consultation: ConsultationRequest | null;

  @Column({ type: 'uuid', nullable: true })
  treatmentId: string | null;

  @ManyToOne(() => Treatment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'treatmentId' })
  treatment: Treatment | null;

  @Column({ type: 'uuid', nullable: true })
  treatmentPhaseId: string | null;

  @ManyToOne(() => TreatmentPhase, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'treatmentPhaseId' })
  treatmentPhase: TreatmentPhase | null;

  @Column({ type: 'uuid', nullable: true })
  holdTransactionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  releaseTransactionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  commissionTransactionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  refundTransactionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
