import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from '../commerce/order-item.entity';
import { RoutineStepDetails } from '../routines/routine-step-details.entity';
import { ProductInstanceStatus } from './enums';
import { StockBatch } from './stock-batch.entity';

@Entity('product_instances')
@Index('IDX_product_instances_stockBatchId', ['stockBatchId'])
@Index('IDX_product_instances_orderItemId', ['orderItemId'])
@Index('IDX_product_instances_routineStepDetailsId', ['routineStepDetailsId'])
@Index('IDX_product_instances_status', ['status'])
@Index('IDX_product_instances_serialNumber', ['serialNumber'], { unique: true })
export class ProductInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stockBatchId: string;

  @ManyToOne(() => StockBatch, (batch) => batch.instances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stockBatchId' })
  stockBatch: StockBatch;

  @Column({ nullable: true, type: 'uuid' })
  orderItemId: string | null;

  @ManyToOne(() => OrderItem, (item) => item.productInstances, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: OrderItem | null;

  @Column({ nullable: true, type: 'uuid' })
  routineStepDetailsId: string | null;

  @ManyToOne(() => RoutineStepDetails, (details) => details.productInstances, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'routineStepDetailsId' })
  routineStepDetails: RoutineStepDetails | null;

  @Column({ nullable: true, type: 'varchar' })
  serialNumber: string | null;

  @Column({
    type: 'varchar',
    enum: ProductInstanceStatus,
    default: ProductInstanceStatus.ON_RACK,
  })
  status: ProductInstanceStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
