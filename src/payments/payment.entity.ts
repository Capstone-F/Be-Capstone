import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../commerce/order.entity';
import { User } from '../users/user.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentProvider, PaymentPurpose, PaymentStatus } from './enums';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_payments_order')
  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'orderId' })
  order: Order | null;

  @Index('idx_payments_purpose')
  @Column({
    type: 'varchar',
    enum: PaymentPurpose,
    default: PaymentPurpose.ORDER,
  })
  purpose: PaymentPurpose;

  @Index('idx_payments_user')
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({
    type: 'varchar',
    enum: PaymentProvider,
    default: PaymentProvider.VNPAY,
  })
  provider: PaymentProvider;

  @Column({
    type: 'varchar',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'bigint' })
  amountVnd: string;

  /** Allowlisted client landing URL the return endpoint 302s to (web page or mobile deep link). */
  @Column({ type: 'varchar' })
  clientReturnUrl: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @OneToMany(() => PaymentAttempt, (attempt) => attempt.payment)
  attempts: PaymentAttempt[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
