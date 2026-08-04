import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerAllergy } from './customer-allergy.entity';
import { CustomerSkinTypeDetails } from './customer-skin-type-details.entity';
import { User } from './user.entity';
import { Gender } from './gender.enum';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null for guest customers created via survey without login. */
  @Column({ unique: true, nullable: true, type: 'uuid' })
  userId: string | null;

  @OneToOne(() => User, (user) => user.customer, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  /** SHA-256 hex of guest token; null for authenticated customers. */
  @Column({ nullable: true, type: 'varchar' })
  guestTokenHash: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  guestExpiresAt: Date | null;

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

  @OneToMany(() => CustomerAllergy, (ca) => ca.customer)
  allergies: CustomerAllergy[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
