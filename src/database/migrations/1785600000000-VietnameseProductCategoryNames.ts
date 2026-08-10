import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KnowledgeDrivenSchema seeded product categories with English names. Only rows still
 * holding those exact defaults are renamed, so manually curated names are preserved.
 */
const TRANSLATIONS: Array<{ code: string; en: string; vi: string }> = [
  { code: 'CLEANSER', en: 'Cleanser', vi: 'Sữa rửa mặt' },
  { code: 'TONER', en: 'Toner', vi: 'Toner' },
  { code: 'SERUM', en: 'Serum', vi: 'Serum' },
  { code: 'MOISTURIZER', en: 'Moisturizer', vi: 'Kem dưỡng ẩm' },
  { code: 'SUNSCREEN', en: 'Sunscreen', vi: 'Kem chống nắng' },
  { code: 'TREATMENT', en: 'Treatment', vi: 'Sản phẩm đặc trị' },
];

export class VietnameseProductCategoryNames1785600000000 implements MigrationInterface {
  name = 'VietnameseProductCategoryNames1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { code, en, vi } of TRANSLATIONS) {
      await queryRunner.query(
        `UPDATE "product_categories" SET "name" = $1 WHERE "code" = $2 AND "name" = $3`,
        [vi, code, en],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { code, en, vi } of TRANSLATIONS) {
      await queryRunner.query(
        `UPDATE "product_categories" SET "name" = $1 WHERE "code" = $2 AND "name" = $3`,
        [en, code, vi],
      );
    }
  }
}
