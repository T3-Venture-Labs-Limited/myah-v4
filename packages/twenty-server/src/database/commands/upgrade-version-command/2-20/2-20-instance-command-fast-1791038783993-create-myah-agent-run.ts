import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Reply-agent runs, one per creator message (MYAH-445).
@RegisteredInstanceCommand('2.20.0', 1791038783993)
export class CreateMyahAgentRunFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahAgentRun" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL,
      "channel" text NOT NULL,
      "conversationRecordId" uuid NOT NULL,
      "triggerMessageId" uuid NOT NULL,
      "creatorId" uuid NOT NULL,
      "campaignId" uuid,
      "status" text NOT NULL,
      "reason" text,
      "automatic" boolean NOT NULL DEFAULT false,
      "channelInvitationMade" boolean NOT NULL DEFAULT false,
      "draftId" text,
      "draftRevision" integer,
      "draftBody" text,
      "receiptId" uuid,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_MYAH_AGENT_RUN" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_MYAH_AGENT_RUN_TRIGGER" UNIQUE ("workspaceId","triggerMessageId"),
      CONSTRAINT "CHK_MYAH_AGENT_RUN_STATUS" CHECK ("status" IN ('RUNNING','DRAFTED','HANDED_OFF','SKIPPED','SENT','SEND_UNKNOWN','FAILED')),
      CONSTRAINT "CHK_MYAH_AGENT_RUN_CHANNEL" CHECK ("channel" IN ('EMAIL','INSTAGRAM')),
      CONSTRAINT "FK_MYAH_AGENT_RUN_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MYAH_AGENT_RUN_CONVERSATION"
      ON core."myahAgentRun" ("workspaceId","conversationRecordId","createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS core."myahAgentRun"`);
  }
}
