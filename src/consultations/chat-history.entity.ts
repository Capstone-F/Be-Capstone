import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { ConsultationRequest } from './consultation-request.entity';

@Entity('chat_histories')
export class ChatHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  consultationId: string;

  @ManyToOne(
    () => ConsultationRequest,
    (consultation) => consultation.chatHistory,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'consultationId' })
  consultation: ConsultationRequest;

  @Column()
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
