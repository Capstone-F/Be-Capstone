import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductVariant } from '../products/product-variant.entity';
import { StockImportFormStatus } from './enums';
import { StockBatch } from './stock-batch.entity';

@Entity('stock_import_forms')
export class StockImportForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productVariantId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productVariantId' })
  productVariant: ProductVariant;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'date' })
  manufacturingDate: Date;

  @Column({ nullable: true, type: 'varchar' })
  batchCode: string | null;

  @Column({
    type: 'varchar',
    enum: StockImportFormStatus,
    default: StockImportFormStatus.DRAFT,
  })
  status: StockImportFormStatus;

  @Column({ type: 'uuid' })
  createdByUserId: string;

  @Column({ nullable: true, type: 'uuid' })
  submittedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ nullable: true, type: 'uuid' })
  confirmedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ nullable: true, type: 'uuid' })
  cancelledByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ nullable: true, type: 'uuid' })
  rejectedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  rejectionReason: string | null;

  @Column({ nullable: true, type: 'uuid' })
  stockBatchId: string | null;

  @ManyToOne(() => StockBatch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stockBatchId' })
  stockBatch: StockBatch | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
