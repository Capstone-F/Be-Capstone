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
import { Routine } from './routine.entity';
import { RoutineStepCompletion } from './routine-step-completion.entity';
import { RoutineSideEffect } from './routine-side-effect.entity';

@Entity('routine_check_ins')
export class RoutineCheckIn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineId: string;

  @ManyToOne(() => Routine, (routine) => routine.checkIns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineId' })
  routine: Routine;

  @Column({ type: 'date' })
  checkInDate: Date;

  @Column({ type: 'int', nullable: true })
  acneLevel: number | null;

  @Column({ type: 'int', nullable: true })
  oilLevel: number | null;

  @Column({ type: 'int', nullable: true })
  rednessLevel: number | null;

  @Column({ type: 'int', nullable: true })
  moistureLevel: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  completionRate: number | null;

  @Column({ nullable: true, type: 'text' })
  note: string | null;

  @OneToMany(() => RoutineStepCompletion, (completion) => completion.checkIn)
  stepCompletions: RoutineStepCompletion[];

  @OneToMany(() => RoutineSideEffect, (effect) => effect.checkIn)
  sideEffects: RoutineSideEffect[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
