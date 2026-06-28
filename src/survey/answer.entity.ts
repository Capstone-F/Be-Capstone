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
import { AnswerLabel } from './answer-label.entity';
import { CustomerSurvey } from './customer-survey.entity';
import { Question } from './question.entity';

@Entity('answers')
export class Answer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  surveyId: string;

  @ManyToOne(() => CustomerSurvey, (survey) => survey.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'surveyId' })
  survey: CustomerSurvey;

  @Column()
  questionId: string;

  @ManyToOne(() => Question, (question) => question.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question: Question;

  @Column({ nullable: true, type: 'text' })
  value: string | null;

  @OneToMany(() => AnswerLabel, (al) => al.answer)
  answerLabels: AnswerLabel[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
