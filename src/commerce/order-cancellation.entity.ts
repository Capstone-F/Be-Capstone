import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import {
  OrderCancellationActor,
  OrderCancellationStatus,
  OrderStatus,
} from './enums';
import { OrderCancellationItem } from './order-cancellation-item.entity';
import { Order } from './order.entity';

@Entity('order_cancellations')
@Index('IDX_order_cancellations_status_nextRunAt', ['status', 'nextRunAt'])
export class OrderCancellation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @OneToOne(() => Order, (order) => order.cancellation, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({
    type: 'varchar',
    enum: OrderCancellationStatus,
    default: OrderCancellationStatus.REQUESTED,
  })
  status: OrderCancellationStatus;

  @Column({ type: 'uuid' })
  requestedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser: User;

  @Column({
    type: 'varchar',
    enum: OrderCancellationActor,
  })
  requestedByActor: OrderCancellationActor;

  @Column({ nullable: true, type: 'text' })
  reason: string | null;

  @Column({ type: 'varchar', enum: OrderStatus })
  orderStatusAtRequest: OrderStatus;

  @Column({ type: 'bigint' })
  refundAmountVnd: string;

  @Column({ nullable: true, type: 'uuid' })
  refundTransactionId: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  refundedAt: Date | null;

  @Column({ default: false })
  requiresStockReturn: boolean;

  @Column({ nullable: true, type: 'uuid' })
  restockConfirmedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'restockConfirmedByUserId' })
  restockConfirmedByUser: User | null;

  @Column({ nullable: true, type: 'timestamptz' })
  restockConfirmedAt: Date | null;

  @Column({ type: 'timestamptz' })
  nextRunAt: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ nullable: true, type: 'text' })
  lastError: string | null;

  @OneToMany(() => OrderCancellationItem, (item) => item.orderCancellation)
  items: OrderCancellationItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
