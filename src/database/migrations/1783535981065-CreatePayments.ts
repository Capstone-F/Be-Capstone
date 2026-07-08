import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1783535981065 implements MigrationInterface {
  name = 'CreatePayments1783535981065';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "provider" character varying NOT NULL DEFAULT 'VNPAY', "status" character varying NOT NULL DEFAULT 'PENDING', "amountVnd" bigint NOT NULL, "clientReturnUrl" character varying NOT NULL, "paidAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_order" ON "payments" ("orderId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "paymentId" uuid NOT NULL, "vnpTxnRef" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "amountVnd" bigint NOT NULL, "providerTransactionId" character varying, "responseCode" character varying, "bankCode" character varying, "paidAt" TIMESTAMP WITH TIME ZONE, "rawReturn" jsonb, "rawIpn" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a0d8a67c07a0fef98dfd20214e5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_payment_attempts_vnp_txn_ref" ON "payment_attempts" ("vnpTxnRef") `,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_attempts" ADD CONSTRAINT "FK_payment_attempts_payment" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_attempts" DROP CONSTRAINT "FK_payment_attempts_payment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_order"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_attempts_vnp_txn_ref"`,
    );
    await queryRunner.query(`DROP TABLE "payment_attempts"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_order"`);
    await queryRunner.query(`DROP TABLE "payments"`);
  }
}
