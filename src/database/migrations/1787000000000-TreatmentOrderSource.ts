import { MigrationInterface, QueryRunner } from 'typeorm';

export class TreatmentOrderSource1787000000000 implements MigrationInterface {
  name = 'TreatmentOrderSource1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // orders.source is a varchar column, so the new TREATMENT value needs no
    // type change — only the phase linkage column.
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "treatmentPhaseId" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_treatmentPhaseId"
        FOREIGN KEY ("treatmentPhaseId") REFERENCES "treatment_phases"("id")
        ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_treatmentPhaseId"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN IF EXISTS "treatmentPhaseId"
    `);
  }
}
