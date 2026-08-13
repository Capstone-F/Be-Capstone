import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';

@Entity('clinic_wallets')
export class ClinicWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, type: 'uuid' })
  clinicId: string;

  @OneToOne(() => Clinic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;

  @Column({ type: 'bigint', default: 0 })
  balanceVnd: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
