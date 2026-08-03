import { MigrationInterface, QueryRunner } from 'typeorm';

export class SurveyFaceScan1785000000000 implements MigrationInterface {
  name = 'SurveyFaceScan1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_surveys"
      ADD COLUMN IF NOT EXISTS "faceImageUrl" character varying,
      ADD COLUMN IF NOT EXISTS "faceImageKey" character varying,
      ADD COLUMN IF NOT EXISTS "faceScannedAt" TIMESTAMP
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "survey_face_labels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "surveyId" uuid NOT NULL,
        "labelId" uuid NOT NULL,
        CONSTRAINT "PK_survey_face_labels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_survey_face_labels_survey_label" UNIQUE ("surveyId", "labelId"),
        CONSTRAINT "FK_survey_face_labels_survey"
          FOREIGN KEY ("surveyId") REFERENCES "customer_surveys"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_survey_face_labels_label"
          FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "survey_recommendation_items"
      ALTER COLUMN "matchScore" TYPE double precision
      USING "matchScore"::double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "survey_recommendation_items"
      ALTER COLUMN "matchScore" TYPE integer
      USING ROUND("matchScore")::integer
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "survey_face_labels"`);
    await queryRunner.query(`
      ALTER TABLE "customer_surveys"
      DROP COLUMN IF EXISTS "faceScannedAt",
      DROP COLUMN IF EXISTS "faceImageKey",
      DROP COLUMN IF EXISTS "faceImageUrl"
    `);
  }
}
