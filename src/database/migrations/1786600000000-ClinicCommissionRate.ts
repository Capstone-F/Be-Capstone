import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicCommissionRate1786600000000 implements MigrationInterface {
  name = 'ClinicCommissionRate1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clinics"
      ADD COLUMN "commissionRatePct" numeric(5,2)
    `);

    await queryRunner.query(`
      UPDATE "clinics"
      SET "commissionRatePct" = COALESCE(
        (
          SELECT CASE
            WHEN "value" ~ '^[0-9]+([.][0-9]+)?$'
              AND "value"::numeric BETWEEN 0 AND 100
            THEN "value"::numeric
            ELSE 10
          END
          FROM "commerce_settings"
          WHERE "key" = 'PLATFORM_COMMISSION_PCT'
          LIMIT 1
        ),
        10
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "clinics"
      ALTER COLUMN "commissionRatePct" SET DEFAULT 10,
      ALTER COLUMN "commissionRatePct" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "clinics"
      ADD CONSTRAINT "CHK_clinics_commissionRatePct"
      CHECK ("commissionRatePct" BETWEEN 0 AND 100)
    `);

    await queryRunner.query(`
      DELETE FROM "commerce_settings"
      WHERE "key" = 'PLATFORM_COMMISSION_PCT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "commerce_settings" ("key", "value", "updatedByUserId")
      VALUES ('PLATFORM_COMMISSION_PCT', '10', NULL)
      ON CONFLICT ("key") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "clinics"
      DROP CONSTRAINT IF EXISTS "CHK_clinics_commissionRatePct"
    `);
    await queryRunner.query(`
      ALTER TABLE "clinics"
      DROP COLUMN "commissionRatePct"
    `);
  }
}
