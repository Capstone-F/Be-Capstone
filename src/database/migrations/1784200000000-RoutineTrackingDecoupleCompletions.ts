import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoutineTrackingDecoupleCompletions1784200000000 implements MigrationInterface {
  name = 'RoutineTrackingDecoupleCompletions1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Completions were unused in app code; clear any orphan rows before reshape.
    await queryRunner.query(`DELETE FROM "routine_step_completions"`);

    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP CONSTRAINT IF EXISTS "FK_routine_step_completions_checkin"
    `);

    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "routineCheckInId"
    `);

    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "completed"
    `);

    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "routineId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "sessionDate" date
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "period" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "status" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "skipReason" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "skipNote" text
    `);

    // Table is empty after DELETE; enforce NOT NULL for core columns.
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ALTER COLUMN "routineId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ALTER COLUMN "sessionDate" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ALTER COLUMN "period" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ALTER COLUMN "status" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD CONSTRAINT "FK_routine_step_completions_routine"
      FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_routine_step_completions_step_date"
      ON "routine_step_completions" ("routineStepId", "sessionDate")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_routine_step_completions_routine_date_period"
      ON "routine_step_completions" ("routineId", "sessionDate", "period")
    `);

    await queryRunner.query(`
      ALTER TABLE "routine_check_ins"
      ADD COLUMN IF NOT EXISTS "period" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_check_ins"
      ADD COLUMN IF NOT EXISTS "overallMood" character varying
    `);

    // Existing check-ins (if any) get MORNING as a safe default before NOT NULL.
    await queryRunner.query(`
      UPDATE "routine_check_ins"
      SET "period" = 'MORNING'
      WHERE "period" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_check_ins"
      ALTER COLUMN "period" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_routine_check_ins_routine_date_period"
      ON "routine_check_ins" ("routineId", "checkInDate", "period")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_routine_check_ins_routine_date_period"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_check_ins"
      DROP COLUMN IF EXISTS "overallMood"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_check_ins"
      DROP COLUMN IF EXISTS "period"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_routine_step_completions_routine_date_period"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_routine_step_completions_step_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP CONSTRAINT IF EXISTS "FK_routine_step_completions_routine"
    `);

    await queryRunner.query(`DELETE FROM "routine_step_completions"`);

    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "skipNote"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "skipReason"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "status"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "period"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "sessionDate"
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      DROP COLUMN IF EXISTS "routineId"
    `);

    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "completed" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD COLUMN IF NOT EXISTS "routineCheckInId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ALTER COLUMN "routineCheckInId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "routine_step_completions"
      ADD CONSTRAINT "FK_routine_step_completions_checkin"
      FOREIGN KEY ("routineCheckInId") REFERENCES "routine_check_ins"("id") ON DELETE CASCADE
    `);
  }
}
