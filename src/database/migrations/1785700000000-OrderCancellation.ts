import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderCancellation1785700000000 implements MigrationInterface {
  name = 'OrderCancellation1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_cancellations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'REQUESTED',
        "requestedByUserId" uuid NOT NULL,
        "requestedByActor" character varying NOT NULL,
        "reason" text,
        "orderStatusAtRequest" character varying NOT NULL,
        "refundAmountVnd" bigint NOT NULL,
        "refundTransactionId" uuid,
        "refundedAt" TIMESTAMPTZ,
        "requiresStockReturn" boolean NOT NULL DEFAULT false,
        "restockConfirmedByUserId" uuid,
        "restockConfirmedAt" TIMESTAMPTZ,
        "nextRunAt" TIMESTAMPTZ NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "lastError" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_cancellations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_cancellations_orderId" UNIQUE ("orderId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_cancellation_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderCancellationId" uuid NOT NULL,
        "orderItemId" uuid NOT NULL,
        "expectedQuantity" integer NOT NULL,
        "goodQuantity" integer,
        "damagedQuantity" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_cancellation_items" PRIMARY KEY ("id")
      )
    `);

    await this.addFk(
      queryRunner,
      'order_cancellations',
      'FK_order_cancellations_order',
      '("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'order_cancellations',
      'FK_order_cancellations_requestedBy',
      '("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'order_cancellations',
      'FK_order_cancellations_restockBy',
      '("restockConfirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'order_cancellation_items',
      'FK_order_cancellation_items_cancellation',
      '("orderCancellationId") REFERENCES "order_cancellations"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'order_cancellation_items',
      'FK_order_cancellation_items_orderItem',
      '("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT',
    );

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_cancellations_status_nextRunAt"
      ON "order_cancellations" ("status", "nextRunAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_cancellation_items_cancellationId"
      ON "order_cancellation_items" ("orderCancellationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_cancellation_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_cancellations"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "cancelledAt"
    `);
  }

  private async addFk(
    queryRunner: QueryRunner,
    table: string,
    constraintName: string,
    definition: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "${table}"
        ADD CONSTRAINT "${constraintName}"
        FOREIGN KEY ${definition};
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
}
