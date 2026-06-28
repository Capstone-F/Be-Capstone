import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProtocolSkinType } from '../ingredients/protocol-skin-type.entity';
import { CustomerSkinTypeDetails } from './customer-skin-type-details.entity';
import {
  OilyDry,
  PigmentedNonPigmented,
  SensitiveResistant,
  WrinkledTight,
} from './skin-type.enums';

@Entity('skin_types')
@Index('IDX_skin_types_code', ['code'], { unique: true })
export class SkinType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({ type: 'varchar', enum: OilyDry })
  oilyDry: OilyDry;

  @Column({ type: 'varchar', enum: SensitiveResistant })
  sensitiveResistant: SensitiveResistant;

  @Column({ type: 'varchar', enum: PigmentedNonPigmented })
  pigmentedNonPigmented: PigmentedNonPigmented;

  @Column({ type: 'varchar', enum: WrinkledTight })
  wrinkledTight: WrinkledTight;

  @OneToMany(() => ProtocolSkinType, (ps) => ps.skinType)
  protocolSkinTypes: ProtocolSkinType[];

  @OneToMany(() => CustomerSkinTypeDetails, (d) => d.skinType)
  customerDetails: CustomerSkinTypeDetails[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
