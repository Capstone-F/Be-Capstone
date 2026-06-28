import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RoutineStepDetails } from './routine-step-details.entity';

@Entity('routine_endpoint_forecasts')
export class RoutineEndpointForecast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineStepDetailsId: string;

  @ManyToOne(() => RoutineStepDetails, (details) => details.forecasts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineStepDetailsId' })
  routineStepDetails: RoutineStepDetails;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  purchasedVolumeMl: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  dailyUsageMl: number;

  @Column({ type: 'date', nullable: true })
  forecastRunoutDate: Date | null;

  @Column({ default: false })
  reorderAlertSent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
