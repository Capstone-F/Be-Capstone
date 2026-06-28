import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngredientConflict } from './ingredient-conflict.entity';
import { IngredientProtocol } from './ingredient-protocol.entity';
import { Ingredient } from './ingredient.entity';
import { ProtocolLabel } from './protocol-label.entity';
import { ProtocolSkinType } from './protocol-skin-type.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ingredient,
      IngredientProtocol,
      IngredientConflict,
      ProtocolLabel,
      ProtocolSkinType,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class IngredientsModule {}
