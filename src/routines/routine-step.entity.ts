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
import { RoutinePeriod } from './enums';
import { Routine } from './routine.entity';
import { RoutineStepDetails } from './routine-step-details.entity';
import { RoutineStepProtocol } from './routine-step-protocol.entity';
import { RoutineStepCompletion } from './routine-step-completion.entity';

@Entity('routine_steps')
export class RoutineStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineId: string;

  @ManyToOne(() => Routine, (routine) => routine.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineId' })
  routine: Routine;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
    enum: RoutinePeriod,
  })
  period: RoutinePeriod;

  @Column({ type: 'int', default: 0 })
  stepOrder: number;

  @Column({ nullable: true, type: 'text' })
  instructions: string | null;

  @OneToMany(() => RoutineStepProtocol, (rsp) => rsp.routineStep)
  stepProtocols: RoutineStepProtocol[];

  @OneToMany(() => RoutineStepDetails, (details) => details.routineStep)
  details: RoutineStepDetails[];

  @OneToMany(
    () => RoutineStepCompletion,
    (completion) => completion.routineStep,
  )
  completions: RoutineStepCompletion[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
