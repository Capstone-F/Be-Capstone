import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuestionBankAndRankedRecommendations1783800000000 implements MigrationInterface {
  name = 'QuestionBankAndRankedRecommendations1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "questions"
      ADD COLUMN IF NOT EXISTS "priority" character varying NOT NULL DEFAULT 'CORE',
      ADD COLUMN IF NOT EXISTS "category" character varying NOT NULL DEFAULT 'GENERAL',
      ADD COLUMN IF NOT EXISTS "askWhen" jsonb,
      ADD COLUMN IF NOT EXISTS "intent" character varying
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "question_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "questionId" uuid NOT NULL,
        "labelId" uuid NOT NULL,
        "displayOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_question_options" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_question_options_question_label"
          UNIQUE ("questionId", "labelId"),
        CONSTRAINT "FK_question_options_question"
          FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_question_options_label"
          FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "survey_recommendation_items"
      ADD COLUMN IF NOT EXISTS "rankedVariants" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "survey_recommendation_items"
      DROP COLUMN IF EXISTS "rankedVariants"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "question_options"`);
    await queryRunner.query(`
      ALTER TABLE "questions"
      DROP COLUMN IF EXISTS "intent",
      DROP COLUMN IF EXISTS "askWhen",
      DROP COLUMN IF EXISTS "category",
      DROP COLUMN IF EXISTS "priority"
    `);
  }
}
