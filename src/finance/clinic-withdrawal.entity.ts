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
import { User } from '../users/user.entity';
import { ClinicWithdrawalStatus } from './enums';

@Entity('clinic_withdrawals')
@Index('IDX_clinic_withdrawals_clinicId_status', ['clinicId', 'status'])
export class ClinicWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clinicId: string;

  @ManyToOne(() => Clinic, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;

  @Column({ type: 'bigint' })
  amountVnd: string;

  @Column({
    type: 'varchar',
    enum: ClinicWithdrawalStatus,
    default: ClinicWithdrawalStatus.REQUESTED,
  })
  status: ClinicWithdrawalStatus;

  @Column({ type: 'uuid' })
  requestedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser: User;

  /** Snapshotted bank details at request time. */
  @Column({ type: 'varchar' })
  bankName: string;

  @Column({ type: 'varchar' })
  bankAccountNumber: string;

  @Column({ type: 'varchar' })
  bankAccountHolder: string;

  @Column({ type: 'uuid', nullable: true })
  processedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'processedByUserId' })
  processedByUser: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  transferRef: string | null;

  @Column({ type: 'text', nullable: true })
  staffNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  debitTransactionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  refundTransactionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
