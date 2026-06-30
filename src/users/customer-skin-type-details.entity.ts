import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { SkinType } from './skin-type.entity';

@Entity('customer_skin_type_details')
export class CustomerSkinTypeDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  customerId: string;

  @OneToOne(() => Customer, (customer) => customer.skinTypeDetails, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({ nullable: true, type: 'uuid' })
  skinTypeId: string | null;

  @ManyToOne(() => SkinType, (skinType) => skinType.customerDetails, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'skinTypeId' })
  skinType: SkinType | null;

  @Column({ nullable: true, type: 'int' })
  oilyDryScore: number | null;

  @Column({ nullable: true, type: 'int' })
  sensitiveResistantScore: number | null;

  @Column({ nullable: true, type: 'int' })
  pigmentedNonPigmentedScore: number | null;

  @Column({ nullable: true, type: 'int' })
  wrinkledTightScore: number | null;

  @Column({ nullable: true, type: 'timestamp' })
  assessedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
