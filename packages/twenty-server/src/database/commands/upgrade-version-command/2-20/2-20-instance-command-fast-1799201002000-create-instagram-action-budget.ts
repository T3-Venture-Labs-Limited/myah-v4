import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1799201002000)
export class CreateInstagramActionBudgetFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "core"."instagramActionReservation_actionKind_enum" AS ENUM('START_CHAT', 'REPLY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."instagramActionReservation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "instagramAccountRecordId" uuid NOT NULL,
        "actionExecutionReceiptId" uuid NOT NULL,
        "actionKind" "core"."instagramActionReservation_actionKind_enum" NOT NULL,
        "targetFingerprint" varchar(64) NOT NULL,
        "reservedAt" timestamptz NOT NULL DEFAULT now(),
        "providerAttemptedAt" timestamptz,
        "releasedAt" timestamptz,
        "releaseReason" text,
        "targetLockReleasedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_INSTAGRAM_ACTION_RESERVATION" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_INSTAGRAM_ACTION_RESERVATION_RECEIPT" UNIQUE ("actionExecutionReceiptId"),
        CONSTRAINT "CHK_INSTAGRAM_ACTION_RESERVATION_TARGET_FINGERPRINT" CHECK ("targetFingerprint" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "FK_INSTAGRAM_ACTION_RESERVATION_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_INSTAGRAM_ACTION_RESERVATION_RECEIPT" FOREIGN KEY ("actionExecutionReceiptId") REFERENCES "core"."actionExecutionReceipt"("id") ON DELETE RESTRICT
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_INSTAGRAM_ACTION_RESERVATION_ACTIVE_WINDOW" ON "core"."instagramActionReservation" ("workspaceId", "instagramAccountRecordId", "reservedAt") WHERE "releasedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_INSTAGRAM_ACTION_RESERVATION_START_CHAT_TARGET" ON "core"."instagramActionReservation" ("workspaceId", "instagramAccountRecordId", "targetFingerprint") WHERE "actionKind" = 'START_CHAT' AND "targetLockReleasedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."instagramActionLimitBlock" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspaceId" uuid NOT NULL,
        "instagramAccountRecordId" uuid NOT NULL,
        "actionExecutionReceiptId" uuid NOT NULL,
        "errorCode" varchar NOT NULL DEFAULT 'INSTAGRAM_ACTION_LIMIT_REACHED',
        "hourlyUsed" integer NOT NULL,
        "hourlyLimit" integer NOT NULL,
        "hourlyRemaining" integer NOT NULL,
        "dailyUsed" integer NOT NULL,
        "dailyLimit" integer NOT NULL,
        "dailyRemaining" integer NOT NULL,
        "blockedWindows" text[] NOT NULL,
        "nextEligibleAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_INSTAGRAM_ACTION_LIMIT_BLOCK" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_INSTAGRAM_ACTION_LIMIT_BLOCK_RECEIPT" UNIQUE ("actionExecutionReceiptId"),
        CONSTRAINT "CHK_INSTAGRAM_ACTION_LIMIT_BLOCK_ERROR_CODE" CHECK ("errorCode" = 'INSTAGRAM_ACTION_LIMIT_REACHED'),
        CONSTRAINT "CHK_INSTAGRAM_ACTION_LIMIT_BLOCK_NONNEGATIVE" CHECK ("hourlyUsed" >= 0 AND "hourlyLimit" >= 0 AND "hourlyRemaining" >= 0 AND "dailyUsed" >= 0 AND "dailyLimit" >= 0 AND "dailyRemaining" >= 0),
        CONSTRAINT "CHK_INSTAGRAM_ACTION_LIMIT_BLOCK_LIMITS" CHECK ("hourlyLimit" = 10 AND "dailyLimit" = 100),
        CONSTRAINT "CHK_INSTAGRAM_ACTION_LIMIT_BLOCK_REMAINING" CHECK ("hourlyRemaining" = GREATEST("hourlyLimit" - "hourlyUsed", 0) AND "dailyRemaining" = GREATEST("dailyLimit" - "dailyUsed", 0)),
        CONSTRAINT "CHK_INSTAGRAM_ACTION_LIMIT_BLOCK_WINDOWS" CHECK (cardinality("blockedWindows") > 0 AND "blockedWindows" <@ ARRAY['HOURLY', 'DAILY']::text[]),
        CONSTRAINT "FK_INSTAGRAM_ACTION_LIMIT_BLOCK_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_INSTAGRAM_ACTION_LIMIT_BLOCK_RECEIPT" FOREIGN KEY ("actionExecutionReceiptId") REFERENCES "core"."actionExecutionReceipt"("id") ON DELETE RESTRICT
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_INSTAGRAM_ACTION_RESERVATION_ACTIVE_WINDOW"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_INSTAGRAM_ACTION_RESERVATION_START_CHAT_TARGET"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."instagramActionLimitBlock"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."instagramActionReservation"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "core"."instagramActionReservation_actionKind_enum"`,
    );
  }
}
