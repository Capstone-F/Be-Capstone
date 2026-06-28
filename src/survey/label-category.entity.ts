import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Label } from './label.entity';

@Entity('label_categories')
@Index('IDX_label_categories_code', ['code'], { unique: true })
export class LabelCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @OneToMany(() => Label, (label) => label.category)
  labels: Label[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
