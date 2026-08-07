import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CustomerSurvey } from './customer-survey.entity';
import { Label } from './label.entity';

@Entity('survey_face_labels')
@Unique('UQ_survey_face_labels_survey_label', ['surveyId', 'labelId'])
export class SurveyFaceLabel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  surveyId: string;

  @Column()
  labelId: string;

  @ManyToOne(() => CustomerSurvey, (survey) => survey.faceLabels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'surveyId' })
  survey: CustomerSurvey;

  @ManyToOne(() => Label, (label) => label.surveyFaceLabels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'labelId' })
  label: Label;

  /** AI-generated short Vietnamese explanation for this finding (nullable for legacy rows). */
  @Column({ nullable: true, type: 'varchar', length: 500 })
  explanation: string | null;
}
