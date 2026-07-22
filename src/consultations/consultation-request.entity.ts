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
import { BookingCancelledBy, ConsultationStatus } from './enums';
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

  @OneToMany(() => ChatHistory, (chat) => chat.consultation)
  chatHistory: ChatHistory[];

  @OneToOne(() => Feedback, (feedback) => feedback.consultation)
  feedback: Feedback;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
