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
import { ShelfLifeUnit } from '../stock/enums';
import { StockBatch } from '../stock/stock-batch.entity';
import { OrderItem } from '../commerce/order-item.entity';
import { RoutineStepDetails } from '../routines/routine-step-details.entity';
import { Product } from './product.entity';

@Entity('product_variants')
@Index('IDX_product_variants_sku', ['sku'], { unique: true })
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  sku: string;

  @Column({ nullable: true, type: 'varchar' })
  volume: string | null;

  @Column({ nullable: true, type: 'varchar' })
  packaging: string | null;

  @Column({ type: 'int' })
  priceVnd: number;

  /** Parcel weight in grams, used for GHN shipping fee calculation. */
  @Column({ type: 'int', default: 200 })
  weightGram: number;

  @Column({ type: 'int', default: 365 })
  shelfLifeValue: number;

  @Column({
    type: 'varchar',
    enum: ShelfLifeUnit,
    default: ShelfLifeUnit.DAY,
  })
  shelfLifeUnit: ShelfLifeUnit;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true, type: 'varchar' })
  imageUrl: string | null;

  @OneToMany(() => StockBatch, (batch) => batch.productVariant)
  batches: StockBatch[];

  @OneToMany(() => OrderItem, (item) => item.productVariant)
  orderItems: OrderItem[];

  @OneToMany(() => RoutineStepDetails, (details) => details.productVariant)
  routineStepDetails: RoutineStepDetails[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
