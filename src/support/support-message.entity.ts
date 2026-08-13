import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { SupportMessageSenderRole } from './enums';
import { SupportSession } from './support-session.entity';

@Entity('support_messages')
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SupportSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: SupportSession;

  @Column({ type: 'int' })
  seq: number;

  @Column({ type: 'uuid' })
  senderUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderUserId' })
  senderUser: User;

  @Column({
    type: 'varchar',
    enum: SupportMessageSenderRole,
  })
  senderRole: SupportMessageSenderRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
