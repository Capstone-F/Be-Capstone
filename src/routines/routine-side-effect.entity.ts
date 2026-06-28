import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SideEffectType } from './enums';
import { RoutineCheckIn } from './routine-check-in.entity';

@Entity('routine_side_effects')
export class RoutineSideEffect {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineCheckInId: string;

  @ManyToOne(() => RoutineCheckIn, (checkIn) => checkIn.sideEffects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineCheckInId' })
  checkIn: RoutineCheckIn;

  @Column({
    type: 'varchar',
    enum: SideEffectType,
  })
  type: SideEffectType;

  @Column({ type: 'int', nullable: true })
  severity: number | null;

  @Column({ nullable: true, type: 'text' })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
