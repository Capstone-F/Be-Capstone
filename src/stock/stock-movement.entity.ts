import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StockMovementType } from './enums';
import { StockBatch } from './stock-batch.entity';

@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  batchId: string;

  @ManyToOne(() => StockBatch, (batch) => batch.movements, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batchId' })
  batch: StockBatch;

  @Column({
    type: 'varchar',
    enum: StockMovementType,
  })
  type: StockMovementType;

  /** Positive magnitude; sign implied by type. */
  @Column({ type: 'int' })
  quantity: number;

  @Column({ nullable: true, type: 'varchar' })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
