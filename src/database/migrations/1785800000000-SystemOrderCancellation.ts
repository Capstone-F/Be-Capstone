import { MigrationInterface, QueryRunner } from 'typeorm';

export class SystemOrderCancellation1785800000000 implements MigrationInterface {
  name = 'SystemOrderCancellation1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_cancellations"
      ALTER COLUMN "requestedByUserId" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_cancellations"
      ALTER COLUMN "requestedByUserId" SET NOT NULL
    `);
  }
}
