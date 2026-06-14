import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GoalIngredient } from './goal-ingredient.entity';

@Entity('treatment_goals')
@Index('IDX_treatment_goals_code', ['code'], { unique: true })
export class TreatmentGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @OneToMany(() => GoalIngredient, (gi) => gi.goal)
  goalIngredients: GoalIngredient[];
}
