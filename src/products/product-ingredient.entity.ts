import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Ingredient } from '../ingredients/ingredient.entity';
import { Product } from './product.entity';

@Entity('product_ingredients')
@Unique('UQ_product_ingredients_product_ingredient', [
  'productId',
  'ingredientId',
])
export class ProductIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column()
  ingredientId: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  concentrationPct: number | null;

  @Column({ default: false })
  isKeyIngredient: boolean;

  @ManyToOne(() => Product, (product) => product.productIngredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Ingredient, (ingredient) => ingredient.productIngredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ingredientId' })
  ingredient: Ingredient;
}
