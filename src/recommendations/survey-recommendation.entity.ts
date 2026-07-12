import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CustomerSurvey } from '../survey/customer-survey.entity';
import { Customer } from '../users/customer.entity';
import { SurveyRecommendationItem } from './survey-recommendation-item.entity';

@Entity('survey_recommendations')
@Index('IDX_survey_recommendations_customer', ['customerId'])
@Index('UQ_survey_recommendations_survey', ['customerSurveyId'], {
  unique: true,
})
export class SurveyRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column()
  customerSurveyId: string;

  @ManyToOne(() => CustomerSurvey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerSurveyId' })
  customerSurvey: CustomerSurvey;

  @OneToMany(() => SurveyRecommendationItem, (item) => item.recommendation)
  items: SurveyRecommendationItem[];

  @CreateDateColumn()
  createdAt: Date;
}
