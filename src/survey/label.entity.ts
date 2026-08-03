import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AnswerLabel } from './answer-label.entity';
import { LabelCategory } from './label-category.entity';
import { ProtocolLabel } from '../ingredients/protocol-label.entity';
import { QuestionOption } from './question-option.entity';
import { SurveyFaceLabel } from './survey-face-label.entity';

@Entity('labels')
@Index('IDX_labels_code', ['code'], { unique: true })
export class Label {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  categoryId: string;

  @ManyToOne(() => LabelCategory, (category) => category.labels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'categoryId' })
  category: LabelCategory;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({ nullable: true, type: 'varchar' })
  vietnameseNormalized: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => AnswerLabel, (al) => al.label)
  answerLabels: AnswerLabel[];

  @OneToMany(() => SurveyFaceLabel, (sfl) => sfl.label)
  surveyFaceLabels: SurveyFaceLabel[];

  @OneToMany(() => ProtocolLabel, (pl) => pl.label)
  protocolLabels: ProtocolLabel[];

  @OneToMany(() => QuestionOption, (option) => option.label)
  questionOptions: QuestionOption[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
