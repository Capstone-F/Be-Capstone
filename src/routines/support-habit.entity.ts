import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SupportHabitType } from './enums';
import { RoutineSupportHabit } from './routine-support-habit.entity';

@Entity('support_habits')
@Index('IDX_support_habits_code', ['code'], { unique: true })
export class SupportHabit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
    enum: SupportHabitType,
  })
  type: SupportHabitType;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @OneToMany(() => RoutineSupportHabit, (rsh) => rsh.supportHabit)
  routineSupportHabits: RoutineSupportHabit[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
