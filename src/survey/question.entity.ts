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

/**
 * Branching rules for CONDITIONAL / OPTIONAL questions.
 *
 * Positive unlock groups (`anyLabelCodes`, `allLabelCodes`, age gates) combine with
 * `match`: `'any'` (default = OR) or `'all'` (AND).
 * `noneLabelCodes` is always an extra AND constraint when set.
 */
export type QuestionAskWhen = {
  /** Unlock with no other positive gates (still subject to priority + noneLabelCodes). */
  always?: boolean;
  /** Unlock if the customer answered any of these labels. */
  anyLabelCodes?: string[];
  /** Unlock if the customer answered all of these labels. */
  allLabelCodes?: string[];
  /** Block if the customer answered any of these labels. */
  noneLabelCodes?: string[];
  /** Unlock if profile age group matches (UNDER_18, AGE_18_25, …). */
  anyAgeGroupCodes?: string[];
  /** Inclusive minimum age from profile dateOfBirth. */
  minAge?: number;
  /** Inclusive maximum age from profile dateOfBirth. */
  maxAge?: number;
  /** How to combine positive unlock groups. Default `'any'`. */
  match?: 'any' | 'all';
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
