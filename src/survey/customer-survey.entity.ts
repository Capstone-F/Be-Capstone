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
import { Customer } from '../users/customer.entity';
import { Answer } from './answer.entity';
import { SurveyFaceLabel } from './survey-face-label.entity';

@Entity('customer_surveys')
export class CustomerSurvey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ nullable: true, type: 'timestamp' })
  completedAt: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  faceImageUrl: string | null;

  @Column({ nullable: true, type: 'varchar' })
  faceImageKey: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  faceScannedAt: Date | null;

  @OneToMany(() => Answer, (answer) => answer.survey)
  answers: Answer[];

  @OneToMany(() => SurveyFaceLabel, (faceLabel) => faceLabel.survey)
  faceLabels: SurveyFaceLabel[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
