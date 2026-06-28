import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Label } from '../survey/label.entity';
import { IngredientProtocol } from './ingredient-protocol.entity';

@Entity('protocol_labels')
@Unique('UQ_protocol_labels_protocol_label', ['protocolId', 'labelId'])
export class ProtocolLabel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  protocolId: string;

  @Column()
  labelId: string;

  @ManyToOne(() => IngredientProtocol, (protocol) => protocol.protocolLabels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'protocolId' })
  protocol: IngredientProtocol;

  @ManyToOne(() => Label, (label) => label.protocolLabels, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'labelId' })
  label: Label;
}
