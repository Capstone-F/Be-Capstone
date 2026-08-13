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
import { LedgerAccount, TransactionStatus, TransactionType } from './enums';
import { Order } from './order.entity';

@Entity('transactions')
@Index('UQ_transactions_externalRef', ['externalRef'], {
  unique: true,
  where: '"externalRef" IS NOT NULL',
})
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'varchar',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'bigint' })
  amountVnd: string;

  @Column({
    type: 'varchar',
    enum: LedgerAccount,
    nullable: true,
  })
  fromAccount: LedgerAccount | null;

  @Column({
    type: 'varchar',
    enum: LedgerAccount,
    nullable: true,
  })
  toAccount: LedgerAccount | null;

  @Column({ nullable: true, type: 'uuid' })
  orderId: string | null;

  @ManyToOne(() => Order, (order) => order.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order | null;

  @Column({ nullable: true, type: 'uuid' })
  consultationId: string | null;

  @ManyToOne(() => ConsultationRequest, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'consultationId' })
  consultation: ConsultationRequest | null;

  @Column({ nullable: true, type: 'uuid' })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ nullable: true, type: 'uuid' })
  treatmentId: string | null;

  @ManyToOne(() => Treatment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'treatmentId' })
  treatment: Treatment | null;

  @Column({ nullable: true, type: 'uuid' })
  treatmentPhaseId: string | null;

  @ManyToOne(() => TreatmentPhase, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'treatmentPhaseId' })
  treatmentPhase: TreatmentPhase | null;

  @Index('IDX_transactions_clinicId')
  @Column({ nullable: true, type: 'uuid' })
  clinicId: string | null;

  @ManyToOne(() => Clinic, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic | null;

  @Column({ nullable: true, type: 'uuid' })
  expertId: string | null;

  @ManyToOne(() => Expert, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'expertId' })
  expert: Expert | null;

  @Column({ nullable: true, type: 'uuid' })
  escrowHoldId: string | null;

  @Column({ nullable: true, type: 'uuid' })
  withdrawalId: string | null;

  @Column({ nullable: true, type: 'varchar' })
  externalRef: string | null;

  @Column({ nullable: true, type: 'text' })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
