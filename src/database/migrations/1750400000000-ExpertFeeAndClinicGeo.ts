import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpertFeeAndClinicGeo1750400000000 implements MigrationInterface {
  name = 'ExpertFeeAndClinicGeo1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "experts"
      ADD COLUMN IF NOT EXISTS "consultationFee" numeric(10,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "clinics"
      ADD COLUMN IF NOT EXISTS "latitude" numeric(9,6)
    `);

    await queryRunner.query(`
      ALTER TABLE "clinics"
      ADD COLUMN IF NOT EXISTS "longitude" numeric(9,6)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "experts" DROP COLUMN IF EXISTS "consultationFee"
    `);
    await queryRunner.query(`
      ALTER TABLE "clinics" DROP COLUMN IF EXISTS "latitude"
    `);
    await queryRunner.query(`
      ALTER TABLE "clinics" DROP COLUMN IF EXISTS "longitude"
    `);
  }
}
