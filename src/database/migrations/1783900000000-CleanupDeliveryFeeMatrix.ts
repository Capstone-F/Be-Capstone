import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes the fixed-fee-matrix delivery design (`DeliveryShippingFees1783700000000`),
 * superseded by the GHN integration (`GhnDelivery1783750000000`): fees are now quoted
 * live from GHN and stored on `deliveries.shippingFeeVnd`, not looked up from a
 * provider/type matrix. `delivery_providers` stays — GHN is still recorded as a provider.
 */
export class CleanupDeliveryFeeMatrix1783900000000 implements MigrationInterface {
  name = 'CleanupDeliveryFeeMatrix1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_fees"`);
    await queryRunner.query(`
      ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "feeVnd"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
