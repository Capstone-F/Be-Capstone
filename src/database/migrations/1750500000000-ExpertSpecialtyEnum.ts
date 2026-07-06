import { MigrationInterface, QueryRunner } from 'typeorm';

const ALLOWED_SPECIALTIES = [
  'DERMATOLOGY',
  'COSMETIC_DERMATOLOGY',
  'ACNE_TREATMENT',
  'ANTI_AGING',
  'PIGMENTATION',
  'LASER_THERAPY',
  'AESTHETIC_MEDICINE',
];

const DEFAULT_SPECIALTY = 'DERMATOLOGY';

export class ExpertSpecialtyEnum1750500000000 implements MigrationInterface {
  name = 'ExpertSpecialtyEnum1750500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const inList = ALLOWED_SPECIALTIES.map((s) => `'${s}'`).join(', ');

    // Backfill any free-text / null values that don't match the enum.
    await queryRunner.query(`
      UPDATE "experts"
      SET "specialization" = '${DEFAULT_SPECIALTY}'
      WHERE "specialization" IS NULL
        OR "specialization" NOT IN (${inList})
    `);

    await queryRunner.query(`
      ALTER TABLE "experts"
      ALTER COLUMN "specialization" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "experts"
      ALTER COLUMN "specialization" DROP NOT NULL
    `);
  }
}
