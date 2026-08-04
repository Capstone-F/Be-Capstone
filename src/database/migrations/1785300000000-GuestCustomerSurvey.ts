import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuestCustomerSurvey1785300000000 implements MigrationInterface {
  name = 'GuestCustomerSurvey1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "userId" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "guestTokenHash" character varying,
      ADD COLUMN IF NOT EXISTS "guestExpiresAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customers_guestTokenHash"
      ON "customers" ("guestTokenHash")
      WHERE "guestTokenHash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_customers_guestTokenHash"
    `);
    await queryRunner.query(`
      DELETE FROM "customers"
      WHERE "userId" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN IF EXISTS "guestExpiresAt",
      DROP COLUMN IF EXISTS "guestTokenHash"
    `);
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "userId" SET NOT NULL
    `);
  }
}
