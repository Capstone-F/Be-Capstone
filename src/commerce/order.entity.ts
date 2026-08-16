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
import { Customer } from '../users/customer.entity';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import { OrderDiscountType, OrderSource, OrderStatus } from './enums';
import { Delivery } from '../delivery/delivery.entity';
import { OrderCancellation } from './order-cancellation.entity';
import { OrderItem } from './order-item.entity';
import { Transaction } from './transaction.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({
    type: 'varchar',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({
    type: 'varchar',
    enum: OrderSource,
    default: OrderSource.CATALOG,
  })
  source: OrderSource;

  @Column({ nullable: true, type: 'uuid' })
  customerSurveyId: string | null;

  @ManyToOne(() => CustomerSurvey, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerSurveyId' })
  customerSurvey: CustomerSurvey | null;

  @Column({ nullable: true, type: 'uuid' })
  surveyRecommendationId: string | null;

  @ManyToOne(() => SurveyRecommendation, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'surveyRecommendationId' })
  surveyRecommendation: SurveyRecommendation | null;

  @Column({ type: 'int', default: 0 })
  subtotalVnd: number;

  @Column({ type: 'int', default: 0 })
  discountVnd: number;

  @Column({
    type: 'varchar',
    enum: OrderDiscountType,
    nullable: true,
  })
  discountType: OrderDiscountType | null;

  /** GHN shipping fee quoted at order creation. Included in totalVnd. */
  @Column({ type: 'int', default: 0 })
  shippingFeeVnd: number;

  @Column({ type: 'int', default: 0 })
  totalVnd: number;

  @Column({ nullable: true, type: 'uuid' })
  analyticsSessionId: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  cancelledAt: Date | null;

  /**
   * True when post-payment stock deduction could not cover every item.
   * GHN handover is held until staff restock and retry fulfillment.
   */
  @Column({ type: 'boolean', default: false })
  stockShortfall: boolean;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @OneToMany(() => Transaction, (transaction) => transaction.order)
  transactions: Transaction[];

  @OneToOne(() => Delivery, (delivery) => delivery.order)
  delivery: Delivery;

  @OneToOne(() => OrderCancellation, (cancellation) => cancellation.order)
  cancellation: OrderCancellation | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
