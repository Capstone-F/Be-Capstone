import { MigrationInterface, QueryRunner } from 'typeorm';

export class IngredientConflictDescription1785200000000 implements MigrationInterface {
  name = 'IngredientConflictDescription1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ingredient_conflicts"
      ADD COLUMN IF NOT EXISTS "description" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ingredient_conflicts"
      DROP COLUMN IF EXISTS "description"
    `);
  }
}
