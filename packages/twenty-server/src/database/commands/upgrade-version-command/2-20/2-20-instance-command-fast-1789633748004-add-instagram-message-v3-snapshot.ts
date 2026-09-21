import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

const BINDING = '"core"."actionApprovalBinding"';
const CONTEXT_CONSTRAINT = '"CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"';
const SNAPSHOT_CONSTRAINT =
  '"CHK_ACTION_APPROVAL_BINDING_INSTAGRAM_V3_SNAPSHOT"';
const SNAPSHOT_TRIGGER =
  '"TRG_ACTION_APPROVAL_BINDING_INSTAGRAM_SNAPSHOT_IMMUTABLE"';
const SNAPSHOT_FUNCTION = '"core"."preventInstagramMessageSnapshotChange"';

const V2_CONTEXT_CONSTRAINT = `
  ADD CONSTRAINT ${CONTEXT_CONSTRAINT} CHECK ((
    (
      "actionName" = 'send_instagram_message'
      AND "actionVersion" = 2
      AND "actionKind" IN ('START_CHAT', 'REPLY')
      AND (
        ("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
        OR ("threadId" IS NULL AND "interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT' AND "interactionContextId" = "draftId")
      )
    )
    OR (
      "actionName" <> 'send_instagram_message'
      AND "actionKind" IS NULL
      AND "threadId" IS NOT NULL
      AND "interactionContextType" IS NULL
      AND "interactionContextId" IS NULL
    )
  ) IS TRUE)`;

@RegisteredInstanceCommand('2.20.0', 1789633748004)
export class AddInstagramMessageV3SnapshotFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ADD COLUMN IF NOT EXISTS "instagramMessageSnapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "composerInputDigest" varchar(64)`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP CONSTRAINT IF EXISTS ${CONTEXT_CONSTRAINT}`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ADD CONSTRAINT ${CONTEXT_CONSTRAINT} CHECK ((
        (
          "actionName" = 'send_instagram_message'
          AND "actionKind" IN ('START_CHAT', 'REPLY')
          AND (
            (
              "actionVersion" = 2
              AND (
                ("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
                OR ("threadId" IS NULL AND "interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT' AND "interactionContextId" = "draftId")
              )
            )
            OR (
              "actionVersion" = 3
              AND (
                ("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
                OR (
                  "threadId" IS NULL
                  AND "interactionContextType" = 'MYAH_INSTAGRAM_MESSAGE_DRAFT'
                  AND "interactionContextId" = "draftId"
                )
              )
            )
          )
        )
        OR (
          "actionName" <> 'send_instagram_message'
          AND "actionKind" IS NULL
          AND "threadId" IS NOT NULL
          AND "interactionContextType" IS NULL
          AND "interactionContextId" IS NULL
        )
      ) IS TRUE)`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP CONSTRAINT IF EXISTS ${SNAPSHOT_CONSTRAINT}`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ADD CONSTRAINT ${SNAPSHOT_CONSTRAINT} CHECK ((
        ("actionName" <> 'send_instagram_message' AND "instagramMessageSnapshot" IS NULL AND "composerInputDigest" IS NULL)
        OR ("actionName" = 'send_instagram_message' AND "actionVersion" = 2 AND "instagramMessageSnapshot" IS NULL AND "composerInputDigest" IS NULL)
        OR (
          "actionName" = 'send_instagram_message' AND "actionVersion" = 3
          AND jsonb_typeof("instagramMessageSnapshot") = 'object'
          AND jsonb_typeof("instagramMessageSnapshot"->'publicIdentifier') = 'string'
          AND "instagramMessageSnapshot"->>'publicIdentifier' ~ '^[a-z0-9._]{1,30}$'
          AND left("instagramMessageSnapshot"->>'publicIdentifier', 1) <> '.'
          AND right("instagramMessageSnapshot"->>'publicIdentifier', 1) <> '.'
          AND position('..' in "instagramMessageSnapshot"->>'publicIdentifier') = 0
          AND jsonb_typeof("instagramMessageSnapshot"->'providerId') = 'string'
          AND length("instagramMessageSnapshot"->>'providerId') > 0
          AND jsonb_typeof("instagramMessageSnapshot"->'providerMessagingId') = 'string'
          AND length("instagramMessageSnapshot"->>'providerMessagingId') > 0
          AND jsonb_typeof("instagramMessageSnapshot"->'creatorRecordId') = 'string'
          AND "instagramMessageSnapshot"->>'creatorRecordId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND jsonb_typeof("instagramMessageSnapshot"->'accountBindingId') = 'string'
          AND "instagramMessageSnapshot"->>'accountBindingId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND jsonb_typeof("instagramMessageSnapshot"->'instagramAccountRecordId') = 'string'
          AND "instagramMessageSnapshot"->>'instagramAccountRecordId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND jsonb_typeof("instagramMessageSnapshot"->'unipileAccountId') = 'string'
          AND length("instagramMessageSnapshot"->>'unipileAccountId') > 0
          AND jsonb_typeof("instagramMessageSnapshot"->'instagramUserId') = 'string'
          AND length("instagramMessageSnapshot"->>'instagramUserId') > 0
          AND jsonb_typeof("instagramMessageSnapshot"->'recipientSourceValues') = 'array'
          AND jsonb_typeof("instagramMessageSnapshot"->'actionKind') = 'string'
          AND "instagramMessageSnapshot"->>'actionKind' = "actionKind"
          AND (
            (
              "actionKind" = 'START_CHAT'
              AND "threadId" IS NULL
              AND "interactionContextType" = 'MYAH_INSTAGRAM_MESSAGE_DRAFT'
              AND "interactionContextId" = "draftId"
              AND jsonb_typeof("instagramMessageSnapshot"->'conversationRecordId') = 'null'
              AND jsonb_typeof("instagramMessageSnapshot"->'providerChatId') = 'null'
              AND jsonb_typeof("instagramMessageSnapshot"->'attendeeProviderId') = 'null'
            )
            OR (
              "actionKind" = 'REPLY'
              AND (
                ("threadId" IS NOT NULL AND "interactionContextType" IS NULL AND "interactionContextId" IS NULL)
                OR (
                  "threadId" IS NULL
                  AND "interactionContextType" = 'MYAH_INSTAGRAM_MESSAGE_DRAFT'
                  AND "interactionContextId" = "draftId"
                )
              )
              AND jsonb_typeof("instagramMessageSnapshot"->'conversationRecordId') = 'string'
              AND "instagramMessageSnapshot"->>'conversationRecordId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              AND jsonb_typeof("instagramMessageSnapshot"->'providerChatId') = 'string'
              AND length("instagramMessageSnapshot"->>'providerChatId') > 0
              AND jsonb_typeof("instagramMessageSnapshot"->'attendeeProviderId') = 'string'
              AND length("instagramMessageSnapshot"->>'attendeeProviderId') > 0
              AND "instagramMessageSnapshot"->>'attendeeProviderId' = "instagramMessageSnapshot"->>'providerMessagingId'
            )
          )
          AND (
            (
              "threadId" IS NULL
              AND "actionKind" = 'START_CHAT'
              AND "composerInputDigest" ~* '^[0-9a-f]{64}$'
            )
            OR (
              "threadId" IS NULL
              AND "actionKind" = 'REPLY'
              AND (
                "composerInputDigest" IS NULL
                OR "composerInputDigest" ~* '^[0-9a-f]{64}$'
              )
            )
            OR (
              "threadId" IS NOT NULL
              AND "composerInputDigest" IS NULL
            )
          )
        )
      ) IS TRUE)`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION ${SNAPSHOT_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        IF OLD."instagramMessageSnapshot" IS DISTINCT FROM NEW."instagramMessageSnapshot"
          OR OLD."composerInputDigest" IS DISTINCT FROM NEW."composerInputDigest" THEN
          RAISE EXCEPTION 'Instagram message identity snapshot is immutable; composer input digest is immutable';
        END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS ${SNAPSHOT_TRIGGER} ON ${BINDING}`,
    );
    await queryRunner.query(`CREATE TRIGGER ${SNAPSHOT_TRIGGER} BEFORE UPDATE ON ${BINDING}
      FOR EACH ROW EXECUTE FUNCTION ${SNAPSHOT_FUNCTION}()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows =
      (await queryRunner.query(`SELECT count(*)::int AS count FROM ${BINDING}
      WHERE "instagramMessageSnapshot" IS NOT NULL
        OR "composerInputDigest" IS NOT NULL`)) as Array<{ count: number }>;
    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error('Cannot roll back populated Instagram v3 snapshots');
    }
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS ${SNAPSHOT_TRIGGER} ON ${BINDING}`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS ${SNAPSHOT_FUNCTION}()`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP CONSTRAINT IF EXISTS ${SNAPSHOT_CONSTRAINT}`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP CONSTRAINT IF EXISTS ${CONTEXT_CONSTRAINT},
      ${V2_CONTEXT_CONSTRAINT}`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP COLUMN IF EXISTS "instagramMessageSnapshot",
      DROP COLUMN IF EXISTS "composerInputDigest"`);
  }
}
