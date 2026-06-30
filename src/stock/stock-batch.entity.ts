import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductVariant } from '../products/product-variant.entity';
import { ProductInstance } from './product-instance.entity';
import { StockMovement } from './stock-movement.entity';

@Entity('stock_batches')
export class StockBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productVariantId: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.batches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productVariantId' })
  productVariant: ProductVariant;

  @Column({ nullable: true, type: 'varchar' })
  batchCode: string | null;

  @Column({ type: 'int' })
  initialQuantity: number;

  @Column({ type: 'int' })
  remainingQuantity: number;

  @Column({ type: 'date' })
  manufacturingDate: Date;

  @Column({ type: 'date' })
  expirationDate: Date;

  @OneToMany(() => StockMovement, (movement) => movement.batch)
  movements: StockMovement[];

  @OneToMany(() => ProductInstance, (instance) => instance.stockBatch)
  instances: ProductInstance[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
