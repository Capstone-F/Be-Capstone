import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IngredientProtocol } from './ingredient-protocol.entity';
import { ProductIngredient } from '../products/product-ingredient.entity';
import { LockedIngredient } from '../treatments/locked-ingredient.entity';

@Entity('ingredients')
@Index('IDX_ingredients_name', ['name'], { unique: true })
export class Ingredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  ingredientType: string | null;

  @Column({ default: false })
  isActiveIngredient: boolean;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @OneToMany(() => ProductIngredient, (pi) => pi.ingredient)
  productIngredients: ProductIngredient[];

  @OneToMany(() => IngredientProtocol, (protocol) => protocol.ingredient)
  protocols: IngredientProtocol[];

  @OneToMany(() => LockedIngredient, (li) => li.ingredient)
  lockedIngredients: LockedIngredient[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
