import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabelVietnameseNormalized1784000000000 implements MigrationInterface {
  name = 'AddLabelVietnameseNormalized1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "labels"
      ADD COLUMN IF NOT EXISTS "vietnameseNormalized" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "label_categories"
      ADD COLUMN IF NOT EXISTS "vietnameseNormalized" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "label_categories"
      DROP COLUMN IF EXISTS "vietnameseNormalized"
    `);
    await queryRunner.query(`
      ALTER TABLE "labels"
      DROP COLUMN IF EXISTS "vietnameseNormalized"
    `);
  }
}
