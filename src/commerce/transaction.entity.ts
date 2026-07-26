import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { Treatment } from '../treatments/treatment.entity';
import { User } from '../users/user.entity';
import { TransactionStatus, TransactionType } from './enums';
import { Order } from './order.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'varchar',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'bigint' })
  amountVnd: string;

  @Column({ nullable: true, type: 'uuid' })
  orderId: string | null;

  @ManyToOne(() => Order, (order) => order.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order | null;

  @Column({ nullable: true, type: 'uuid' })
  consultationId: string | null;

  @ManyToOne(() => ConsultationRequest, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'consultationId' })
  consultation: ConsultationRequest | null;

  @Column({ nullable: true, type: 'uuid' })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ nullable: true, type: 'uuid' })
  treatmentId: string | null;

  @ManyToOne(() => Treatment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'treatmentId' })
  treatment: Treatment | null;

  @Column({ nullable: true, type: 'varchar' })
  externalRef: string | null;

  @Column({ nullable: true, type: 'text' })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
