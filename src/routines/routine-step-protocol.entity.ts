import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { RoutineStep } from './routine-step.entity';

@Entity('routine_step_protocols')
@Unique('UQ_routine_step_protocols_step_protocol', [
  'routineStepId',
  'protocolId',
])
export class RoutineStepProtocol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineStepId: string;

  @Column()
  protocolId: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  amountMl: number | null;

  @ManyToOne(() => RoutineStep, (step) => step.stepProtocols, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineStepId' })
  routineStep: RoutineStep;

  @ManyToOne(
    () => IngredientProtocol,
    (protocol) => protocol.routineStepProtocols,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'protocolId' })
  protocol: IngredientProtocol;
}
