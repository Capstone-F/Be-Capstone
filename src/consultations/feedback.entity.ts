import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConsultationRequest } from './consultation-request.entity';

@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  consultationId: string;

  @OneToOne(
    () => ConsultationRequest,
    (consultation) => consultation.feedback,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'consultationId' })
  consultation: ConsultationRequest;

  @Column({ type: 'int' })
  rating: number;

  @Column({ nullable: true, type: 'text' })
  comment: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
