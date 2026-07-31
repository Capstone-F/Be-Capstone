import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImageUrls1784700000000 implements MigrationInterface {
  name = 'ImageUrls1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "imageUrl" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "experts" ADD COLUMN IF NOT EXISTS "avatarUrl" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experts" DROP COLUMN IF EXISTS "avatarUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "imageUrl"`,
    );
  }
}
