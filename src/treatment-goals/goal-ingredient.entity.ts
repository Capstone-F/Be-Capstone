import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Ingredient } from '../ingredients/ingredient.entity';
import { TreatmentGoal } from './treatment-goal.entity';

@Entity('goal_ingredients')
@Unique('UQ_goal_ingredients_goal_ingredient', ['goalId', 'ingredientId'])
export class GoalIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  goalId: string;

  @Column()
  ingredientId: string;

  @Column({ type: 'int', default: 0 })
  priorityScore: number;

  @ManyToOne(() => TreatmentGoal, (goal) => goal.goalIngredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'goalId' })
  goal: TreatmentGoal;

  @ManyToOne(() => Ingredient, (ingredient) => ingredient.goalIngredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ingredientId' })
  ingredient: Ingredient;
}
