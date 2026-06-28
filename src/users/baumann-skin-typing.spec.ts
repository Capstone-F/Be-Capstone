import { getMetadataArgsStorage } from 'typeorm';
import { Customer } from './customer.entity';
import { CustomerSkinTypeDetails } from './customer-skin-type-details.entity';
import { SkinType } from './skin-type.entity';

function resolveRelationType(type: unknown): unknown {
  return typeof type === 'function' ? type() : type;
}

describe('Baumann skin typing entities', () => {
  it('should map Customer to CustomerSkinTypeDetails as 1:1', () => {
    const relation = getMetadataArgsStorage().relations.find(
      (entry) =>
        entry.target === Customer &&
        entry.propertyName === 'skinTypeDetails' &&
        entry.relationType === 'one-to-one',
    );

    expect(relation).toBeDefined();
    expect(resolveRelationType(relation?.type)).toBe(CustomerSkinTypeDetails);
  });

  it('should map CustomerSkinTypeDetails to Customer with owning join column', () => {
    const relation = getMetadataArgsStorage().relations.find(
      (entry) =>
        entry.target === CustomerSkinTypeDetails &&
        entry.propertyName === 'customer' &&
        entry.relationType === 'one-to-one',
    );
    const joinColumn = getMetadataArgsStorage().joinColumns.find(
      (entry) =>
        entry.target === CustomerSkinTypeDetails &&
        entry.propertyName === 'customer',
    );

    expect(relation).toBeDefined();
    expect(joinColumn?.name).toBe('customerId');
  });

  it('should map CustomerSkinTypeDetails to SkinType as many-to-one', () => {
    const relation = getMetadataArgsStorage().relations.find(
      (entry) =>
        entry.target === CustomerSkinTypeDetails &&
        entry.propertyName === 'skinType' &&
        entry.relationType === 'many-to-one',
    );

    expect(relation).toBeDefined();
    expect(resolveRelationType(relation?.type)).toBe(SkinType);
  });

  it('should define four Baumann axis columns on SkinType', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((entry) => entry.target === SkinType)
      .map((entry) => entry.propertyName);

    expect(columns).toEqual(
      expect.arrayContaining([
        'oilyDry',
        'sensitiveResistant',
        'pigmentedNonPigmented',
        'wrinkledTight',
      ]),
    );
  });
});
