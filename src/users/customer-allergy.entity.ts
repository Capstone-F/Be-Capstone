import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Label } from '../survey/label.entity';
import { Customer } from './customer.entity';

@Entity('customer_allergies')
@Unique(['customerId', 'labelId'])
export class CustomerAllergy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column()
  labelId: string;

  @ManyToOne(() => Label, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labelId' })
  label: Label;

  @CreateDateColumn()
  createdAt: Date;
}
