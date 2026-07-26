import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Ingredient } from '../ingredients/ingredient.entity';
import { TreatmentPhase } from './treatment-phase.entity';

@Entity('treatment_phase_ingredients')
@Unique('UQ_treatment_phase_ingredients_phase_ingredient', [
  'treatmentPhaseId',
  'ingredientId',
])
export class TreatmentPhaseIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  treatmentPhaseId: string;

  @ManyToOne(() => TreatmentPhase, (phase) => phase.phaseIngredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'treatmentPhaseId' })
  treatmentPhase: TreatmentPhase;

  @Column()
  ingredientId: string;

  @ManyToOne(() => Ingredient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingredientId' })
  ingredient: Ingredient;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
