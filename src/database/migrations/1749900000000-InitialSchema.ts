import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1749900000000 implements MigrationInterface {
  name = 'InitialSchema1749900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "keycloakSub" character varying NOT NULL,
        "email" character varying,
        "name" character varying,
        "provider" character varying NOT NULL DEFAULT 'keycloak',
        "roles" text NOT NULL DEFAULT 'customer',
        "clinicId" uuid,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_keycloakSub" UNIQUE ("keycloakSub")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clinics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "address" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clinics" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "brand" character varying NOT NULL DEFAULT 'Unknown',
        "category" character varying NOT NULL DEFAULT 'TREATMENT',
        "description" character varying,
        "priceVnd" integer NOT NULL DEFAULT 0,
        "stockQuantity" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "shelfLifeValue" integer NOT NULL DEFAULT 365,
        "shelfLifeUnit" character varying NOT NULL DEFAULT 'DAY',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand" character varying NOT NULL DEFAULT 'Unknown'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" character varying NOT NULL DEFAULT 'TREATMENT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "priceVnd" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stockQuantity" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shelfLifeValue" integer NOT NULL DEFAULT 365`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shelfLifeUnit" character varying NOT NULL DEFAULT 'DAY'`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_category" ON "products" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_brand" ON "products" ("brand")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ingredients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "ingredientType" character varying,
        "isActiveIngredient" boolean NOT NULL DEFAULT false,
        "description" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ingredients" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ingredients_name" ON "ingredients" ("name")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_ingredients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "ingredientId" uuid NOT NULL,
        "concentrationPct" numeric(5,2),
        "isKeyIngredient" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_product_ingredients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_ingredients_product_ingredient" UNIQUE ("productId", "ingredientId")
      )
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'product_ingredients',
      'FK_product_ingredients_product',
      `("productId") REFERENCES "products"("id") ON DELETE CASCADE`,
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'product_ingredients',
      'FK_product_ingredients_ingredient',
      `("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "treatment_goals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        CONSTRAINT "PK_treatment_goals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_treatment_goals_code" ON "treatment_goals" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "goal_ingredients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "goalId" uuid NOT NULL,
        "ingredientId" uuid NOT NULL,
        "priorityScore" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_goal_ingredients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_goal_ingredients_goal_ingredient" UNIQUE ("goalId", "ingredientId")
      )
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'goal_ingredients',
      'FK_goal_ingredients_goal',
      `("goalId") REFERENCES "treatment_goals"("id") ON DELETE CASCADE`,
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'goal_ingredients',
      'FK_goal_ingredients_ingredient',
      `("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ingredient_conflicts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ingredientAId" uuid NOT NULL,
        "ingredientBId" uuid NOT NULL,
        "severity" character varying NOT NULL,
        "reason" character varying,
        CONSTRAINT "PK_ingredient_conflicts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ingredient_conflicts_pair" UNIQUE ("ingredientAId", "ingredientBId")
      )
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'ingredient_conflicts',
      'FK_ingredient_conflicts_a',
      `("ingredientAId") REFERENCES "ingredients"("id") ON DELETE CASCADE`,
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'ingredient_conflicts',
      'FK_ingredient_conflicts_b',
      `("ingredientBId") REFERENCES "ingredients"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productId" uuid NOT NULL,
        "batchCode" character varying,
        "initialQuantity" integer NOT NULL,
        "remainingQuantity" integer NOT NULL,
        "manufacturingDate" date NOT NULL,
        "expirationDate" date NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_batches" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_batches" ADD COLUMN IF NOT EXISTS "productId" uuid
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'stock_batches',
      'FK_stock_batches_product',
      `("productId") REFERENCES "products"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "batchId" uuid NOT NULL,
        "type" character varying NOT NULL,
        "quantity" integer NOT NULL,
        "note" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id")
      )
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'stock_movements',
      'FK_stock_movements_batch',
      `("batchId") REFERENCES "stock_batches"("id") ON DELETE CASCADE`,
    );
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    table: string,
    constraintName: string,
    definition: string,
  ): Promise<void> {
    // Also catch undefined_column (42703): pre-existing tables created by
    // TypeORM synchronize may have different column names than this initial
    // schema. Subsequent migrations rebuild the correct final schema anyway.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "${table}"
        ADD CONSTRAINT "${constraintName}"
        FOREIGN KEY ${definition};
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_column THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "FK_stock_movements_batch"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await queryRunner.query(
      `ALTER TABLE "stock_batches" DROP CONSTRAINT IF EXISTS "FK_stock_batches_product"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_batches"`);
    await queryRunner.query(
      `ALTER TABLE "ingredient_conflicts" DROP CONSTRAINT IF EXISTS "FK_ingredient_conflicts_b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingredient_conflicts" DROP CONSTRAINT IF EXISTS "FK_ingredient_conflicts_a"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ingredient_conflicts"`);
    await queryRunner.query(
      `ALTER TABLE "goal_ingredients" DROP CONSTRAINT IF EXISTS "FK_goal_ingredients_ingredient"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goal_ingredients" DROP CONSTRAINT IF EXISTS "FK_goal_ingredients_goal"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "goal_ingredients"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_treatment_goals_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "treatment_goals"`);
    await queryRunner.query(
      `ALTER TABLE "product_ingredients" DROP CONSTRAINT IF EXISTS "FK_product_ingredients_ingredient"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_ingredients" DROP CONSTRAINT IF EXISTS "FK_product_ingredients_product"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_ingredients"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ingredients_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ingredients"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_brand"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_category"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clinics"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
