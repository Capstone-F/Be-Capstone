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
import { Product } from '../products/product.entity';
import { StockMovement } from './stock-movement.entity';

@Entity('stock_batches')
export class StockBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.batches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
