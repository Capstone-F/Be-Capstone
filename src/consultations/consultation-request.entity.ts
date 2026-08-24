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
import { Treatment } from '../treatments/treatment.entity';
import {
  BookingAutoCancelReason,
  BookingCancelledBy,
  ConsultationStatus,
} from './enums';
import { ChatHistory } from './chat-history.entity';
import { Feedback } from './feedback.entity';

@Entity('consultation_requests')
export class ConsultationRequest {
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

  @Column({ nullable: true, type: 'text' })
  reason: string | null;

  @Column({
    type: 'varchar',
    enum: ConsultationStatus,
    default: ConsultationStatus.PENDING,
  })
  status: ConsultationStatus;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  cancelReason: string | null;

  @Column({
    type: 'varchar',
    enum: BookingCancelledBy,
    nullable: true,
  })
  cancelledBy: BookingCancelledBy | null;

  /**
   * Penalised-cancel reason: SYSTEM sweeps stamp CONFIRM_TIMEOUT/EXPERT_NO_SHOW,
   * an expert cancel inside the late-cancel threshold stamps EXPERT_LATE_CANCEL.
   * NO_SHOW and LATE_CANCEL unlock customer feedback.
   */
  @Column({
    type: 'varchar',
    enum: BookingAutoCancelReason,
    nullable: true,
  })
  autoCancelReason: BookingAutoCancelReason | null;

  /** Linked paid treatment when this booking is a free follow-up (tái khám). */
  @Column({ type: 'uuid', nullable: true })
  treatmentId: string | null;

  @ManyToOne(() => Treatment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'treatmentId' })
  treatment: Treatment | null;

  /** Amount debited from wallet (0 when follow-up waived). Null until pay step. */
  @Column({ type: 'bigint', nullable: true })
  feeChargedVnd: string | null;

  @Column({ type: 'uuid', nullable: true })
  paidTransactionId: string | null;

  @Column({ default: false })
  isFollowUp: boolean;

  @OneToMany(() => ChatHistory, (chat) => chat.consultation)
  chatHistory: ChatHistory[];

  @OneToOne(() => Feedback, (feedback) => feedback.consultation)
  feedback: Feedback;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
