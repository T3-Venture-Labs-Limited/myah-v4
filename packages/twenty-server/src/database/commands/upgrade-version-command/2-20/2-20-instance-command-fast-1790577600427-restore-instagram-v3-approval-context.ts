import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// The Inbox reply-context migration (1789645911001) replaced the v3 Instagram
// predicate with a v2-only one. Keep its Email branches and restore v3 without
// changing the separate identity snapshot, digest or immutability checks.
const contextConstraint = (allowV3: boolean) => `
  CHECK ((
    (
      "actionName" = 'send_instagram_message'
      AND "actionKind" IN ('START_CHAT', 'REPLY')
      AND "myahReplyContextSnapshot" IS NULL
      AND (
        (
          "actionVersion" = 2
          AND (
            ("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
            OR ("threadId" IS NULL AND "interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT' AND "interactionContextId" = "draftId")
          )
        )${
          allowV3
            ? `
        OR (
          "actionVersion" = 3
          AND (
            ("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
            OR ("threadId" IS NULL AND "interactionContextType" = 'MYAH_INSTAGRAM_MESSAGE_DRAFT' AND "interactionContextId" = "draftId")
          )
        )`
            : ''
        }
      )
    )
    OR (
      "actionName" = 'send_inbox_reply'
      AND "actionVersion" = 1
      AND "actionKind" IS NULL
      AND "threadId" IS NOT NULL
      AND "interactionContextType" IS NULL
      AND "interactionContextId" IS NULL
      AND "myahReplyContextSnapshot" IS NULL
    )
    OR (
      "actionName" = 'send_inbox_reply'
      AND "actionVersion" = 2
      AND "actionKind" IS NULL
      AND "myahReplyContextSnapshot" IS NOT NULL
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
      AND (
        ("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
        OR ("threadId" IS NULL AND "interactionContextType" = 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT' AND "interactionContextId" = "draftId")
      )
    )
    OR (
      "actionName" NOT IN ('send_instagram_message', 'send_inbox_reply')
      AND "actionKind" IS NULL
      AND "threadId" IS NOT NULL
      AND "interactionContextType" IS NULL
      AND "interactionContextId" IS NULL
      AND "myahReplyContextSnapshot" IS NULL
    )
  ) IS TRUE)`;

const replaceConstraint = (allowV3: boolean) => `
  ALTER TABLE core."actionApprovalBinding"
    DROP CONSTRAINT IF EXISTS "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT",
    ADD CONSTRAINT "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"
      ${contextConstraint(allowV3)}`;

@RegisteredInstanceCommand('2.20.0', 1790577600427, {
  catchUpOnResume: true,
})
export class RestoreInstagramV3ApprovalContextFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(replaceConstraint(true));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = (await queryRunner.query(`SELECT count(*)::int AS count
      FROM core."actionApprovalBinding"
      WHERE "actionName" = 'send_instagram_message' AND "actionVersion" = 3`)) as Array<{
      count: number;
    }>;
    if (count > 0) {
      throw new Error(
        'Cannot restore v2-only approval context with v3 Instagram bindings',
      );
    }
    await queryRunner.query(replaceConstraint(false));
  }
}
