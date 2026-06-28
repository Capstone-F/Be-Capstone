import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ConflictSeverity } from '../products/enums/conflict-severity.enum';
import { IngredientProtocol } from './ingredient-protocol.entity';

@Entity('ingredient_conflicts')
@Unique('UQ_ingredient_conflicts_pair', ['protocolId', 'conflictingProtocolId'])
export class IngredientConflict {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  protocolId: string;

  @Column()
  conflictingProtocolId: string;

  @Column({
    type: 'varchar',
    enum: ConflictSeverity,
  })
  severity: ConflictSeverity;

  @Column({ nullable: true, type: 'varchar' })
  reason: string | null;

  @ManyToOne(() => IngredientProtocol, (protocol) => protocol.conflicts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'protocolId' })
  protocol: IngredientProtocol;

  @ManyToOne(() => IngredientProtocol, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conflictingProtocolId' })
  conflictingProtocol: IngredientProtocol;
}
