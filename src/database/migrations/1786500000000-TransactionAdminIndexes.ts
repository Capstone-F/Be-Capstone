import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionAdminIndexes1786500000000 implements MigrationInterface {
  name = 'TransactionAdminIndexes1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supports GET /admin/transactions (platform-wide ledger, newest first).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_createdAt"
      ON "transactions" ("createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_clinicId_createdAt"
      ON "transactions" ("clinicId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_type_createdAt"
      ON "transactions" ("type", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_type_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_clinicId_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_createdAt"`,
    );
  }
}
