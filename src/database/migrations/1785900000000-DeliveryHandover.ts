import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeliveryHandover1785900000000 implements MigrationInterface {
  name = 'DeliveryHandover1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "handedOverAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "handedOverByUserId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "handoverNote" text
    `);

    await this.addFk(
      queryRunner,
      'deliveries',
      'FK_deliveries_handedOverBy',
      '("handedOverByUserId") REFERENCES "users"("id") ON DELETE SET NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      DROP CONSTRAINT IF EXISTS "FK_deliveries_handedOverBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "handoverNote"
    `);
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "handedOverByUserId"
    `);
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "handedOverAt"
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
