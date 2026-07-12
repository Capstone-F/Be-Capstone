import { MigrationInterface, QueryRunner } from 'typeorm';

export class SurveyPurchaseRoutineFlow1783600000000 implements MigrationInterface {
  name = 'SurveyPurchaseRoutineFlow1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commerce_settings" (
        "key" character varying NOT NULL,
        "value" character varying NOT NULL,
        "updatedByUserId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commerce_settings" PRIMARY KEY ("key")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "commerce_settings" ("key", "value")
      VALUES ('SURVEY_COMBO_DISCOUNT_PCT', '10')
      ON CONFLICT ("key") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "survey_recommendations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerId" uuid NOT NULL,
        "customerSurveyId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_survey_recommendations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_survey_recommendations_survey" UNIQUE ("customerSurveyId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_survey_recommendations_customer"
      ON "survey_recommendations" ("customerId")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "survey_recommendations"
        ADD CONSTRAINT "FK_survey_recommendations_customer"
        FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "survey_recommendations"
        ADD CONSTRAINT "FK_survey_recommendations_survey"
        FOREIGN KEY ("customerSurveyId") REFERENCES "customer_surveys"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "survey_recommendation_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "recommendationId" uuid NOT NULL,
        "protocolId" uuid NOT NULL,
        "productVariantId" uuid NOT NULL,
        "matchScore" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_survey_recommendation_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_survey_recommendation_items_rec_protocol"
          UNIQUE ("recommendationId", "protocolId")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "survey_recommendation_items"
        ADD CONSTRAINT "FK_survey_recommendation_items_rec"
        FOREIGN KEY ("recommendationId") REFERENCES "survey_recommendations"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "survey_recommendation_items"
        ADD CONSTRAINT "FK_survey_recommendation_items_protocol"
        FOREIGN KEY ("protocolId") REFERENCES "ingredient_protocols"("id") ON DELETE RESTRICT;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "survey_recommendation_items"
        ADD CONSTRAINT "FK_survey_recommendation_items_variant"
        FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "source" character varying NOT NULL DEFAULT 'CATALOG'
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "customerSurveyId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "surveyRecommendationId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "subtotalVnd" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "discountVnd" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "discountType" character varying
    `);

    await queryRunner.query(`
      UPDATE "orders"
      SET "subtotalVnd" = "totalVnd"
      WHERE "subtotalVnd" = 0 AND "totalVnd" > 0
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_customer_survey"
        FOREIGN KEY ("customerSurveyId") REFERENCES "customer_surveys"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_survey_recommendation"
        FOREIGN KEY ("surveyRecommendationId") REFERENCES "survey_recommendations"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "surveyRecommendationItemId" uuid
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "order_items"
        ADD CONSTRAINT "FK_order_items_survey_rec_item"
        FOREIGN KEY ("surveyRecommendationItemId")
        REFERENCES "survey_recommendation_items"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "routines"
      ADD COLUMN IF NOT EXISTS "sourceOrderId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "routines"
      ADD COLUMN IF NOT EXISTS "customerSurveyId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "routines"
      ADD COLUMN IF NOT EXISTS "surveyRecommendationId" uuid
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_routines_source_order"
      ON "routines" ("sourceOrderId")
      WHERE "sourceOrderId" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "routines"
        ADD CONSTRAINT "FK_routines_source_order"
        FOREIGN KEY ("sourceOrderId") REFERENCES "orders"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "routines"
        ADD CONSTRAINT "FK_routines_customer_survey"
        FOREIGN KEY ("customerSurveyId") REFERENCES "customer_surveys"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "routines"
        ADD CONSTRAINT "FK_routines_survey_recommendation"
        FOREIGN KEY ("surveyRecommendationId")
        REFERENCES "survey_recommendations"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "routines" DROP CONSTRAINT IF EXISTS "FK_routines_survey_recommendation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routines" DROP CONSTRAINT IF EXISTS "FK_routines_customer_survey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routines" DROP CONSTRAINT IF EXISTS "FK_routines_source_order"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_routines_source_order"`);
    await queryRunner.query(
      `ALTER TABLE "routines" DROP COLUMN IF EXISTS "surveyRecommendationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routines" DROP COLUMN IF EXISTS "customerSurveyId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "routines" DROP COLUMN IF EXISTS "sourceOrderId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_survey_rec_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP COLUMN IF EXISTS "surveyRecommendationItemId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_survey_recommendation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_customer_survey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "discountType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "discountVnd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "subtotalVnd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "surveyRecommendationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "customerSurveyId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "source"`,
    );

    await queryRunner.query(
      `ALTER TABLE "survey_recommendation_items" DROP CONSTRAINT IF EXISTS "FK_survey_recommendation_items_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_recommendation_items" DROP CONSTRAINT IF EXISTS "FK_survey_recommendation_items_protocol"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_recommendation_items" DROP CONSTRAINT IF EXISTS "FK_survey_recommendation_items_rec"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "survey_recommendation_items"`,
    );

    await queryRunner.query(
      `ALTER TABLE "survey_recommendations" DROP CONSTRAINT IF EXISTS "FK_survey_recommendations_survey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_recommendations" DROP CONSTRAINT IF EXISTS "FK_survey_recommendations_customer"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_survey_recommendations_customer"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "survey_recommendations"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "commerce_settings"`);
  }
}
