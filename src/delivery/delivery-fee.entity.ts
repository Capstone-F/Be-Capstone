import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DeliveryProvider } from './delivery-provider.entity';
import { DeliveryType } from './enums';

@Entity('delivery_fees')
@Index('UQ_delivery_fees_provider_type', ['providerId', 'type'], {
  unique: true,
})
export class DeliveryFee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerId: string;

  @ManyToOne(() => DeliveryProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: DeliveryProvider;

  @Column({
    type: 'varchar',
    enum: DeliveryType,
  })
  type: DeliveryType;

  @Column({ type: 'int' })
  feeVnd: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
