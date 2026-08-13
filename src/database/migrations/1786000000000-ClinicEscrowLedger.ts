import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicEscrowLedger1786000000000 implements MigrationInterface {
  name = 'ClinicEscrowLedger1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- clinics: bank account ---
    await queryRunner.query(`
      ALTER TABLE "clinics"
      ADD COLUMN IF NOT EXISTS "bankName" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "clinics"
      ADD COLUMN IF NOT EXISTS "bankAccountNumber" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "clinics"
      ADD COLUMN IF NOT EXISTS "bankAccountHolder" character varying
    `);

    // --- transactions: ledger accounts + clinic scoping ---
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "fromAccount" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "toAccount" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "treatmentPhaseId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "clinicId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "expertId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "escrowHoldId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "withdrawalId" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_clinicId"
      ON "transactions" ("clinicId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_transactions_externalRef"
      ON "transactions" ("externalRef")
      WHERE "externalRef" IS NOT NULL
    `);

    await this.addFk(
      queryRunner,
      'transactions',
      'FK_transactions_treatmentPhase',
      '("treatmentPhaseId") REFERENCES "treatment_phases"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'transactions',
      'FK_transactions_clinic',
      '("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'transactions',
      'FK_transactions_expert',
      '("expertId") REFERENCES "experts"("id") ON DELETE SET NULL',
    );

    // --- clinic_wallets ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clinic_wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clinicId" uuid NOT NULL,
        "balanceVnd" bigint NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clinic_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_clinic_wallets_clinicId" UNIQUE ("clinicId")
      )
    `);
    await this.addFk(
      queryRunner,
      'clinic_wallets',
      'FK_clinic_wallets_clinic',
      '("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE',
    );

    // Backfill a wallet for every existing clinic
    await queryRunner.query(`
      INSERT INTO "clinic_wallets" ("clinicId", "balanceVnd", "isActive")
      SELECT c."id", 0, true
      FROM "clinics" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "clinic_wallets" w WHERE w."clinicId" = c."id"
      )
    `);

    // --- escrow_holds ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "escrow_holds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sourceType" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'HELD',
        "amountVnd" bigint NOT NULL,
        "commissionRatePct" numeric(5,2) NOT NULL,
        "netVnd" bigint,
        "commissionVnd" bigint,
        "clinicId" uuid NOT NULL,
        "expertId" uuid NOT NULL,
        "customerUserId" uuid NOT NULL,
        "consultationId" uuid,
        "treatmentId" uuid,
        "treatmentPhaseId" uuid,
        "holdTransactionId" uuid,
        "releaseTransactionId" uuid,
        "commissionTransactionId" uuid,
        "refundTransactionId" uuid,
        "releasedAt" TIMESTAMPTZ,
        "refundedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_escrow_holds" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_escrow_holds_consultationId"
      ON "escrow_holds" ("consultationId")
      WHERE "consultationId" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_escrow_holds_treatmentPhaseId"
      ON "escrow_holds" ("treatmentPhaseId")
      WHERE "treatmentPhaseId" IS NOT NULL
    `);
    await this.addFk(
      queryRunner,
      'escrow_holds',
      'FK_escrow_holds_clinic',
      '("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'escrow_holds',
      'FK_escrow_holds_expert',
      '("expertId") REFERENCES "experts"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'escrow_holds',
      'FK_escrow_holds_customerUser',
      '("customerUserId") REFERENCES "users"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'escrow_holds',
      'FK_escrow_holds_consultation',
      '("consultationId") REFERENCES "consultation_requests"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'escrow_holds',
      'FK_escrow_holds_treatment',
      '("treatmentId") REFERENCES "treatments"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'escrow_holds',
      'FK_escrow_holds_treatmentPhase',
      '("treatmentPhaseId") REFERENCES "treatment_phases"("id") ON DELETE SET NULL',
    );

    // --- clinic_withdrawals ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clinic_withdrawals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clinicId" uuid NOT NULL,
        "amountVnd" bigint NOT NULL,
        "status" character varying NOT NULL DEFAULT 'REQUESTED',
        "requestedByUserId" uuid NOT NULL,
        "bankName" character varying NOT NULL,
        "bankAccountNumber" character varying NOT NULL,
        "bankAccountHolder" character varying NOT NULL,
        "processedByUserId" uuid,
        "processedAt" TIMESTAMPTZ,
        "transferRef" character varying,
        "staffNote" text,
        "debitTransactionId" uuid,
        "refundTransactionId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clinic_withdrawals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_clinic_withdrawals_clinicId_status"
      ON "clinic_withdrawals" ("clinicId", "status")
    `);
    await this.addFk(
      queryRunner,
      'clinic_withdrawals',
      'FK_clinic_withdrawals_clinic',
      '("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'clinic_withdrawals',
      'FK_clinic_withdrawals_requestedBy',
      '("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'clinic_withdrawals',
      'FK_clinic_withdrawals_processedBy',
      '("processedByUserId") REFERENCES "users"("id") ON DELETE SET NULL',
    );

    // Seed platform commission setting
    await queryRunner.query(`
      INSERT INTO "commerce_settings" ("key", "value", "updatedByUserId")
      VALUES ('PLATFORM_COMMISSION_PCT', '10', NULL)
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "commerce_settings" WHERE "key" = 'PLATFORM_COMMISSION_PCT'`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "clinic_withdrawals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "escrow_holds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clinic_wallets"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_transactions_externalRef"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_clinicId"`);

    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP CONSTRAINT IF EXISTS "FK_transactions_expert"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP CONSTRAINT IF EXISTS "FK_transactions_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP CONSTRAINT IF EXISTS "FK_transactions_treatmentPhase"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "withdrawalId"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "escrowHoldId"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "expertId"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "clinicId"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "treatmentPhaseId"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "toAccount"
    `);
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "fromAccount"
    `);

    await queryRunner.query(`
      ALTER TABLE "clinics" DROP COLUMN IF EXISTS "bankAccountHolder"
    `);
    await queryRunner.query(`
      ALTER TABLE "clinics" DROP COLUMN IF EXISTS "bankAccountNumber"
    `);
    await queryRunner.query(`
      ALTER TABLE "clinics" DROP COLUMN IF EXISTS "bankName"
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
