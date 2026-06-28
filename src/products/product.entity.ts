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
import { ProductBrand } from './product-brand.entity';
import { ProductCategory } from './product-category.entity';
import { ProductIngredient } from './product-ingredient.entity';
import { ProductProtocol } from './product-protocol.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('products')
@Index('IDX_products_brand', ['brandId'])
@Index('IDX_products_category', ['categoryId'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  brandId: string;

  @ManyToOne(() => ProductBrand, (brand) => brand.products, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'brandId' })
  brand: ProductBrand;

  @Column()
  categoryId: string;

  @ManyToOne(() => ProductCategory, (category) => category.products, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categoryId' })
  category: ProductCategory;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ProductIngredient, (pi) => pi.product)
  productIngredients: ProductIngredient[];

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants: ProductVariant[];

  @OneToMany(() => ProductProtocol, (pp) => pp.product)
  productProtocols: ProductProtocol[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
