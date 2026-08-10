import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportChat1785500000000 implements MigrationInterface {
  name = 'SupportChat1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customerUserId" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'OPEN',
        "subject" character varying,
        "assignedStaffUserId" uuid,
        "assignedAt" TIMESTAMPTZ,
        "messageCount" integer NOT NULL DEFAULT 0,
        "customerLastReadSeq" integer NOT NULL DEFAULT 0,
        "staffLastReadSeq" integer NOT NULL DEFAULT 0,
        "lastMessageAt" TIMESTAMPTZ,
        "lastMessagePreview" character varying,
        "closedByUserId" uuid,
        "closedAt" TIMESTAMPTZ,
        "closeReason" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sessionId" uuid NOT NULL,
        "seq" integer NOT NULL,
        "senderUserId" uuid NOT NULL,
        "senderRole" character varying NOT NULL,
        "content" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_messages" PRIMARY KEY ("id")
      )
    `);

    await this.addFk(
      queryRunner,
      'support_sessions',
      'FK_support_sessions_customer',
      '("customerUserId") REFERENCES "users"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'support_sessions',
      'FK_support_sessions_staff',
      '("assignedStaffUserId") REFERENCES "users"("id") ON DELETE SET NULL',
    );
    await this.addFk(
      queryRunner,
      'support_messages',
      'FK_support_messages_session',
      '("sessionId") REFERENCES "support_sessions"("id") ON DELETE CASCADE',
    );
    await this.addFk(
      queryRunner,
      'support_messages',
      'FK_support_messages_sender',
      '("senderUserId") REFERENCES "users"("id") ON DELETE CASCADE',
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_support_sessions_live_customer"
      ON "support_sessions" ("customerUserId")
      WHERE "status" <> 'CLOSED'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_support_messages_session_seq"
      ON "support_messages" ("sessionId", "seq")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_sessions_status"
      ON "support_sessions" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_sessions_assignedStaffUserId"
      ON "support_sessions" ("assignedStaffUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_sessions_lastMessageAt"
      ON "support_sessions" ("lastMessageAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_messages_sessionId_seq"
      ON "support_messages" ("sessionId", "seq")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "support_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_sessions"`);
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
