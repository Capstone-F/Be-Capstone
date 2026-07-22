import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRoutinesSourceOrderUnique1783900000000 implements MigrationInterface {
  name = 'DropRoutinesSourceOrderUnique1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_routines_source_order"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_routines_source_order"
      ON "routines" ("sourceOrderId")
      WHERE "sourceOrderId" IS NOT NULL
    `);
  }
}
