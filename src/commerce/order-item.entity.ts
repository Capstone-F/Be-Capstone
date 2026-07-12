import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductVariant } from '../products/product-variant.entity';
import { ProductInstance } from '../stock/product-instance.entity';
import { RoutineStepDetails } from '../routines/routine-step-details.entity';
import { SurveyRecommendationItem } from '../recommendations/survey-recommendation-item.entity';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  productVariantId: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.orderItems, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'productVariantId' })
  productVariant: ProductVariant;

  @Column({ nullable: true, type: 'uuid' })
  routineStepDetailsId: string | null;

  @ManyToOne(() => RoutineStepDetails, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'routineStepDetailsId' })
  routineStepDetails: RoutineStepDetails | null;

  @Column({ nullable: true, type: 'uuid' })
  surveyRecommendationItemId: string | null;

  @ManyToOne(() => SurveyRecommendationItem, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'surveyRecommendationItemId' })
  surveyRecommendationItem: SurveyRecommendationItem | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int' })
  unitPriceVnd: number;

  @Column({ type: 'int' })
  lineTotalVnd: number;

  @OneToMany(() => ProductInstance, (instance) => instance.orderItem)
  productInstances: ProductInstance[];

  @CreateDateColumn()
  createdAt: Date;
}
