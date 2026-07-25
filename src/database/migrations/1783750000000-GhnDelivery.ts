import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the delivery skeleton usable by GHN:
 *  - product_variants.weightGram   — GHN fee needs parcel weight
 *  - orders.shippingFeeVnd         — fee is quoted at checkout and charged via VNPay
 *  - deliveries.*                  — structured GHN address + provider tracking fields
 *  - delivery_status_events        — append-only webhook audit
 */
export class GhnDelivery1783750000000 implements MigrationInterface {
  name = 'GhnDelivery1783750000000';

  private static readonly DELIVERY_COLUMNS = [
    ['recipientName', 'character varying'],
    ['recipientPhone', 'character varying'],
    ['provinceId', 'integer'],
    ['districtId', 'integer'],
    ['wardCode', 'character varying'],
    ['streetAddress', 'text'],
    ['providerOrderCode', 'character varying'],
    ['providerStatus', 'character varying'],
    ['shippingFeeVnd', 'integer NOT NULL DEFAULT 0'],
    ['expectedDeliveryTime', 'TIMESTAMP WITH TIME ZONE'],
    ['lastStatusAt', 'TIMESTAMP WITH TIME ZONE'],
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "weightGram" integer NOT NULL DEFAULT 200`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shippingFeeVnd" integer NOT NULL DEFAULT 0`,
    );

    for (const [
      name,
      definition,
    ] of GhnDelivery1783750000000.DELIVERY_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "${name}" ${definition}`,
      );
    }

    // Partial: providerOrderCode is null between order creation and payment, and
    // uniqueness only means anything once GHN has issued a code.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_deliveries_provider_order_code" ON "deliveries" ("providerOrderCode") WHERE "providerOrderCode" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_deliveries_status" ON "deliveries" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_status_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "deliveryId" uuid NOT NULL,
        "providerStatus" character varying NOT NULL,
        "mappedStatus" character varying,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "applied" boolean NOT NULL DEFAULT false,
        "rawWebhook" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_status_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_delivery_status_events_delivery" ON "delivery_status_events" ("deliveryId")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = '"delivery_status_events"'::regclass
            AND confrelid = '"deliveries"'::regclass
            AND contype = 'f'
        ) THEN
          ALTER TABLE "delivery_status_events"
          ADD CONSTRAINT "FK_delivery_status_events_delivery"
          FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_status_events"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_deliveries_provider_order_code"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deliveries_status"`);

    for (const [name] of GhnDelivery1783750000000.DELIVERY_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "${name}"`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "shippingFeeVnd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "weightGram"`,
    );
  }
}
