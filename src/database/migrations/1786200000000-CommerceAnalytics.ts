import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommerceAnalytics1786200000000 implements MigrationInterface {
  name = 'CommerceAnalytics1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "analyticsSessionId" uuid
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commerce_analytics_events" (
        "id" uuid NOT NULL,
        "sessionId" uuid NOT NULL,
        "userId" uuid,
        "eventType" character varying NOT NULL,
        "source" character varying NOT NULL,
        "productId" uuid,
        "productVariantId" uuid,
        "orderId" uuid,
        "path" character varying(300),
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commerce_analytics_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commerce_analytics_session_occurred"
      ON "commerce_analytics_events" ("sessionId", "occurredAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commerce_analytics_type_occurred"
      ON "commerce_analytics_events" ("eventType", "occurredAt")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_commerce_analytics_purchase_order"
      ON "commerce_analytics_events" ("orderId")
      WHERE "eventType" = 'PURCHASE_COMPLETED' AND "orderId" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "commerce_analytics_events"
      ADD CONSTRAINT "FK_commerce_analytics_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "commerce_analytics_events"
      ADD CONSTRAINT "FK_commerce_analytics_order"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "commerce_analytics_events"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "analyticsSessionId"`,
    );
  }
}
