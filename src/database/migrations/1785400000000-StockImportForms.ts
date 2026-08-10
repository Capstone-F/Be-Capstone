import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockImportForms1785400000000 implements MigrationInterface {
  name = 'StockImportForms1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_import_forms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productVariantId" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "manufacturingDate" date NOT NULL,
        "batchCode" character varying,
        "status" character varying NOT NULL DEFAULT 'DRAFT',
        "createdByUserId" uuid NOT NULL,
        "submittedByUserId" uuid,
        "submittedAt" TIMESTAMPTZ,
        "confirmedByUserId" uuid,
        "confirmedAt" TIMESTAMPTZ,
        "cancelledByUserId" uuid,
        "cancelledAt" TIMESTAMPTZ,
        "rejectedByUserId" uuid,
        "rejectedAt" TIMESTAMPTZ,
        "rejectionReason" character varying,
        "stockBatchId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_import_forms" PRIMARY KEY ("id")
      )
    `);

    await this.addFk(
      queryRunner,
      'stock_import_forms',
      'FK_stock_import_forms_variant',
      '("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'stock_import_forms',
      'FK_stock_import_forms_batch',
      '("stockBatchId") REFERENCES "stock_batches"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_import_forms_status"
      ON "stock_import_forms" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_import_forms_productVariantId"
      ON "stock_import_forms" ("productVariantId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_import_forms_createdAt"
      ON "stock_import_forms" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_import_forms"`);
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
