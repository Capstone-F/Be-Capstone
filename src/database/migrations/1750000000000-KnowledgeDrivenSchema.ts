import { MigrationInterface, QueryRunner } from 'typeorm';

export class KnowledgeDrivenSchema1750000000000 implements MigrationInterface {
  name = 'KnowledgeDrivenSchema1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Identity ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "phone" character varying,
        "avatarUrl" character varying,
        "dateOfBirth" date,
        "gender" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customers_userId" UNIQUE ("userId")
      )
    `);
    await this.addFk(
      queryRunner,
      'customers',
      'FK_customers_user',
      '("userId") REFERENCES "users"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "experts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "clinicId" uuid,
        "specialization" character varying,
        "licenseNumber" character varying,
        "bio" text,
        "rating" numeric(3,2) NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_experts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_experts_userId" UNIQUE ("userId")
      )
    `);
    await this.addFk(
      queryRunner,
      'experts',
      'FK_experts_user',
      '("userId") REFERENCES "users"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'experts',
      'FK_experts_clinic',
      '("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "balanceVnd" bigint NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_userId" UNIQUE ("userId")
      )
    `);
    await this.addFk(
      queryRunner,
      'wallets',
      'FK_wallets_user',
      '("userId") REFERENCES "users"("id") ON DELETE CASCADE',
    );

    // --- Survey ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "label_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_label_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_label_categories_code" ON "label_categories" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "labels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "categoryId" uuid NOT NULL,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_labels" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_labels_code" ON "labels" ("code")`,
    );
    await this.addFk(
      queryRunner,
      'labels',
      'FK_labels_category',
      '("categoryId") REFERENCES "label_categories"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skin_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skin_types" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_skin_types_code" ON "skin_types" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_surveys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "skinTypeId" uuid,
        "isCompleted" boolean NOT NULL DEFAULT false,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_surveys" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'customer_surveys',
      'FK_customer_surveys_customer',
      '("customerId") REFERENCES "customers"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "text" character varying NOT NULL,
        "questionType" character varying,
        "displayOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_questions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_questions_code" ON "questions" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "answers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "surveyId" uuid NOT NULL,
        "questionId" uuid NOT NULL,
        "value" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_answers" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'answers',
      'FK_answers_survey',
      '("surveyId") REFERENCES "customer_surveys"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'answers',
      'FK_answers_question',
      '("questionId") REFERENCES "questions"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "answer_labels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "answerId" uuid NOT NULL,
        "labelId" uuid NOT NULL,
        CONSTRAINT "PK_answer_labels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_answer_labels_answer_label" UNIQUE ("answerId", "labelId")
      )
    `);
    await this.addFk(
      queryRunner,
      'answer_labels',
      'FK_answer_labels_answer',
      '("answerId") REFERENCES "answers"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'answer_labels',
      'FK_answer_labels_label',
      '("labelId") REFERENCES "labels"("id") ON DELETE CASCADE',
    );

    // --- Knowledge ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ingredient_protocols" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ingredientId" uuid NOT NULL,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "concentrationPct" numeric(5,2),
        "frequency" character varying,
        "timeOfUse" character varying,
        "conditions" text,
        "instructions" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ingredient_protocols" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ingredient_protocols_code" ON "ingredient_protocols" ("code")`,
    );
    await this.addFk(
      queryRunner,
      'ingredient_protocols',
      'FK_ingredient_protocols_ingredient',
      '("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "protocol_labels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "protocolId" uuid NOT NULL,
        "labelId" uuid NOT NULL,
        CONSTRAINT "PK_protocol_labels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_protocol_labels_protocol_label" UNIQUE ("protocolId", "labelId")
      )
    `);
    await this.addFk(
      queryRunner,
      'protocol_labels',
      'FK_protocol_labels_protocol',
      '("protocolId") REFERENCES "ingredient_protocols"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'protocol_labels',
      'FK_protocol_labels_label',
      '("labelId") REFERENCES "labels"("id") ON DELETE CASCADE',
    );

    // Refactor ingredient_conflicts to protocol-based
    await queryRunner.query(
      `ALTER TABLE "ingredient_conflicts" DROP CONSTRAINT IF EXISTS "FK_ingredient_conflicts_a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingredient_conflicts" DROP CONSTRAINT IF EXISTS "FK_ingredient_conflicts_b"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ingredient_conflicts"`);
    await queryRunner.query(`
      CREATE TABLE "ingredient_conflicts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "protocolId" uuid NOT NULL,
        "conflictingProtocolId" uuid NOT NULL,
        "severity" character varying NOT NULL,
        "reason" character varying,
        CONSTRAINT "PK_ingredient_conflicts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ingredient_conflicts_pair" UNIQUE ("protocolId", "conflictingProtocolId")
      )
    `);
    await this.addFk(
      queryRunner,
      'ingredient_conflicts',
      'FK_ingredient_conflicts_protocol',
      '("protocolId") REFERENCES "ingredient_protocols"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'ingredient_conflicts',
      'FK_ingredient_conflicts_conflicting',
      '("conflictingProtocolId") REFERENCES "ingredient_protocols"("id") ON DELETE CASCADE',
    );

    // Drop legacy treatment goal tables
    await queryRunner.query(
      `ALTER TABLE "goal_ingredients" DROP CONSTRAINT IF EXISTS "FK_goal_ingredients_ingredient"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goal_ingredients" DROP CONSTRAINT IF EXISTS "FK_goal_ingredients_goal"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "goal_ingredients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "treatment_goals"`);

    // --- Products refactor ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_brands" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "logoUrl" character varying,
        "description" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_brands" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_brands_name" ON "product_brands" ("name")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_categories_code" ON "product_categories" ("code")`,
    );

    await queryRunner.query(`
      INSERT INTO "product_categories" ("code", "name")
      VALUES
        ('CLEANSER', 'Cleanser'),
        ('TONER', 'Toner'),
        ('SERUM', 'Serum'),
        ('MOISTURIZER', 'Moisturizer'),
        ('SUNSCREEN', 'Sunscreen'),
        ('TREATMENT', 'Treatment')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "product_brands" ("name")
      SELECT DISTINCT COALESCE("brand", 'Unknown') FROM "products"
      WHERE NOT EXISTS (
        SELECT 1 FROM "product_brands" pb WHERE pb."name" = COALESCE("products"."brand", 'Unknown')
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brandId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "categoryId" uuid
    `);

    await queryRunner.query(`
      UPDATE "products" p SET "brandId" = pb."id"
      FROM "product_brands" pb
      WHERE pb."name" = COALESCE(p."brand", 'Unknown')
    `);
    await queryRunner.query(`
      UPDATE "products" p SET "categoryId" = pc."id"
      FROM "product_categories" pc
      WHERE pc."code" = COALESCE(p."category", 'TREATMENT')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "sku" character varying NOT NULL,
        "volume" character varying,
        "packaging" character varying,
        "priceVnd" integer NOT NULL,
        "shelfLifeValue" integer NOT NULL DEFAULT 365,
        "shelfLifeUnit" character varying NOT NULL DEFAULT 'DAY',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_variants" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_variants_sku" ON "product_variants" ("sku")`,
    );
    await this.addFk(
      queryRunner,
      'product_variants',
      'FK_product_variants_product',
      '("productId") REFERENCES "products"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      INSERT INTO "product_variants" ("productId", "sku", "priceVnd", "shelfLifeValue", "shelfLifeUnit")
      SELECT
        p."id",
        'SKU-' || LEFT(p."id"::text, 8),
        COALESCE(p."priceVnd", 0),
        COALESCE(p."shelfLifeValue", 365),
        COALESCE(p."shelfLifeUnit", 'DAY')
      FROM "products" p
      WHERE NOT EXISTS (
        SELECT 1 FROM "product_variants" pv WHERE pv."productId" = p."id"
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_protocols" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "protocolId" uuid NOT NULL,
        CONSTRAINT "PK_product_protocols" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_protocols_product_protocol" UNIQUE ("productId", "protocolId")
      )
    `);
    await this.addFk(
      queryRunner,
      'product_protocols',
      'FK_product_protocols_product',
      '("productId") REFERENCES "products"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'product_protocols',
      'FK_product_protocols_protocol',
      '("protocolId") REFERENCES "ingredient_protocols"("id") ON DELETE CASCADE',
    );

    // Stock batches: repoint to product variants
    await queryRunner.query(`
      ALTER TABLE "stock_batches" ADD COLUMN IF NOT EXISTS "productVariantId" uuid
    `);
    await queryRunner.query(`
      UPDATE "stock_batches" sb SET "productVariantId" = pv."id"
      FROM "product_variants" pv
      WHERE pv."productId" = sb."productId" AND sb."productVariantId" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "stock_batches" DROP CONSTRAINT IF EXISTS "FK_stock_batches_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_batches" DROP COLUMN IF EXISTS "productId"`,
    );
    await this.addFk(
      queryRunner,
      'stock_batches',
      'FK_stock_batches_variant',
      '("productVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE',
    );

    // Remap stock movement types
    await queryRunner.query(
      `UPDATE "stock_movements" SET "type" = 'IMPORT' WHERE "type" = 'IN'`,
    );
    await queryRunner.query(
      `UPDATE "stock_movements" SET "type" = 'SALE' WHERE "type" = 'OUT'`,
    );
    await queryRunner.query(
      `UPDATE "stock_movements" SET "type" = 'ADJUSTMENT' WHERE "type" = 'ADJUST'`,
    );

    // Drop old product columns
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_brand"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_category"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "brand"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "priceVnd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "stockQuantity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "shelfLifeValue"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "shelfLifeUnit"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_brand" ON "products" ("brandId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_category" ON "products" ("categoryId")`,
    );
    await this.addFk(
      queryRunner,
      'products',
      'FK_products_brand',
      '("brandId") REFERENCES "product_brands"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'products',
      'FK_products_category',
      '("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT',
    );

    // --- Treatments ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "treatments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "expertId" uuid NOT NULL,
        "clinicId" uuid,
        "title" character varying NOT NULL,
        "description" text,
        "status" character varying NOT NULL DEFAULT 'DRAFT',
        "startDate" date,
        "endDate" date,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_treatments" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'treatments',
      'FK_treatments_customer',
      '("customerId") REFERENCES "customers"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'treatments',
      'FK_treatments_expert',
      '("expertId") REFERENCES "experts"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'treatments',
      'FK_treatments_clinic',
      '("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "treatment_phases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "treatmentId" uuid NOT NULL,
        "phaseType" character varying NOT NULL,
        "phaseOrder" integer NOT NULL DEFAULT 0,
        "goals" text,
        "achievements" text,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "startDate" date,
        "endDate" date,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_treatment_phases" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'treatment_phases',
      'FK_treatment_phases_treatment',
      '("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "treatment_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "treatmentId" uuid NOT NULL,
        "type" character varying NOT NULL,
        "title" character varying NOT NULL,
        "note" text,
        "photoUrl" character varying,
        "occurredAt" TIMESTAMP NOT NULL,
        "createdByExpertId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_treatment_events" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'treatment_events',
      'FK_treatment_events_treatment',
      '("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'treatment_events',
      'FK_treatment_events_expert',
      '("createdByExpertId") REFERENCES "experts"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "treatment_accesses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "treatmentId" uuid NOT NULL,
        "expertId" uuid NOT NULL,
        "clinicId" uuid,
        "status" character varying NOT NULL DEFAULT 'ACTIVE',
        "grantedAt" TIMESTAMP NOT NULL,
        "expiresAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_treatment_accesses" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'treatment_accesses',
      'FK_treatment_accesses_treatment',
      '("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'treatment_accesses',
      'FK_treatment_accesses_expert',
      '("expertId") REFERENCES "experts"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'treatment_accesses',
      'FK_treatment_accesses_clinic',
      '("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "locked_ingredients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "ingredientId" uuid NOT NULL,
        "lockedByExpertId" uuid NOT NULL,
        "reason" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "lockedAt" TIMESTAMP NOT NULL,
        "unlockedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_locked_ingredients" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'locked_ingredients',
      'FK_locked_ingredients_customer',
      '("customerId") REFERENCES "customers"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'locked_ingredients',
      'FK_locked_ingredients_ingredient',
      '("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'locked_ingredients',
      'FK_locked_ingredients_expert',
      '("lockedByExpertId") REFERENCES "experts"("id") ON DELETE RESTRICT',
    );

    // --- Routines ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "treatmentPhaseId" uuid,
        "createdByExpertId" uuid,
        "type" character varying NOT NULL,
        "title" character varying NOT NULL,
        "description" text,
        "status" character varying NOT NULL DEFAULT 'DRAFT',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routines" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'routines',
      'FK_routines_customer',
      '("customerId") REFERENCES "customers"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'routines',
      'FK_routines_phase',
      '("treatmentPhaseId") REFERENCES "treatment_phases"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'routines',
      'FK_routines_expert',
      '("createdByExpertId") REFERENCES "experts"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_steps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "period" character varying NOT NULL,
        "stepOrder" integer NOT NULL DEFAULT 0,
        "instructions" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routine_steps" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_steps',
      'FK_routine_steps_routine',
      '("routineId") REFERENCES "routines"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_step_protocols" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineStepId" uuid NOT NULL,
        "protocolId" uuid NOT NULL,
        "amountMl" numeric(8,2),
        CONSTRAINT "PK_routine_step_protocols" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_routine_step_protocols_step_protocol" UNIQUE ("routineStepId", "protocolId")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_step_protocols',
      'FK_routine_step_protocols_step',
      '("routineStepId") REFERENCES "routine_steps"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'routine_step_protocols',
      'FK_routine_step_protocols_protocol',
      '("protocolId") REFERENCES "ingredient_protocols"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_step_details" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineStepId" uuid NOT NULL,
        "productVariantId" uuid NOT NULL,
        "amountMl" numeric(8,2),
        "date" date,
        "period" character varying,
        "progressNote" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routine_step_details" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_step_details',
      'FK_routine_step_details_step',
      '("routineStepId") REFERENCES "routine_steps"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'routine_step_details',
      'FK_routine_step_details_variant',
      '("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_check_ins" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineId" uuid NOT NULL,
        "checkInDate" date NOT NULL,
        "acneLevel" integer,
        "oilLevel" integer,
        "rednessLevel" integer,
        "moistureLevel" integer,
        "completionRate" numeric(5,2),
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routine_check_ins" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_check_ins',
      'FK_routine_check_ins_routine',
      '("routineId") REFERENCES "routines"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_step_completions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineCheckInId" uuid NOT NULL,
        "routineStepId" uuid NOT NULL,
        "completed" boolean NOT NULL DEFAULT false,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routine_step_completions" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_step_completions',
      'FK_routine_step_completions_checkin',
      '("routineCheckInId") REFERENCES "routine_check_ins"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'routine_step_completions',
      'FK_routine_step_completions_step',
      '("routineStepId") REFERENCES "routine_steps"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_side_effects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineCheckInId" uuid NOT NULL,
        "type" character varying NOT NULL,
        "severity" integer,
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routine_side_effects" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_side_effects',
      'FK_routine_side_effects_checkin',
      '("routineCheckInId") REFERENCES "routine_check_ins"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_habits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "type" character varying NOT NULL,
        "description" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_habits" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_support_habits_code" ON "support_habits" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_support_habits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineId" uuid NOT NULL,
        "supportHabitId" uuid NOT NULL,
        CONSTRAINT "PK_routine_support_habits" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_routine_support_habits_routine_habit" UNIQUE ("routineId", "supportHabitId")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_support_habits',
      'FK_routine_support_habits_routine',
      '("routineId") REFERENCES "routines"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'routine_support_habits',
      'FK_routine_support_habits_habit',
      '("supportHabitId") REFERENCES "support_habits"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "routine_endpoint_forecasts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "routineStepDetailsId" uuid NOT NULL,
        "purchasedVolumeMl" numeric(8,2) NOT NULL,
        "dailyUsageMl" numeric(8,2) NOT NULL,
        "forecastRunoutDate" date,
        "reorderAlertSent" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routine_endpoint_forecasts" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'routine_endpoint_forecasts',
      'FK_routine_endpoint_forecasts_details',
      '("routineStepDetailsId") REFERENCES "routine_step_details"("id") ON DELETE CASCADE',
    );

    // --- Consultations ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consultation_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "expertId" uuid NOT NULL,
        "reason" text,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "scheduledAt" TIMESTAMP,
        "startedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consultation_requests" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'consultation_requests',
      'FK_consultation_requests_customer',
      '("customerId") REFERENCES "customers"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'consultation_requests',
      'FK_consultation_requests_expert',
      '("expertId") REFERENCES "experts"("id") ON DELETE RESTRICT',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_histories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "consultationId" uuid NOT NULL,
        "senderId" uuid NOT NULL,
        "message" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_histories" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'chat_histories',
      'FK_chat_histories_consultation',
      '("consultationId") REFERENCES "consultation_requests"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'chat_histories',
      'FK_chat_histories_sender',
      '("senderId") REFERENCES "users"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feedbacks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "consultationId" uuid NOT NULL,
        "rating" integer NOT NULL,
        "comment" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feedbacks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_feedbacks_consultationId" UNIQUE ("consultationId")
      )
    `);
    await this.addFk(
      queryRunner,
      'feedbacks',
      'FK_feedbacks_consultation',
      '("consultationId") REFERENCES "consultation_requests"("id") ON DELETE CASCADE',
    );

    // --- Commerce ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "totalVnd" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'orders',
      'FK_orders_customer',
      '("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "productVariantId" uuid NOT NULL,
        "routineStepDetailsId" uuid,
        "quantity" integer NOT NULL,
        "unitPriceVnd" integer NOT NULL,
        "lineTotalVnd" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'order_items',
      'FK_order_items_order',
      '("orderId") REFERENCES "orders"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'order_items',
      'FK_order_items_variant',
      '("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT',
    );
    await this.addFk(
      queryRunner,
      'order_items',
      'FK_order_items_routine_details',
      '("routineStepDetailsId") REFERENCES "routine_step_details"("id") ON DELETE SET NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "amountVnd" bigint NOT NULL,
        "orderId" uuid,
        "consultationId" uuid,
        "userId" uuid,
        "externalRef" character varying,
        "note" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id")
      )
    `);
    await this.addFk(
      queryRunner,
      'transactions',
      'FK_transactions_order',
      '("orderId") REFERENCES "orders"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'transactions',
      'FK_transactions_consultation',
      '("consultationId") REFERENCES "consultation_requests"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'transactions',
      'FK_transactions_user',
      '("userId") REFERENCES "users"("id") ON DELETE SET NULL',
    );

    // --- Delivery ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_providers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_providers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_providers_code" ON "delivery_providers" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "type" character varying NOT NULL DEFAULT 'STANDARD',
        "providerId" uuid NOT NULL,
        "shippingAddress" text NOT NULL,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "trackingNumber" character varying,
        "shippedAt" TIMESTAMP,
        "deliveredAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_deliveries_orderId" UNIQUE ("orderId")
      )
    `);
    await this.addFk(
      queryRunner,
      'deliveries',
      'FK_deliveries_order',
      '("orderId") REFERENCES "orders"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'deliveries',
      'FK_deliveries_provider',
      '("providerId") REFERENCES "delivery_providers"("id") ON DELETE RESTRICT',
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
    // Drop in reverse dependency order
    const tables = [
      'deliveries',
      'delivery_providers',
      'transactions',
      'order_items',
      'orders',
      'feedbacks',
      'chat_histories',
      'consultation_requests',
      'routine_endpoint_forecasts',
      'routine_support_habits',
      'support_habits',
      'routine_side_effects',
      'routine_step_completions',
      'routine_check_ins',
      'routine_step_details',
      'routine_step_protocols',
      'routine_steps',
      'routines',
      'locked_ingredients',
      'treatment_accesses',
      'treatment_events',
      'treatment_phases',
      'treatments',
      'product_protocols',
      'product_variants',
      'product_categories',
      'product_brands',
      'protocol_labels',
      'ingredient_conflicts',
      'ingredient_protocols',
      'answer_labels',
      'answers',
      'questions',
      'customer_surveys',
      'skin_types',
      'labels',
      'label_categories',
      'wallets',
      'experts',
      'customers',
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }

    // Restore products legacy columns (best-effort)
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_brand"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand" character varying NOT NULL DEFAULT 'Unknown'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" character varying NOT NULL DEFAULT 'TREATMENT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "priceVnd" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stockQuantity" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shelfLifeValue" integer NOT NULL DEFAULT 365`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shelfLifeUnit" character varying NOT NULL DEFAULT 'DAY'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "brandId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "categoryId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "stock_batches" DROP CONSTRAINT IF EXISTS "FK_stock_batches_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_batches" ADD COLUMN IF NOT EXISTS "productId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_batches" DROP COLUMN IF EXISTS "productVariantId"`,
    );

    await queryRunner.query(
      `UPDATE "stock_movements" SET "type" = 'IN' WHERE "type" = 'IMPORT'`,
    );
    await queryRunner.query(
      `UPDATE "stock_movements" SET "type" = 'OUT' WHERE "type" = 'SALE'`,
    );
    await queryRunner.query(
      `UPDATE "stock_movements" SET "type" = 'ADJUST' WHERE "type" = 'ADJUSTMENT'`,
    );
  }
}
