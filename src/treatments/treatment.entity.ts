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
import { Clinic } from '../clinics/clinic.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { TreatmentStatus } from './enums';
import { TreatmentAccess } from './treatment-access.entity';
import { TreatmentEvent } from './treatment-event.entity';
import { TreatmentPhase } from './treatment-phase.entity';

@Entity('treatments')
export class Treatment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column()
  expertId: string;

  @ManyToOne(() => Expert, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expertId' })
  expert: Expert;

  @Column({ nullable: true, type: 'uuid' })
  clinicId: string | null;

  @ManyToOne(() => Clinic, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic | null;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({
    type: 'varchar',
    enum: TreatmentStatus,
    default: TreatmentStatus.DRAFT,
  })
  status: TreatmentStatus;

  @Column({ type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'date', nullable: true })
  endDate: Date | null;

  @OneToMany(() => TreatmentPhase, (phase) => phase.treatment)
  phases: TreatmentPhase[];

  @OneToMany(() => TreatmentEvent, (event) => event.treatment)
  events: TreatmentEvent[];

  @OneToMany(() => TreatmentAccess, (access) => access.treatment)
  accessRecords: TreatmentAccess[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
