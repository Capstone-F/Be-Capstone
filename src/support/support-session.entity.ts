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
import { User } from '../users/user.entity';
import { SupportSessionStatus } from './enums';
import { SupportMessage } from './support-message.entity';

@Entity('support_sessions')
export class SupportSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerUserId' })
  customerUser: User;

  @Column({
    type: 'varchar',
    enum: SupportSessionStatus,
    default: SupportSessionStatus.OPEN,
  })
  status: SupportSessionStatus;

  @Column({ nullable: true, type: 'varchar' })
  subject: string | null;

  @Column({ nullable: true, type: 'uuid' })
  assignedStaffUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedStaffUserId' })
  assignedStaffUser: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'int', default: 0 })
  customerLastReadSeq: number;

  @Column({ type: 'int', default: 0 })
  staffLastReadSeq: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  lastMessagePreview: string | null;

  @Column({ nullable: true, type: 'uuid' })
  closedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  closeReason: string | null;

  @OneToMany(() => SupportMessage, (message) => message.session)
  messages: SupportMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
