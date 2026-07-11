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
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentProvider, PaymentStatus } from './enums';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_payments_order')
  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

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
