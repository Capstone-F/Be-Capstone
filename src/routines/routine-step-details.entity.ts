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
import { ProductVariant } from '../products/product-variant.entity';
import { ProductInstance } from '../stock/product-instance.entity';
import { RoutinePeriod } from './enums';
import { RoutineStep } from './routine-step.entity';
import { RoutineEndpointForecast } from './routine-endpoint-forecast.entity';

@Entity('routine_step_details')
export class RoutineStepDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  routineStepId: string;

  @ManyToOne(() => RoutineStep, (step) => step.details, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'routineStepId' })
  routineStep: RoutineStep;

  @Column()
  productVariantId: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.routineStepDetails, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'productVariantId' })
  productVariant: ProductVariant;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  amountMl: number | null;

  @Column({ type: 'date', nullable: true })
  date: Date | null;

  @Column({
    type: 'varchar',
    enum: RoutinePeriod,
    nullable: true,
  })
  period: RoutinePeriod | null;

  @Column({ nullable: true, type: 'text' })
  progressNote: string | null;

  @OneToMany(
    () => RoutineEndpointForecast,
    (forecast) => forecast.routineStepDetails,
  )
  forecasts: RoutineEndpointForecast[];

  @OneToMany(() => ProductInstance, (instance) => instance.routineStepDetails)
  productInstances: ProductInstance[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
