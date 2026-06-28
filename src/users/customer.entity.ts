import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerSkinTypeDetails } from './customer-skin-type-details.entity';
import { User } from './user.entity';
import { Gender } from './gender.enum';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, (user) => user.customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true, type: 'varchar' })
  phone: string | null;

  @Column({ nullable: true, type: 'varchar' })
  avatarUrl: string | null;

  @Column({ nullable: true, type: 'date' })
  dateOfBirth: Date | null;

  @Column({ type: 'varchar', enum: Gender, default: Gender.NOT_PREFER_TO_SAY })
  gender: Gender;

  @OneToOne(() => CustomerSkinTypeDetails, (d) => d.customer)
  skinTypeDetails: CustomerSkinTypeDetails;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
