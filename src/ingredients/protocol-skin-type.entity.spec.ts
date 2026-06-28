import { getMetadataArgsStorage } from 'typeorm';
import { SkinTypeRecommendation } from './enums';
import { IngredientProtocol } from './ingredient-protocol.entity';
import { ProtocolSkinType } from './protocol-skin-type.entity';

function resolveRelationType(type: unknown): unknown {
  return typeof type === 'function' ? type() : type;
}

describe('ProtocolSkinType entity', () => {
  it('should map IngredientProtocol to ProtocolSkinType as one-to-many', () => {
    const relation = getMetadataArgsStorage().relations.find(
      (entry) =>
        entry.target === IngredientProtocol &&
        entry.propertyName === 'protocolSkinTypes' &&
        entry.relationType === 'one-to-many',
    );

    expect(relation).toBeDefined();
    expect(resolveRelationType(relation?.type)).toBe(ProtocolSkinType);
  });

  it('should require recommendation enum on join rows', () => {
    const column = getMetadataArgsStorage().columns.find(
      (entry) =>
        entry.target === ProtocolSkinType &&
        entry.propertyName === 'recommendation',
    );

    expect(column).toBeDefined();
    expect(column?.options.enum).toBe(SkinTypeRecommendation);
  });

  it('should enforce unique protocolId and skinTypeId pair', () => {
    const unique = getMetadataArgsStorage().uniques.find(
      (entry) =>
        entry.target === ProtocolSkinType &&
        entry.name === 'UQ_protocol_skin_types',
    );

    expect(unique?.columns).toEqual(['protocolId', 'skinTypeId']);
  });
});
