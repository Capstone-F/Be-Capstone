import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoutineStepWaitAndDosage1784100000000 implements MigrationInterface {
  name = 'AddRoutineStepWaitAndDosage1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "routine_steps"
      ADD COLUMN IF NOT EXISTS "waitMinutes" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_steps"
      ADD COLUMN IF NOT EXISTS "dosageText" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "routine_steps"
      DROP COLUMN IF EXISTS "dosageText"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_steps"
      DROP COLUMN IF EXISTS "waitMinutes"
    `);
  }
}
