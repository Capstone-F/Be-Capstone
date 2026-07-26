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
import { Routine } from '../routines/routine.entity';
import { TreatmentPhaseType, TreatmentPhaseStatus } from './enums';
import { Treatment } from './treatment.entity';
import { TreatmentPhaseIngredient } from './treatment-phase-ingredient.entity';
import { TreatmentPhaseProduct } from './treatment-phase-product.entity';

@Entity('treatment_phases')
export class TreatmentPhase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  treatmentId: string;

  @ManyToOne(() => Treatment, (treatment) => treatment.phases, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'treatmentId' })
  treatment: Treatment;

  @Column({
    type: 'varchar',
    enum: TreatmentPhaseType,
  })
  phaseType: TreatmentPhaseType;

  @Column({ type: 'int', default: 0 })
  phaseOrder: number;

  @Column({ nullable: true, type: 'varchar' })
  title: string | null;

  @Column({ nullable: true, type: 'text' })
  goals: string | null;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @Column({ nullable: true, type: 'text' })
  achievements: string | null;

  /** Expert service fee portion for this phase (VND). */
  @Column({ type: 'bigint', default: 0 })
  priceVnd: string;

  @Column({
    type: 'varchar',
    enum: TreatmentPhaseStatus,
    default: TreatmentPhaseStatus.PENDING,
  })
  status: TreatmentPhaseStatus;

  @Column({ type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true })
  endDate: Date | null;

  @OneToMany(() => Routine, (routine) => routine.treatmentPhase)
  routines: Routine[];

  @OneToMany(() => TreatmentPhaseIngredient, (row) => row.treatmentPhase)
  phaseIngredients: TreatmentPhaseIngredient[];

  @OneToMany(() => TreatmentPhaseProduct, (row) => row.treatmentPhase)
  phaseProducts: TreatmentPhaseProduct[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
