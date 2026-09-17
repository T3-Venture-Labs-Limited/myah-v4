import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789313971535)
export class CreateMyahInboxReplyContextDraftsFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE core."myahInboxReplyContextDraft_channel_enum" AS ENUM ('EMAIL', 'INSTAGRAM');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE core."myahInboxReplyContextDraft_contextKind_enum" AS ENUM ('CAMPAIGN', 'GENERAL');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "core"."myahInboxReplyContextDraft" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL,
      "contactAnchorKind" varchar(32) NOT NULL,
      "contactAnchorId" uuid NOT NULL,
      "channel" core."myahInboxReplyContextDraft_channel_enum" NOT NULL,
      "deliveryTargetId" uuid NOT NULL,
      "contextKind" core."myahInboxReplyContextDraft_contextKind_enum" NOT NULL,
      "campaignId" uuid,
      "bodyMarkdown" text,
      "bodyBlocknote" text,
      "revision" integer NOT NULL DEFAULT 0,
      "proposalContextFingerprint" varchar(64),
      "reviewedContextFingerprint" varchar(64),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_MYAH_INBOX_REPLY_CONTEXT_DRAFT" PRIMARY KEY ("id"),
      CONSTRAINT "FK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_WORKSPACE"
        FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_CONTEXT" CHECK (
        ("contextKind" = 'GENERAL' AND "campaignId" IS NULL)
        OR ("contextKind" = 'CAMPAIGN' AND "campaignId" IS NOT NULL)
      ),
      CONSTRAINT "CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_ANCHOR" CHECK (
        "contactAnchorKind" IN ('CREATOR', 'EMAIL_THREAD', 'INSTAGRAM_CONVERSATION')
      ),
      CONSTRAINT "CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_CHANNEL_ANCHOR" CHECK (
        ("channel" = 'EMAIL' AND "contactAnchorKind" IN ('CREATOR', 'EMAIL_THREAD'))
        OR ("channel" = 'INSTAGRAM' AND "contactAnchorKind" IN ('CREATOR', 'INSTAGRAM_CONVERSATION'))
      ),
      CONSTRAINT "CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_BODY" CHECK (
        ("bodyMarkdown" IS NULL AND "bodyBlocknote" IS NULL)
        OR "bodyMarkdown" IS NOT NULL
      ),
      CONSTRAINT "CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_REVISION"
        CHECK ("revision" >= 0),
      CONSTRAINT "CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_PROPOSAL_FINGERPRINT"
        CHECK ("proposalContextFingerprint" IS NULL OR "proposalContextFingerprint" ~ '^[0-9a-f]{64}$'),
      CONSTRAINT "CHK_MYAH_INBOX_REPLY_CONTEXT_DRAFT_REVIEW_FINGERPRINT"
        CHECK ("reviewedContextFingerprint" IS NULL OR "reviewedContextFingerprint" ~ '^[0-9a-f]{64}$')
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_MYAH_REPLY_CONTEXT_DRAFT_CAMPAIGN_IDENTITY" ON "core"."myahInboxReplyContextDraft" (
        "workspaceId", "contactAnchorKind", "contactAnchorId", "channel",
        "deliveryTargetId", "campaignId"
      ) WHERE "contextKind" = 'CAMPAIGN'`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_MYAH_REPLY_CONTEXT_DRAFT_GENERAL_IDENTITY" ON "core"."myahInboxReplyContextDraft" (
        "workspaceId", "contactAnchorKind", "contactAnchorId", "channel",
        "deliveryTargetId"
      ) WHERE "contextKind" = 'GENERAL'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS
      "IDX_MYAH_REPLY_CONTEXT_DRAFT_TARGET" ON "core"."myahInboxReplyContextDraft" (
        "workspaceId", "contactAnchorKind", "contactAnchorId", "channel",
        "deliveryTargetId", "updatedAt" DESC
      )`);
    await queryRunner.query(`ALTER TABLE core."actionApprovalBinding"
      ADD COLUMN IF NOT EXISTS "myahReplyContextSnapshot" jsonb`);
    await queryRunner.query(`ALTER TABLE core."actionApprovalBinding"
      DROP CONSTRAINT IF EXISTS "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"`);
    await queryRunner.query(`ALTER TABLE core."actionApprovalBinding"
      ADD CONSTRAINT "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT" CHECK ((
        (
          "actionName" = 'send_instagram_message' AND "actionVersion" = 2
          AND "actionKind" IN ('START_CHAT', 'REPLY')
          AND (("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
            OR ("threadId" IS NULL AND "interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT' AND "interactionContextId" = "draftId"))
          AND "myahReplyContextSnapshot" IS NULL
        ) OR (
          "actionName" = 'send_inbox_reply' AND "actionVersion" = 1
          AND "actionKind" IS NULL AND "threadId" IS NOT NULL
          AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL
          AND "myahReplyContextSnapshot" IS NULL
        ) OR (
          "actionName" = 'send_inbox_reply' AND "actionVersion" = 2
          AND "actionKind" IS NULL AND "myahReplyContextSnapshot" IS NOT NULL
          AND jsonb_typeof("myahReplyContextSnapshot") = 'object'
          AND "myahReplyContextSnapshot" ->> 'schemaVersion' = '1'
          AND "myahReplyContextSnapshot" ->> 'channel' = 'EMAIL'
          AND "myahReplyContextSnapshot" ->> 'draftId' = "draftId"::text
          AND "myahReplyContextSnapshot" ->> 'deliveryTargetId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND "myahReplyContextSnapshot" ->> 'contextFingerprint' ~ '^[0-9a-f]{64}$'
          AND "myahReplyContextSnapshot" ->> 'eligibilityEvidenceDigest' ~ '^[0-9a-f]{64}$'
          AND "myahReplyContextSnapshot" #>> '{contactAnchor,kind}' IN ('CREATOR', 'EMAIL_THREAD')
          AND "myahReplyContextSnapshot" #>> '{contactAnchor,id}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (("myahReplyContextSnapshot" #>> '{replyContext,kind}' = 'GENERAL'
                AND "myahReplyContextSnapshot" #>> '{replyContext,campaignId}' IS NULL)
            OR ("myahReplyContextSnapshot" #>> '{replyContext,kind}' = 'CAMPAIGN'
                AND "myahReplyContextSnapshot" #>> '{replyContext,campaignId}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
          AND (("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
            OR ("threadId" IS NULL AND "interactionContextType" = 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT' AND "interactionContextId" = "draftId"))
        ) OR (
          "actionName" NOT IN ('send_instagram_message', 'send_inbox_reply')
          AND "actionKind" IS NULL AND "threadId" IS NOT NULL
          AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL
          AND "myahReplyContextSnapshot" IS NULL
        )
      ) IS TRUE)`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION core."protectMyahEmailContextAuthority"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD."actionName" = 'send_inbox_reply' AND OLD."actionVersion" = 2 AND (
          NEW."myahReplyContextSnapshot" IS DISTINCT FROM OLD."myahReplyContextSnapshot"
          OR NEW."actionName" IS DISTINCT FROM OLD."actionName"
          OR NEW."actionVersion" IS DISTINCT FROM OLD."actionVersion"
          OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
          OR NEW."draftId" IS DISTINCT FROM OLD."draftId"
          OR NEW."threadId" IS DISTINCT FROM OLD."threadId"
          OR NEW."interactionContextType" IS DISTINCT FROM OLD."interactionContextType"
          OR NEW."interactionContextId" IS DISTINCT FROM OLD."interactionContextId"
          OR NEW."contentDigest" IS DISTINCT FROM OLD."contentDigest"
          OR NEW."recipientFingerprint" IS DISTINCT FROM OLD."recipientFingerprint"
          OR NEW."sendingAccountFingerprint" IS DISTINCT FROM OLD."sendingAccountFingerprint"
          OR NEW."actionContextFingerprint" IS DISTINCT FROM OLD."actionContextFingerprint"
          OR NEW."initiatorUserWorkspaceId" IS DISTINCT FROM OLD."initiatorUserWorkspaceId"
        ) THEN RAISE EXCEPTION 'Email context approval authority is immutable'; END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_MYAH_EMAIL_CONTEXT_AUTHORITY" ON core."actionApprovalBinding"`);
    await queryRunner.query(`CREATE TRIGGER "TRG_MYAH_EMAIL_CONTEXT_AUTHORITY" BEFORE UPDATE ON core."actionApprovalBinding"
      FOR EACH ROW EXECUTE FUNCTION core."protectMyahEmailContextAuthority"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."myahInboxReplyContextDraft"`);
    await queryRunner.query(`DROP TYPE IF EXISTS core."myahInboxReplyContextDraft_contextKind_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS core."myahInboxReplyContextDraft_channel_enum"`);
  }
}
