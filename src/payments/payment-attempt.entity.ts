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
import { Payment } from './payment.entity';
import { PaymentAttemptStatus } from './enums';

@Entity('payment_attempts')
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  paymentId: string;

  @ManyToOne(() => Payment, (payment) => payment.attempts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  /** vnp_TxnRef we send to VNPay — the idempotency key echoed back on return/IPN. */
  @Index('idx_payment_attempts_vnp_txn_ref', { unique: true })
  @Column({ type: 'varchar' })
  vnpTxnRef: string;

  @Column({
    type: 'varchar',
    enum: PaymentAttemptStatus,
    default: PaymentAttemptStatus.PENDING,
  })
  status: PaymentAttemptStatus;

  @Column({ type: 'bigint' })
  amountVnd: string;

  /** vnp_TransactionNo — VNPay's own transaction id, present once confirmed. */
  @Column({ type: 'varchar', nullable: true })
  providerTransactionId: string | null;

  /** vnp_ResponseCode — '00' on success. */
  @Column({ type: 'varchar', nullable: true })
  responseCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankCode: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** Raw return query, kept for audit. */
  @Column({ type: 'jsonb', nullable: true })
  rawReturn: unknown;

  /** Raw IPN query, kept for audit. */
  @Column({ type: 'jsonb', nullable: true })
  rawIpn: unknown;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
