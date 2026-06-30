import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductInstances1750300000000 implements MigrationInterface {
  name = 'ProductInstances1750300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_instances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "stockBatchId" uuid NOT NULL,
        "orderItemId" uuid,
        "routineStepDetailsId" uuid,
        "serialNumber" character varying,
        "status" character varying NOT NULL DEFAULT 'ON_RACK',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_instances" PRIMARY KEY ("id")
      )
    `);

    await this.addFk(
      queryRunner,
      'product_instances',
      'FK_product_instances_batch',
      '("stockBatchId") REFERENCES "stock_batches"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'product_instances',
      'FK_product_instances_order_item',
      '("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'product_instances',
      'FK_product_instances_routine_step_details',
      '("routineStepDetailsId") REFERENCES "routine_step_details"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_instances_stockBatchId"
      ON "product_instances" ("stockBatchId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_instances_orderItemId"
      ON "product_instances" ("orderItemId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_instances_routineStepDetailsId"
      ON "product_instances" ("routineStepDetailsId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_instances_status"
      ON "product_instances" ("status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_instances_serialNumber"
      ON "product_instances" ("serialNumber")
      WHERE "serialNumber" IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "product_instances" ("stockBatchId", "status")
      SELECT sb."id", 'ON_RACK'
      FROM "stock_batches" sb
      CROSS JOIN LATERAL generate_series(1, sb."remainingQuantity")
      WHERE sb."remainingQuantity" > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_instances"`);
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
