import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Answer } from './answer.entity';
import { QuestionOption } from './question-option.entity';

export enum QuestionPriority {
  CORE = 'CORE',
  CONDITIONAL = 'CONDITIONAL',
  OPTIONAL = 'OPTIONAL',
}

export type QuestionAskWhen = {
  always?: boolean;
  anyLabelCodes?: string[];
};

@Entity('questions')
@Index('IDX_questions_code', ['code'], { unique: true })
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  text: string;

  @Column({ nullable: true, type: 'varchar' })
  questionType: string | null;

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @Column({
    type: 'varchar',
    enum: QuestionPriority,
    default: QuestionPriority.CORE,
  })
  priority: QuestionPriority;

  @Column({ type: 'varchar', default: 'GENERAL' })
  category: string;

  @Column({ type: 'jsonb', nullable: true })
  askWhen: QuestionAskWhen | null;

  @Column({ type: 'varchar', nullable: true })
  intent: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Answer, (answer) => answer.question)
  answers: Answer[];

  @OneToMany(() => QuestionOption, (option) => option.question)
  options: QuestionOption[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
