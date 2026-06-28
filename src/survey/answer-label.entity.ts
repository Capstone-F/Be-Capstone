import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Answer } from './answer.entity';
import { Label } from './label.entity';

@Entity('answer_labels')
@Unique('UQ_answer_labels_answer_label', ['answerId', 'labelId'])
export class AnswerLabel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  answerId: string;

  @Column()
  labelId: string;

  @ManyToOne(() => Answer, (answer) => answer.answerLabels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'answerId' })
  answer: Answer;

  @ManyToOne(() => Label, (label) => label.answerLabels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'labelId' })
  label: Label;
}
