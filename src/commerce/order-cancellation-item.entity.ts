import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderCancellation } from './order-cancellation.entity';
import { OrderItem } from './order-item.entity';

@Entity('order_cancellation_items')
export class OrderCancellationItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderCancellationId: string;

  @ManyToOne(() => OrderCancellation, (cancellation) => cancellation.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderCancellationId' })
  orderCancellation: OrderCancellation;

  @Column()
  orderItemId: string;

  @ManyToOne(() => OrderItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: OrderItem;

  /** Count of SOLD ProductInstance rows at cancel-request time. */
  @Column({ type: 'int' })
  expectedQuantity: number;

  @Column({ type: 'int', nullable: true })
  goodQuantity: number | null;

  @Column({ type: 'int', nullable: true })
  damagedQuantity: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
