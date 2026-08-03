import { MigrationInterface, QueryRunner } from 'typeorm';

export class SurveyComboMinSubtotal1784900000000 implements MigrationInterface {
  name = 'SurveyComboMinSubtotal1784900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "commerce_settings" ("key", "value")
      VALUES ('SURVEY_COMBO_MIN_SUBTOTAL_VND', '300000')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "commerce_settings"
      WHERE "key" = 'SURVEY_COMBO_MIN_SUBTOTAL_VND'
    `);
  }
}
