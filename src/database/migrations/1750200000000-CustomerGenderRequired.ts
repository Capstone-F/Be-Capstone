import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerGenderRequired1750200000000 implements MigrationInterface {
  name = 'CustomerGenderRequired1750200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "customers"
      SET "gender" = 'NOT_PREFER_TO_SAY'
      WHERE "gender" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "gender" SET DEFAULT 'NOT_PREFER_TO_SAY'
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "gender" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "gender" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "gender" DROP DEFAULT
    `);
  }
}
