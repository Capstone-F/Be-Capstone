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
import { Clinic } from '../clinics/clinic.entity';
import { User } from './user.entity';

@Entity('experts')
export class Expert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, (user) => user.expert, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true, type: 'uuid' })
  clinicId: string | null;

  @ManyToOne(() => Clinic, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic | null;

  @Column({ nullable: true, type: 'varchar' })
  specialization: string | null;

  @Column({ nullable: true, type: 'varchar' })
  licenseNumber: string | null;

  @Column({ nullable: true, type: 'text' })
  bio: string | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
