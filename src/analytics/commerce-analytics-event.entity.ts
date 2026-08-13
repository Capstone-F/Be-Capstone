import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { OrderSource } from '../commerce/enums';
import { CommerceAnalyticsEventType } from './commerce-analytics.enums';

@Entity('commerce_analytics_events')
@Index('IDX_commerce_analytics_session_occurred', ['sessionId', 'occurredAt'])
@Index('IDX_commerce_analytics_type_occurred', ['eventType', 'occurredAt'])
export class CommerceAnalyticsEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', enum: CommerceAnalyticsEventType })
  eventType: CommerceAnalyticsEventType;

  @Column({ type: 'varchar', enum: OrderSource })
  source: OrderSource;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ type: 'uuid', nullable: true })
  productVariantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  path: string | null;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
