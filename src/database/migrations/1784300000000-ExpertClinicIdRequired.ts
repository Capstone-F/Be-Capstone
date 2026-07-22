import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_CLINIC_NAME = 'GlowScan District 1 Clinic';
const DEFAULT_CLINIC_ADDRESS = '12 Nguyen Hue, District 1, Ho Chi Minh City';
const DEFAULT_CLINIC_LAT = 10.7769;
const DEFAULT_CLINIC_LNG = 106.7009;

/**
 * Every expert must belong to a clinic:
 * - backfill null clinicId onto the default seed clinic
 * - make clinicId NOT NULL
 * - change FK from ON DELETE SET NULL to ON DELETE RESTRICT
 */
export class ExpertClinicIdRequired1784300000000 implements MigrationInterface {
  name = 'ExpertClinicIdRequired1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = (await queryRunner.query(
      `SELECT "id" FROM "clinics" WHERE "name" = $1 LIMIT 1`,
      [DEFAULT_CLINIC_NAME],
    )) as Array<{ id: string }>;

    let defaultClinicId: string;
    if (existing.length > 0) {
      defaultClinicId = existing[0].id;
    } else {
      const inserted = (await queryRunner.query(
        `
        INSERT INTO "clinics" ("name", "address", "latitude", "longitude", "isActive")
        VALUES ($1, $2, $3, $4, true)
        RETURNING "id"
        `,
        [
          DEFAULT_CLINIC_NAME,
          DEFAULT_CLINIC_ADDRESS,
          DEFAULT_CLINIC_LAT,
          DEFAULT_CLINIC_LNG,
        ],
      )) as Array<{ id: string }>;
      defaultClinicId = inserted[0].id;
    }

    await queryRunner.query(
      `
      UPDATE "experts"
      SET "clinicId" = $1
      WHERE "clinicId" IS NULL
      `,
      [defaultClinicId],
    );

    await queryRunner.query(`
      ALTER TABLE "experts"
      DROP CONSTRAINT IF EXISTS "FK_experts_clinic"
    `);

    await queryRunner.query(`
      ALTER TABLE "experts"
      ALTER COLUMN "clinicId" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "experts"
      ADD CONSTRAINT "FK_experts_clinic"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "experts"
      DROP CONSTRAINT IF EXISTS "FK_experts_clinic"
    `);

    await queryRunner.query(`
      ALTER TABLE "experts"
      ALTER COLUMN "clinicId" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "experts"
      ADD CONSTRAINT "FK_experts_clinic"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL
    `);
  }
}
