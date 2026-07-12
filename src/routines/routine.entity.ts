import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { TreatmentPhase } from '../treatments/treatment-phase.entity';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import { Order } from '../commerce/order.entity';
import { RoutineType, RoutineStatus } from './enums';
import { RoutineCheckIn } from './routine-check-in.entity';
import { RoutineStep } from './routine-step.entity';
import { RoutineSupportHabit } from './routine-support-habit.entity';

@Entity('routines')
export class Routine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ nullable: true, type: 'uuid' })
  treatmentPhaseId: string | null;

  @ManyToOne(() => TreatmentPhase, (phase) => phase.routines, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'treatmentPhaseId' })
  treatmentPhase: TreatmentPhase | null;

  @Column({ nullable: true, type: 'uuid' })
  createdByExpertId: string | null;

  @ManyToOne(() => Expert, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByExpertId' })
  createdByExpert: Expert | null;

  @Column({ nullable: true, type: 'uuid' })
  sourceOrderId: string | null;

  @OneToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourceOrderId' })
  sourceOrder: Order | null;

  @Column({ nullable: true, type: 'uuid' })
  customerSurveyId: string | null;

  @ManyToOne(() => CustomerSurvey, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerSurveyId' })
  customerSurvey: CustomerSurvey | null;

  @Column({ nullable: true, type: 'uuid' })
  surveyRecommendationId: string | null;

  @ManyToOne(() => SurveyRecommendation, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'surveyRecommendationId' })
  surveyRecommendation: SurveyRecommendation | null;

  @Column({
    type: 'varchar',
    enum: RoutineType,
  })
  type: RoutineType;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({
    type: 'varchar',
    enum: RoutineStatus,
    default: RoutineStatus.DRAFT,
  })
  status: RoutineStatus;

  @OneToMany(() => RoutineStep, (step) => step.routine)
  steps: RoutineStep[];

  @OneToMany(() => RoutineCheckIn, (checkIn) => checkIn.routine)
  checkIns: RoutineCheckIn[];

  @OneToMany(() => RoutineSupportHabit, (rsh) => rsh.routine)
  supportHabits: RoutineSupportHabit[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
