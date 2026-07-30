import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImageUrls1784700000000 implements MigrationInterface {
  name = 'ImageUrls1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD "imageUrl" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "experts" ADD "avatarUrl" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "experts" DROP COLUMN "avatarUrl"`);
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN "imageUrl"`,
    );
  }
}
