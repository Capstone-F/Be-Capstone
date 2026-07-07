import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpertAvailabilityAndSession1750600000000 implements MigrationInterface {
  name = 'ExpertAvailabilityAndSession1750600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "experts"
      ADD COLUMN IF NOT EXISTS "sessionLengthHours" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expert_availability" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "expertId" uuid NOT NULL,
        "dayOfWeek" integer NOT NULL,
        "startHour" integer NOT NULL,
        "endHour" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expert_availability" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expert_availability_expertId"
      ON "expert_availability" ("expertId")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "expert_availability"
        ADD CONSTRAINT "FK_expert_availability_expert"
        FOREIGN KEY ("expertId") REFERENCES "experts"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expert_availability"
      DROP CONSTRAINT IF EXISTS "FK_expert_availability_expert"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_expert_availability_expertId"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "expert_availability"
    `);
    await queryRunner.query(`
      ALTER TABLE "experts" DROP COLUMN IF EXISTS "sessionLengthHours"
    `);
  }
}
