import { MigrationInterface, QueryRunner } from 'typeorm';

export class TreatmentSubmittedAt1784800000000 implements MigrationInterface {
  name = 'TreatmentSubmittedAt1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ
    `);

    // Backfill for already-paid plans only; unpaid drafts stay NULL (must re-submit).
    await queryRunner.query(`
      UPDATE "treatments"
      SET "submittedAt" = "paidAt"
      WHERE "paidAt" IS NOT NULL
        AND "submittedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "treatments"
      DROP COLUMN IF EXISTS "submittedAt"
    `);
  }
}
