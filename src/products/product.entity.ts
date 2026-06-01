import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShelfLifeUnit } from '../stock/enums';
import { StockBatch } from '../stock/stock-batch.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'int' })
  shelfLifeValue: number;

  @Column({
    type: 'varchar',
    enum: ShelfLifeUnit,
    default: ShelfLifeUnit.DAY,
  })
  shelfLifeUnit: ShelfLifeUnit;

  @OneToMany(() => StockBatch, (batch) => batch.product)
  batches: StockBatch[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
