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

@Entity('customer_surveys')
export class CustomerSurvey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ nullable: true, type: 'uuid' })
  skinTypeId: string | null;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ nullable: true, type: 'timestamp' })
  completedAt: Date | null;

  @OneToMany(() => Answer, (answer) => answer.survey)
  answers: Answer[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
