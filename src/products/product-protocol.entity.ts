import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { IngredientProtocol } from '../ingredients/ingredient-protocol.entity';
import { Product } from './product.entity';

@Entity('product_protocols')
@Unique('UQ_product_protocols_product_protocol', ['productId', 'protocolId'])
export class ProductProtocol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @Column()
  protocolId: string;

  @ManyToOne(() => Product, (product) => product.productProtocols, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => IngredientProtocol, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'protocolId' })
  protocol: IngredientProtocol;
}
