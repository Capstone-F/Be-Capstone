import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../commerce/order.entity';
import { User } from '../users/user.entity';
import { DeliveryStatus, DeliveryType } from './enums';
import { DeliveryProvider } from './delivery-provider.entity';
import { DeliveryStatusEvent } from './delivery-status-event.entity';

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
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

  /** Human-readable snapshot for display/labels. GHN reads the structured columns below. */
  @Column({ type: 'text' })
  shippingAddress: string;

  @Column({ type: 'varchar', nullable: true })
  recipientName: string | null;

  @Column({ type: 'varchar', nullable: true })
  recipientPhone: string | null;

  @Column({ type: 'int', nullable: true })
  provinceId: number | null;

  /** GHN to_district_id. */
  @Column({ type: 'int', nullable: true })
  districtId: number | null;

  /** GHN to_ward_code. */
  @Column({ type: 'varchar', nullable: true })
  wardCode: string | null;

  @Column({ type: 'text', nullable: true })
  streetAddress: string | null;

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

  /** GHN order_code — the webhook lookup key. Null until the GHN order is created. */
  @Column({ type: 'varchar', nullable: true })
  providerOrderCode: string | null;

  /** Raw GHN status string, e.g. 'delivering'. */
  @Column({ type: 'varchar', nullable: true })
  providerStatus: string | null;

  @Column({ type: 'int', default: 0 })
  shippingFeeVnd: number;

  @Column({ type: 'timestamptz', nullable: true })
  expectedDeliveryTime: Date | null;

  /** Webhook `Time` of the last applied event — guards against out-of-order retries. */
  @Column({ type: 'timestamptz', nullable: true })
  lastStatusAt: Date | null;

  /**
   * Staff confirmation that the parcel was physically handed to the carrier.
   * Null until POST /admin/orders/:orderId/handover.
   */
  @Column({ type: 'timestamptz', nullable: true })
  handedOverAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  handedOverByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'handedOverByUserId' })
  handedOverByUser: User | null;

  @Column({ type: 'text', nullable: true })
  handoverNote: string | null;

  @OneToMany(() => DeliveryStatusEvent, (event) => event.delivery)
  statusEvents: DeliveryStatusEvent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
