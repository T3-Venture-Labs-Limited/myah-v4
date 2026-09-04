import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1799201001000)
export class AddUnipileInstagramSyncStateFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "core"."unipileInstagramSyncRun_status_enum" AS ENUM('RUNNING', 'COMPLETED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "core"."unipileInstagramWebhookEvent_eventType_enum" AS ENUM('MESSAGE_RECEIVED', 'MESSAGE_READ', 'MESSAGE_DELIVERED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_REACTION', 'ACCOUNT_STATUS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "core"."unipileInstagramWebhookEvent_status_enum" AS ENUM('RECEIVED', 'ENQUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."unipileInstagramAccountBinding" ADD COLUMN IF NOT EXISTS "lastSyncScheduledAt" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."unipileInstagramSyncRun" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bindingId" uuid NOT NULL,
        "status" "core"."unipileInstagramSyncRun_status_enum" NOT NULL DEFAULT 'RUNNING',
        "overlapAfter" TIMESTAMP WITH TIME ZONE,
        "chatCursor" text,
        "currentChatId" text,
        "currentChatAttendeeId" text,
        "messageCursor" text,
        "completedChatHighWaterAt" TIMESTAMP WITH TIME ZONE,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "failureCode" text,
        "failureReason" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UNIPILE_IG_SYNC_RUN" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_UNIPILE_IG_SYNC_RUN_STATUS" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED')),
        CONSTRAINT "CHK_UNIPILE_IG_SYNC_RUN_CHAT_CURSOR" CHECK ("currentChatId" IS NOT NULL OR "messageCursor" IS NULL),
        CONSTRAINT "CHK_UNIPILE_IG_SYNC_RUN_COMPLETION" CHECK (("status" = 'RUNNING' AND "completedAt" IS NULL) OR ("status" IN ('COMPLETED', 'FAILED') AND "completedAt" IS NOT NULL)),
        CONSTRAINT "CHK_UNIPILE_IG_SYNC_RUN_CHAT_IDENTITY" CHECK (("currentChatId" IS NULL AND "currentChatAttendeeId" IS NULL) OR ("currentChatId" IS NOT NULL AND btrim("currentChatAttendeeId") <> '')),
        CONSTRAINT "FK_UNIPILE_IG_SYNC_RUN_BINDING" FOREIGN KEY ("bindingId") REFERENCES "core"."unipileInstagramAccountBinding"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_UNIPILE_IG_SYNC_RUN_RUNNING_BINDING" ON "core"."unipileInstagramSyncRun" ("bindingId") WHERE "status" = 'RUNNING'`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."unipileInstagramChatCheckpoint" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bindingId" uuid NOT NULL,
        "unipileChatId" text NOT NULL,
        "completedMessageHighWaterAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UNIPILE_IG_CHAT_CHECKPOINT" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_UNIPILE_IG_CHAT_CHECKPOINT_BINDING_CHAT" UNIQUE ("bindingId", "unipileChatId"),
        CONSTRAINT "CHK_UNIPILE_IG_CHAT_CHECKPOINT_CHAT" CHECK (btrim("unipileChatId") <> ''),
        CONSTRAINT "FK_UNIPILE_IG_CHAT_CHECKPOINT_BINDING" FOREIGN KEY ("bindingId") REFERENCES "core"."unipileInstagramAccountBinding"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."unipileInstagramWebhookEvent" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bindingId" uuid NOT NULL,
        "eventFingerprint" text NOT NULL,
        "eventType" "core"."unipileInstagramWebhookEvent_eventType_enum" NOT NULL,
        "unipileChatId" text,
        "unipileMessageId" text,
        "attendeeProviderId" text,
        "accountStatus" text,
        "deliveryState" text,
        "deliveryStateUpdatedAt" TIMESTAMP WITH TIME ZONE,
        "status" "core"."unipileInstagramWebhookEvent_status_enum" NOT NULL DEFAULT 'RECEIVED',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "nextAttemptAt" TIMESTAMP WITH TIME ZONE,
        "failureCode" text,
        "failureReason" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_UNIPILE_IG_WEBHOOK_EVENT" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_UNIPILE_IG_WEBHOOK_EVENT_FINGERPRINT" UNIQUE ("eventFingerprint"),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_FINGERPRINT" CHECK (btrim("eventFingerprint") <> '' AND "eventFingerprint" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_CHAT_IDENTITY" CHECK ("unipileChatId" IS NULL OR btrim("unipileChatId") <> ''),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_MESSAGE_IDENTITY" CHECK ("unipileMessageId" IS NULL OR btrim("unipileMessageId") <> ''),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_ATTENDEE_IDENTITY" CHECK ("attendeeProviderId" IS NULL OR btrim("attendeeProviderId") <> ''),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_ACCOUNT_STATUS" CHECK ("accountStatus" IS NULL OR btrim("accountStatus") <> ''),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_DELIVERY_STATE" CHECK ("deliveryState" IS NULL OR btrim("deliveryState") <> ''),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_RETRY_STATE" CHECK ("attemptCount" >= 0 AND (("status" IN ('PROCESSING', 'COMPLETED', 'FAILED') AND "nextAttemptAt" IS NULL) OR "status" IN ('RECEIVED', 'ENQUEUED'))),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_MESSAGE_REQUIRED" CHECK ("eventType" NOT IN ('MESSAGE_RECEIVED', 'MESSAGE_READ', 'MESSAGE_DELIVERED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_REACTION') OR ("unipileChatId" IS NOT NULL AND "unipileMessageId" IS NOT NULL AND "attendeeProviderId" IS NOT NULL)),
        CONSTRAINT "CHK_UNIPILE_IG_WEBHOOK_EVENT_ACCOUNT_STATUS_NO_MESSAGE" CHECK ("eventType" <> 'ACCOUNT_STATUS' OR "unipileMessageId" IS NULL),
        CONSTRAINT "FK_UNIPILE_IG_WEBHOOK_EVENT_BINDING" FOREIGN KEY ("bindingId") REFERENCES "core"."unipileInstagramAccountBinding"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_UNIPILE_IG_WEBHOOK_EVENT_STATUS_NEXT_ATTEMPT_UPDATED_AT" ON "core"."unipileInstagramWebhookEvent" ("status", "nextAttemptAt", "updatedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_UNIPILE_IG_SYNC_RUN_RUNNING_BINDING"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_UNIPILE_IG_WEBHOOK_EVENT_STATUS_NEXT_ATTEMPT_UPDATED_AT"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."unipileInstagramWebhookEvent"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "core"."unipileInstagramWebhookEvent_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "core"."unipileInstagramWebhookEvent_eventType_enum"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."unipileInstagramChatCheckpoint"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."unipileInstagramSyncRun"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."unipileInstagramAccountBinding" DROP COLUMN IF EXISTS "lastSyncScheduledAt"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "core"."unipileInstagramSyncRun_status_enum"`,
    );
  }
}
