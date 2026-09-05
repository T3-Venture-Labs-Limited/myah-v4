import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

const BINDING = '"core"."actionApprovalBinding"';
const CONTEXT_CONSTRAINT =
  '"CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"';
const RESOLUTION = '"core"."instagramSendOutcomeResolution"';

@RegisteredInstanceCommand('2.20.0', 1799201003000)
export class AddInstagramDirectActionContextFastInstanceCommand
  implements FastInstanceCommand
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ADD COLUMN IF NOT EXISTS "interactionContextType" varchar,
      ADD COLUMN IF NOT EXISTS "interactionContextId" uuid,
      ADD COLUMN IF NOT EXISTS "actionKind" varchar,
      ALTER COLUMN "threadId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP CONSTRAINT IF EXISTS ${CONTEXT_CONSTRAINT}`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ADD CONSTRAINT ${CONTEXT_CONSTRAINT}
      CHECK (
        (
          "actionName" = 'send_instagram_message'
          AND "actionVersion" = 2
          AND "actionKind" IN ('START_CHAT', 'REPLY')
          AND (
            (
              "threadId" IS NOT NULL
              AND "interactionContextType" IS NULL
              AND "interactionContextId" IS NULL
            )
            OR
            (
              "threadId" IS NULL
              AND "interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT'
              AND "interactionContextId" = "draftId"
            )
          )
        )
        OR
        (
          "actionName" <> 'send_instagram_message'
          AND "actionKind" IS NULL
          AND "threadId" IS NOT NULL
          AND "interactionContextType" IS NULL
          AND "interactionContextId" IS NULL
        )
      )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${RESOLUTION} (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL,
      "actionExecutionReceiptId" uuid NOT NULL,
      "resolvedByUserWorkspaceId" uuid NOT NULL,
      "outcome" varchar NOT NULL,
      "evidenceTypes" text[] NOT NULL,
      "evidenceDigests" varchar(64)[] NOT NULL,
      "notes" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_INSTAGRAM_SEND_OUTCOME_RESOLUTION" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_INSTAGRAM_SEND_OUTCOME_RESOLUTION_RECEIPT"
        UNIQUE ("actionExecutionReceiptId"),
      CONSTRAINT "FK_INSTAGRAM_SEND_OUTCOME_RESOLUTION_WORKSPACE"
        FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_INSTAGRAM_SEND_OUTCOME_RESOLUTION_RECEIPT"
        FOREIGN KEY ("actionExecutionReceiptId") REFERENCES "core"."actionExecutionReceipt"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_INSTAGRAM_SEND_OUTCOME_RESOLUTION_USER_WORKSPACE"
        FOREIGN KEY ("resolvedByUserWorkspaceId") REFERENCES "core"."userWorkspace"("id") ON DELETE RESTRICT,
      CONSTRAINT "CHK_INSTAGRAM_SEND_OUTCOME_RESOLUTION_OUTCOME"
        CHECK ("outcome" IN ('CONFIRMED_SENT', 'CLEARED_NOT_SENT')),
      CONSTRAINT "CHK_INSTAGRAM_SEND_OUTCOME_RESOLUTION_EVIDENCE"
        CHECK (
          cardinality("evidenceTypes") > 0
          AND cardinality("evidenceTypes") = cardinality("evidenceDigests")
        )
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`SELECT count(*)::int AS count
      FROM ${BINDING}
      WHERE "threadId" IS NULL
        OR "interactionContextType" IS NOT NULL
        OR "interactionContextId" IS NOT NULL
        OR "actionKind" IS NOT NULL`)) as Array<{ count: number }>;

    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot roll back populated Instagram direct action contexts',
      );
    }
    const resolutionRows = (await queryRunner.query(
      `SELECT count(*)::int AS count FROM ${RESOLUTION}`,
    )) as Array<{ count: number }>;
    if (Number(resolutionRows[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot roll back populated Instagram send outcome resolutions',
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS ${RESOLUTION}`);

    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP CONSTRAINT IF EXISTS ${CONTEXT_CONSTRAINT}`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      DROP COLUMN IF EXISTS "interactionContextType",
      DROP COLUMN IF EXISTS "interactionContextId",
      DROP COLUMN IF EXISTS "actionKind"`);
    await queryRunner.query(`ALTER TABLE ${BINDING}
      ALTER COLUMN "threadId" SET NOT NULL`);
  }
}
