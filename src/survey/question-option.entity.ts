import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Label } from './label.entity';
import { Question } from './question.entity';

@Entity('question_options')
@Unique('UQ_question_options_question_label', ['questionId', 'labelId'])
export class QuestionOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  questionId: string;

  @ManyToOne(() => Question, (question) => question.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question: Question;

  @Column()
  labelId: string;

  @ManyToOne(() => Label, (label) => label.questionOptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'labelId' })
  label: Label;

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @Column({ default: true })
  isActive: boolean;
}
