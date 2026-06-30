import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../commerce/order.entity';
import { DeliveryStatus, DeliveryType } from './enums';
import { DeliveryProvider } from './delivery-provider.entity';

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string;

  @OneToOne(() => Order, (order) => order.delivery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({
    type: 'varchar',
    enum: DeliveryType,
    default: DeliveryType.STANDARD,
  })
  type: DeliveryType;

  @Column()
  providerId: string;

  @ManyToOne(() => DeliveryProvider, (provider) => provider.deliveries, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'providerId' })
  provider: DeliveryProvider;

  @Column({ type: 'text' })
  shippingAddress: string;

  @Column({
    type: 'varchar',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  @Column({ nullable: true, type: 'varchar' })
  trackingNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  shippedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
