import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerAllergies1750700000000 implements MigrationInterface {
  name = 'CustomerAllergies1750700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_allergies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "labelId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_allergies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_allergies_customer_label" UNIQUE ("customerId", "labelId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_allergies_customerId"
      ON "customer_allergies" ("customerId")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "customer_allergies"
        ADD CONSTRAINT "FK_customer_allergies_customer"
        FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "customer_allergies"
        ADD CONSTRAINT "FK_customer_allergies_label"
        FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_allergies"
      DROP CONSTRAINT IF EXISTS "FK_customer_allergies_label"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_allergies"
      DROP CONSTRAINT IF EXISTS "FK_customer_allergies_customer"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_allergies_customerId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_allergies"`);
  }
}
