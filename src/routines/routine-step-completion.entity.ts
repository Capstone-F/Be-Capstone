import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RoutinePeriod, SkipReason, StepCompletionStatus } from './enums';
import { RoutineStep } from './routine-step.entity';
import { Routine } from './routine.entity';

@Entity('routine_step_completions')
@Unique('UQ_routine_step_completions_step_date', [
  'routineStepId',
  'sessionDate',
])
@Index('IDX_routine_step_completions_routine_date_period', [
  'routineId',
  'sessionDate',
  'period',
])
export class RoutineStepCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineId: string;

  @ManyToOne(() => Routine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routineId' })
  routine: Routine;

  @Column()
  routineStepId: string;

  @ManyToOne(() => RoutineStep, (step) => step.completions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineStepId' })
  routineStep: RoutineStep;

  @Column({ type: 'date' })
  sessionDate: Date;

  @Column({ type: 'varchar', enum: RoutinePeriod })
  period: RoutinePeriod;

  @Column({ type: 'varchar', enum: StepCompletionStatus })
  status: StepCompletionStatus;

  @Column({ type: 'varchar', enum: SkipReason, nullable: true })
  skipReason: SkipReason | null;

  @Column({ nullable: true, type: 'text' })
  skipNote: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
