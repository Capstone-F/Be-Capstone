import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Delivery } from './delivery.entity';

@Entity('delivery_providers')
@Index('IDX_delivery_providers_code', ['code'], { unique: true })
export class DeliveryProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Delivery, (delivery) => delivery.provider)
  deliveries: Delivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
