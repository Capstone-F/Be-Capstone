import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clinics')
export class Clinic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  address: string | null;

  @Column({ nullable: true, type: 'decimal', precision: 9, scale: 6 })
  latitude: number | null;

  @Column({ nullable: true, type: 'decimal', precision: 9, scale: 6 })
  longitude: number | null;

  @Column({ default: true })
  isActive: boolean;

  /** Bank name for clinic withdrawals (set by clinic manager). */
  @Column({ nullable: true, type: 'varchar' })
  bankName: string | null;

  /** Bank account number for clinic withdrawals. */
  @Column({ nullable: true, type: 'varchar' })
  bankAccountNumber: string | null;

  /** Account holder name for clinic withdrawals. */
  @Column({ nullable: true, type: 'varchar' })
  bankAccountHolder: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
