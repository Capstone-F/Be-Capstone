import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoutineCheckIn } from './routine-check-in.entity';
import { RoutineStep } from './routine-step.entity';

@Entity('routine_step_completions')
export class RoutineStepCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineCheckInId: string;

  @Column()
  routineStepId: string;

  @Column({ default: false })
  completed: boolean;

  @Column({ nullable: true, type: 'datetime' })
  completedAt: Date | null;

  @ManyToOne(() => RoutineCheckIn, (checkIn) => checkIn.stepCompletions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineCheckInId' })
  checkIn: RoutineCheckIn;

  @ManyToOne(() => RoutineStep, (step) => step.completions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineStepId' })
  routineStep: RoutineStep;

  @CreateDateColumn()
  createdAt: Date;
}
