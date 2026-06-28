import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaumannSkinTyping1750100000000 implements MigrationInterface {
  name = 'BaumannSkinTyping1750100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skin_types" ADD COLUMN IF NOT EXISTS "oilyDry" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "skin_types" ADD COLUMN IF NOT EXISTS "sensitiveResistant" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "skin_types" ADD COLUMN IF NOT EXISTS "pigmentedNonPigmented" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "skin_types" ADD COLUMN IF NOT EXISTS "wrinkledTight" character varying`,
    );

    await queryRunner.query(
      `ALTER TABLE "customer_surveys" DROP COLUMN IF EXISTS "skinTypeId"`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_skin_type_details" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "skinTypeId" uuid,
        "oilyDryScore" integer,
        "sensitiveResistantScore" integer,
        "pigmentedNonPigmentedScore" integer,
        "wrinkledTightScore" integer,
        "assessedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_skin_type_details" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_skin_type_details_customerId" UNIQUE ("customerId")
      )
    `);
    await this.addFk(
      queryRunner,
      'customer_skin_type_details',
      'FK_customer_skin_type_details_customer',
      '("customerId") REFERENCES "customers"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'customer_skin_type_details',
      'FK_customer_skin_type_details_skin_type',
      '("skinTypeId") REFERENCES "skin_types"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "protocol_skin_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "protocolId" uuid NOT NULL,
        "skinTypeId" uuid NOT NULL,
        "recommendation" character varying NOT NULL,
        CONSTRAINT "PK_protocol_skin_types" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_protocol_skin_types" UNIQUE ("protocolId", "skinTypeId")
      )
    `);
    await this.addFk(
      queryRunner,
      'protocol_skin_types',
      'FK_protocol_skin_types_protocol',
      '("protocolId") REFERENCES "ingredient_protocols"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'protocol_skin_types',
      'FK_protocol_skin_types_skin_type',
      '("skinTypeId") REFERENCES "skin_types"("id") ON DELETE CASCADE',
    );
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "protocol_skin_types" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "customer_skin_type_details" CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "skin_types" DROP COLUMN IF EXISTS "oilyDry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skin_types" DROP COLUMN IF EXISTS "sensitiveResistant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skin_types" DROP COLUMN IF EXISTS "pigmentedNonPigmented"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skin_types" DROP COLUMN IF EXISTS "wrinkledTight"`,
    );

    await queryRunner.query(
      `ALTER TABLE "customer_surveys" ADD COLUMN IF NOT EXISTS "skinTypeId" uuid`,
    );
  }
}
