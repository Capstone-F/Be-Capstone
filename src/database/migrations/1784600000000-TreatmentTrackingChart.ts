import { MigrationInterface, QueryRunner } from 'typeorm';

export class TreatmentTrackingChart1784600000000 implements MigrationInterface {
  name = 'TreatmentTrackingChart1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "treatment_phases"
      ADD COLUMN IF NOT EXISTS "note_by_expert" text
    `);

    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "cancelReason" text
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "cancelledBy" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "refundTransactionId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "refundedAmountVnd" bigint
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "treatments"
      DROP COLUMN IF EXISTS "refundedAmountVnd"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      DROP COLUMN IF EXISTS "refundTransactionId"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      DROP COLUMN IF EXISTS "cancelledBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      DROP COLUMN IF EXISTS "cancelReason"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      DROP COLUMN IF EXISTS "cancelledAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatment_phases"
      DROP COLUMN IF EXISTS "note_by_expert"
    `);
  }
}
