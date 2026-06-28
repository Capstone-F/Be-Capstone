import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { SkinType } from '../users/skin-type.entity';
import { IngredientProtocol } from './ingredient-protocol.entity';
import { SkinTypeRecommendation } from './enums';

@Entity('protocol_skin_types')
@Unique('UQ_protocol_skin_types', ['protocolId', 'skinTypeId'])
export class ProtocolSkinType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  protocolId: string;

  @Column()
  skinTypeId: string;

  @Column({ type: 'varchar', enum: SkinTypeRecommendation })
  recommendation: SkinTypeRecommendation;

  @ManyToOne(
    () => IngredientProtocol,
    (protocol) => protocol.protocolSkinTypes,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'protocolId' })
  protocol: IngredientProtocol;

  @ManyToOne(() => SkinType, (skinType) => skinType.protocolSkinTypes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'skinTypeId' })
  skinType: SkinType;
}
