import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingCancelFields1784400000000 implements MigrationInterface {
  name = 'BookingCancelFields1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "cancelReason" text
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "cancelledBy" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      DROP COLUMN IF EXISTS "cancelledBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      DROP COLUMN IF EXISTS "cancelReason"
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      DROP COLUMN IF EXISTS "cancelledAt"
    `);
  }
}
