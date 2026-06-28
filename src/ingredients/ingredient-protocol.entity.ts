import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ingredient } from './ingredient.entity';
import { IngredientConflict } from './ingredient-conflict.entity';
import { ProtocolLabel } from './protocol-label.entity';
import { RoutineStepProtocol } from '../routines/routine-step-protocol.entity';

@Entity('ingredient_protocols')
@Index('IDX_ingredient_protocols_code', ['code'], { unique: true })
export class IngredientProtocol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ingredientId: string;

  @ManyToOne(() => Ingredient, (ingredient) => ingredient.protocols, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ingredientId' })
  ingredient: Ingredient;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  concentrationPct: number | null;

  @Column({ nullable: true, type: 'varchar' })
  frequency: string | null;

  @Column({ nullable: true, type: 'varchar' })
  timeOfUse: string | null;

  @Column({ nullable: true, type: 'text' })
  conditions: string | null;

  @Column({ nullable: true, type: 'text' })
  instructions: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ProtocolLabel, (pl) => pl.protocol)
  protocolLabels: ProtocolLabel[];

  @OneToMany(() => IngredientConflict, (c) => c.protocol)
  conflicts: IngredientConflict[];

  @OneToMany(() => RoutineStepProtocol, (rsp) => rsp.protocol)
  routineStepProtocols: RoutineStepProtocol[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
