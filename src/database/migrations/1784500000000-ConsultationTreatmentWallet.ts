import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsultationTreatmentWallet1784500000000 implements MigrationInterface {
  name = 'ConsultationTreatmentWallet1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- treatments ---
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "totalPriceVnd" bigint
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "paidTransactionId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments"
      ADD COLUMN IF NOT EXISTS "sourceConsultationId" uuid
    `);

    // --- treatment_phases ---
    await queryRunner.query(`
      ALTER TABLE "treatment_phases"
      ADD COLUMN IF NOT EXISTS "title" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "treatment_phases"
      ADD COLUMN IF NOT EXISTS "notes" text
    `);
    await queryRunner.query(`
      ALTER TABLE "treatment_phases"
      ADD COLUMN IF NOT EXISTS "priceVnd" bigint NOT NULL DEFAULT 0
    `);

    // --- consultation_requests ---
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "treatmentId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "feeChargedVnd" bigint
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "paidTransactionId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests"
      ADD COLUMN IF NOT EXISTS "isFollowUp" boolean NOT NULL DEFAULT false
    `);

    // --- transactions ---
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "treatmentId" uuid
    `);

    // --- payments: support wallet top-up ---
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_payments_order'
        ) THEN
          ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_order";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
      ALTER COLUMN "orderId" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "purpose" character varying NOT NULL DEFAULT 'ORDER'
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "userId" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_payments_order'
        ) THEN
          ALTER TABLE "payments"
          ADD CONSTRAINT "FK_payments_order"
          FOREIGN KEY ("orderId") REFERENCES "orders"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payments_user" ON "payments" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payments_purpose" ON "payments" ("purpose")
    `);

    // --- treatment_phase_ingredients ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "treatment_phase_ingredients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "treatmentPhaseId" uuid NOT NULL,
        "ingredientId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_treatment_phase_ingredients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_treatment_phase_ingredients_phase_ingredient"
          UNIQUE ("treatmentPhaseId", "ingredientId")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_treatment_phase_ingredients_phase'
        ) THEN
          ALTER TABLE "treatment_phase_ingredients"
          ADD CONSTRAINT "FK_treatment_phase_ingredients_phase"
          FOREIGN KEY ("treatmentPhaseId") REFERENCES "treatment_phases"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_treatment_phase_ingredients_ingredient'
        ) THEN
          ALTER TABLE "treatment_phase_ingredients"
          ADD CONSTRAINT "FK_treatment_phase_ingredients_ingredient"
          FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // --- treatment_phase_products ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "treatment_phase_products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "treatmentPhaseId" uuid NOT NULL,
        "productVariantId" uuid NOT NULL,
        "matchScore" double precision,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_treatment_phase_products" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_treatment_phase_products_phase_variant"
          UNIQUE ("treatmentPhaseId", "productVariantId")
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_treatment_phase_products_phase'
        ) THEN
          ALTER TABLE "treatment_phase_products"
          ADD CONSTRAINT "FK_treatment_phase_products_phase"
          FOREIGN KEY ("treatmentPhaseId") REFERENCES "treatment_phases"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_treatment_phase_products_variant'
        ) THEN
          ALTER TABLE "treatment_phase_products"
          ADD CONSTRAINT "FK_treatment_phase_products_variant"
          FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    // FKs for consultation/treatment links
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_consultation_requests_treatment'
        ) THEN
          ALTER TABLE "consultation_requests"
          ADD CONSTRAINT "FK_consultation_requests_treatment"
          FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_treatments_source_consultation'
        ) THEN
          ALTER TABLE "treatments"
          ADD CONSTRAINT "FK_treatments_source_consultation"
          FOREIGN KEY ("sourceConsultationId") REFERENCES "consultation_requests"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_transactions_treatment'
        ) THEN
          ALTER TABLE "transactions"
          ADD CONSTRAINT "FK_transactions_treatment"
          FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_treatment"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments" DROP CONSTRAINT IF EXISTS "FK_treatments_source_consultation"
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests" DROP CONSTRAINT IF EXISTS "FK_consultation_requests_treatment"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "treatment_phase_products"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "treatment_phase_ingredients"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_purpose"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_user"`);
    await queryRunner.query(`
      ALTER TABLE "payments" DROP COLUMN IF EXISTS "userId"
    `);
    await queryRunner.query(`
      ALTER TABLE "payments" DROP COLUMN IF EXISTS "purpose"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "treatmentId"
    `);

    await queryRunner.query(`
      ALTER TABLE "consultation_requests" DROP COLUMN IF EXISTS "isFollowUp"
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests" DROP COLUMN IF EXISTS "paidTransactionId"
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests" DROP COLUMN IF EXISTS "feeChargedVnd"
    `);
    await queryRunner.query(`
      ALTER TABLE "consultation_requests" DROP COLUMN IF EXISTS "treatmentId"
    `);

    await queryRunner.query(`
      ALTER TABLE "treatment_phases" DROP COLUMN IF EXISTS "priceVnd"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatment_phases" DROP COLUMN IF EXISTS "notes"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatment_phases" DROP COLUMN IF EXISTS "title"
    `);

    await queryRunner.query(`
      ALTER TABLE "treatments" DROP COLUMN IF EXISTS "sourceConsultationId"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments" DROP COLUMN IF EXISTS "paidTransactionId"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments" DROP COLUMN IF EXISTS "paidAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "treatments" DROP COLUMN IF EXISTS "totalPriceVnd"
    `);
  }
}
