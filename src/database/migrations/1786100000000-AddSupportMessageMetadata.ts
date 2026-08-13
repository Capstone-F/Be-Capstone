import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupportMessageMetadata1786100000000 implements MigrationInterface {
  name = 'AddSupportMessageMetadata1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_messages" ADD "metadata" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_messages" DROP COLUMN "metadata"`,
    );
  }
}
