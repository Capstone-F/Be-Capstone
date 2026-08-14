import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingAutoCancel1786300000000 implements MigrationInterface {
  name = 'BookingAutoCancel1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "autoCancelReason" character varying
    `);
    // The expiry sweep scans PENDING/CONFIRMED rows ordered by scheduledAt.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_consultation_requests_status_scheduledAt"
      ON "consultation_requests" ("status", "scheduledAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_consultation_requests_status_scheduledAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      DROP COLUMN IF EXISTS "autoCancelReason"
    `);
  }
}
