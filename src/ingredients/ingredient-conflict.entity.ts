import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ConflictSeverity } from '../products/enums/conflict-severity.enum';
import { Ingredient } from './ingredient.entity';

@Entity('ingredient_conflicts')
@Unique('UQ_ingredient_conflicts_pair', ['ingredientAId', 'ingredientBId'])
export class IngredientConflict {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ingredientAId: string;

  @Column()
  ingredientBId: string;

  @Column({
    type: 'varchar',
    enum: ConflictSeverity,
  })
  severity: ConflictSeverity;

  @Column({ nullable: true, type: 'varchar' })
  reason: string | null;

  @ManyToOne(() => Ingredient, (ingredient) => ingredient.conflictsAsA, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ingredientAId' })
  ingredientA: Ingredient;

  @ManyToOne(() => Ingredient, (ingredient) => ingredient.conflictsAsB, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ingredientBId' })
  ingredientB: Ingredient;
}
