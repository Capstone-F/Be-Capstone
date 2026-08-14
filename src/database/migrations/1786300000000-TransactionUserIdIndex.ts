import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionUserIdIndex1786300000000 implements MigrationInterface {
  name = 'TransactionUserIdIndex1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supports GET /wallet/me/transactions (customer wallet statement).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_userId"
      ON "transactions" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_userId"`);
  }
}
