import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Routine } from './routine.entity';
import { SupportHabit } from './support-habit.entity';

@Entity('routine_support_habits')
@Unique('UQ_routine_support_habits_routine_habit', [
  'routineId',
  'supportHabitId',
])
export class RoutineSupportHabit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineId: string;

  @Column()
  supportHabitId: string;

  @ManyToOne(() => Routine, (routine) => routine.supportHabits, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineId' })
  routine: Routine;

  @ManyToOne(() => SupportHabit, (habit) => habit.routineSupportHabits, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'supportHabitId' })
  supportHabit: SupportHabit;
}
