import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShelfLifeUnit } from '../stock/enums';
import { StockBatch } from '../stock/stock-batch.entity';
import { ProductCategory } from './enums/product-category.enum';
import { ProductIngredient } from './product-ingredient.entity';

@Entity('products')
@Index('IDX_products_category', ['category'])
@Index('IDX_products_brand', ['brand'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  brand: string;

  @Column({
    type: 'varchar',
    enum: ProductCategory,
  })
  category: ProductCategory;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({ type: 'int' })
  priceVnd: number;

  @Column({ type: 'int', default: 0 })
  stockQuantity: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 365 })
  shelfLifeValue: number;

  @Column({
    type: 'varchar',
    enum: ShelfLifeUnit,
    default: ShelfLifeUnit.DAY,
  })
  shelfLifeUnit: ShelfLifeUnit;

  @OneToMany(() => ProductIngredient, (pi) => pi.product)
  productIngredients: ProductIngredient[];

  @OneToMany(() => StockBatch, (batch) => batch.product)
  batches: StockBatch[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
