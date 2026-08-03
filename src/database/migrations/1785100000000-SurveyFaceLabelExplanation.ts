import { MigrationInterface, QueryRunner } from 'typeorm';

export class SurveyFaceLabelExplanation1785100000000 implements MigrationInterface {
  name = 'SurveyFaceLabelExplanation1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "survey_face_labels"
      ADD COLUMN IF NOT EXISTS "explanation" character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "survey_face_labels"
      DROP COLUMN IF EXISTS "explanation"
    `);
  }
}
