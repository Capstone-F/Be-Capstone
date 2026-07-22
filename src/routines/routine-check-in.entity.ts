import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { CheckInMood, RoutinePeriod } from './enums';
import { Routine } from './routine.entity';
import { RoutineSideEffect } from './routine-side-effect.entity';

@Entity('routine_check_ins')
@Unique('UQ_routine_check_ins_routine_date_period', [
  'routineId',
  'checkInDate',
  'period',
])
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

  @Column({ type: 'varchar', enum: RoutinePeriod })
  period: RoutinePeriod;

  @Column({ type: 'varchar', enum: CheckInMood, nullable: true })
  overallMood: CheckInMood | null;

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

  @OneToMany(() => RoutineSideEffect, (effect) => effect.checkIn)
  sideEffects: RoutineSideEffect[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
