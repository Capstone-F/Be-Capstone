import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderStockShortfall1786400000000 implements MigrationInterface {
  name = 'OrderStockShortfall1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "stockShortfall" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "stockDeductedAt" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_items" DROP COLUMN IF EXISTS "stockDeductedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN IF EXISTS "stockShortfall"
    `);
  }
}
