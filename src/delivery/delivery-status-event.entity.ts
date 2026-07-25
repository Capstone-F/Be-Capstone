import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Delivery } from './delivery.entity';
import { DeliveryStatus } from './enums';

/**
 * Append-only audit of every GHN webhook received for a delivery, applied or not.
 *
 * GHN retries a webhook 10 times on any non-200 response and gives no ordering guarantee,
 * so this table is what makes replays and out-of-order events debuggable.
 */
@Entity('delivery_status_events')
@Index('idx_delivery_status_events_delivery', ['deliveryId'])
export class DeliveryStatusEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  deliveryId: string;

  @ManyToOne(() => Delivery, (delivery) => delivery.statusEvents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'deliveryId' })
  delivery: Delivery;

  /** Raw GHN status string. */
  @Column({ type: 'varchar' })
  providerStatus: string;

  /** Mapped internal status. Null when GHN sent a status we do not map. */
  @Column({ type: 'varchar', enum: DeliveryStatus, nullable: true })
  mappedStatus: DeliveryStatus | null;

  /** The webhook's own `Time` field, not our receive time. */
  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  /** False when ignored as unmapped or stale. */
  @Column({ type: 'boolean', default: false })
  applied: boolean;

  @Column({ type: 'jsonb', nullable: true })
  rawWebhook: unknown;

  @CreateDateColumn()
  createdAt: Date;
}
