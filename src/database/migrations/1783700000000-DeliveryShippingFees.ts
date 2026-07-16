import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeliveryShippingFees1783700000000 implements MigrationInterface {
  name = 'DeliveryShippingFees1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "shippingFeeVnd" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "feeVnd" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_fees" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "providerId" uuid NOT NULL,
        "type" character varying NOT NULL,
        "feeVnd" integer NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_fees" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_delivery_fees_provider_type" UNIQUE ("providerId", "type")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "delivery_fees"
        ADD CONSTRAINT "FK_delivery_fees_provider"
        FOREIGN KEY ("providerId") REFERENCES "delivery_providers"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Seed default fees for every existing provider × delivery type.
    await queryRunner.query(`
      INSERT INTO "delivery_fees" ("providerId", "type", "feeVnd", "isActive")
      SELECT p."id", t."type", t."feeVnd", true
      FROM "delivery_providers" p
      CROSS JOIN (
        VALUES
          ('STANDARD', 30000),
          ('EXPRESS', 50000),
          ('SAME_DAY', 80000)
      ) AS t("type", "feeVnd")
      ON CONFLICT ("providerId", "type") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_fees"`);
    await queryRunner.query(`
      ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "feeVnd"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN IF EXISTS "shippingFeeVnd"
    `);
  }
}
