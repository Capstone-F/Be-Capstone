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
import { ProductVariant } from '../products/product-variant.entity';
import { TreatmentPhase } from './treatment-phase.entity';

@Entity('treatment_phase_products')
@Unique('UQ_treatment_phase_products_phase_variant', [
  'treatmentPhaseId',
  'productVariantId',
])
export class TreatmentPhaseProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  treatmentPhaseId: string;

  @ManyToOne(() => TreatmentPhase, (phase) => phase.phaseProducts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'treatmentPhaseId' })
  treatmentPhase: TreatmentPhase;

  @Column()
  productVariantId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productVariantId' })
  productVariant: ProductVariant;

  @Column({ type: 'float', nullable: true })
  matchScore: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
