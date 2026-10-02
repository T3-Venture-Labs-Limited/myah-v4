import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Sorts before already-run 2.20 steps; installed instances catch it up.
@RegisteredInstanceCommand('2.20.0', 1790767948744, {
  catchUpOnResume: true,
})
export class CreateMyahComposeEmailReplyEvidenceFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahComposeEmailSend" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspaceId" uuid NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
      "messageChannelId" uuid NOT NULL,
      "connectedAccountId" uuid NOT NULL,
      "userWorkspaceId" uuid NOT NULL,
      "normalizedSender" text NOT NULL,
      "providerHeaderMessageId" text NOT NULL,
      "providerMessageExternalId" text,
      "resolvedThreadExternalId" text NOT NULL,
      "normalizedTo" text[] NOT NULL,
      "creatorId" uuid,
      "sendStartedAt" timestamptz NOT NULL,
      "acceptedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("workspaceId", "id"),
      UNIQUE ("workspaceId", "messageChannelId", "providerHeaderMessageId")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_COMPOSE_SEND_THREAD"
      ON core."myahComposeEmailSend" ("workspaceId", "messageChannelId", "resolvedThreadExternalId")`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahComposeReplyEvidence" (
      "workspaceId" uuid NOT NULL REFERENCES core.workspace(id) ON DELETE CASCADE,
      "inboundMessageId" uuid NOT NULL,
      "messageChannelId" uuid NOT NULL,
      "composeSendId" uuid,
      "creatorId" uuid,
      "classification" text NOT NULL CHECK (
        ("classification" = 'EXACT' AND "composeSendId" IS NOT NULL)
        OR ("classification" = 'THREAD' AND "composeSendId" IS NULL)
      ),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("workspaceId", "inboundMessageId"),
      FOREIGN KEY ("workspaceId", "composeSendId")
        REFERENCES core."myahComposeEmailSend" ("workspaceId", "id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_COMPOSE_EVIDENCE_SEND"
      ON core."myahComposeReplyEvidence" ("workspaceId", "composeSendId")`);

    await queryRunner.query(`CREATE OR REPLACE FUNCTION core."protectMyahComposeReplyEvidence"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF OLD."classification" = 'THREAD' AND NEW."classification" = 'EXACT'
          AND OLD."composeSendId" IS NULL AND NEW."composeSendId" IS NOT NULL
          AND (NEW."workspaceId", NEW."inboundMessageId", NEW."messageChannelId",
            NEW."creatorId", NEW."createdAt") IS NOT DISTINCT FROM
            (OLD."workspaceId", OLD."inboundMessageId", OLD."messageChannelId",
              OLD."creatorId", OLD."createdAt")
        THEN RETURN NEW; END IF;
        RAISE EXCEPTION 'Compose reply evidence identity is immutable';
      END $$`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_MYAH_COMPOSE_REPLY_EVIDENCE_IMMUTABLE" ON core."myahComposeReplyEvidence"`);
    await queryRunner.query(`CREATE TRIGGER "TRG_MYAH_COMPOSE_REPLY_EVIDENCE_IMMUTABLE"
      BEFORE UPDATE ON core."myahComposeReplyEvidence"
      FOR EACH ROW EXECUTE FUNCTION core."protectMyahComposeReplyEvidence"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS core."myahComposeReplyEvidence"');
    await queryRunner.query('DROP TABLE IF EXISTS core."myahComposeEmailSend"');
    await queryRunner.query('DROP FUNCTION IF EXISTS core."protectMyahComposeReplyEvidence"()');
  }
}
