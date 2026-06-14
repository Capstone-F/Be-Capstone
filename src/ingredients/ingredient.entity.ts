import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IngredientConflict } from './ingredient-conflict.entity';
import { GoalIngredient } from '../treatment-goals/goal-ingredient.entity';
import { ProductIngredient } from '../products/product-ingredient.entity';

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

  @OneToMany(() => GoalIngredient, (gi) => gi.ingredient)
  goalIngredients: GoalIngredient[];

  @OneToMany(() => IngredientConflict, (c) => c.ingredientA)
  conflictsAsA: IngredientConflict[];

  @OneToMany(() => IngredientConflict, (c) => c.ingredientB)
  conflictsAsB: IngredientConflict[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
