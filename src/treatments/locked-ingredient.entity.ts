import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ingredient } from '../ingredients/ingredient.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';

@Entity('locked_ingredients')
export class LockedIngredient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column()
  ingredientId: string;

  @ManyToOne(() => Ingredient, (ingredient) => ingredient.lockedIngredients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ingredientId' })
  ingredient: Ingredient;

  @Column()
  lockedByExpertId: string;

  @ManyToOne(() => Expert, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lockedByExpertId' })
  lockedByExpert: Expert;

  @Column({ nullable: true, type: 'text' })
  reason: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp' })
  lockedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  unlockedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
