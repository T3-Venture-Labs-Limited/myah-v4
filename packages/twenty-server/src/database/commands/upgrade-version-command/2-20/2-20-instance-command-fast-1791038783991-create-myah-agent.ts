import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// Workspace reply agent and Campaign-level agent controls (MYAH-445).
@RegisteredInstanceCommand('2.20.0', 1791038783991)
export class CreateMyahAgentFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahAgent" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "workspaceId" uuid NOT NULL,
      "tone" text,
      "responseLength" text,
      "language" text,
      "brandInformation" text,
      "replyRules" text,
      "escalationBoundaries" text,
      "sendingMode" text NOT NULL DEFAULT 'DRAFT_FOR_APPROVAL',
      "sendingModeEnabledByUserWorkspaceId" uuid,
      "sendingModeEnabledAt" timestamptz,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_MYAH_AGENT" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_MYAH_AGENT_WORKSPACE" UNIQUE ("workspaceId"),
      CONSTRAINT "CHK_MYAH_AGENT_SENDING_MODE" CHECK ("sendingMode" IN ('DRAFT_FOR_APPROVAL','SEND_AUTOMATICALLY')),
      CONSTRAINT "FK_MYAH_AGENT_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS core."myahCampaignAgentSetting" (
      "workspaceId" uuid NOT NULL,
      "campaignId" uuid NOT NULL,
      "instagramAccountId" uuid,
      "preferredChannel" text NOT NULL DEFAULT 'NO_PREFERENCE',
      "requireReplyApproval" boolean NOT NULL DEFAULT false,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_MYAH_CAMPAIGN_AGENT_SETTING" PRIMARY KEY ("workspaceId","campaignId"),
      CONSTRAINT "CHK_MYAH_CAMPAIGN_AGENT_SETTING_CHANNEL" CHECK ("preferredChannel" IN ('INSTAGRAM','EMAIL','NO_PREFERENCE')),
      CONSTRAINT "FK_MYAH_CAMPAIGN_AGENT_SETTING_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES core."workspace"("id") ON DELETE CASCADE
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS core."myahCampaignAgentSetting"`);
    await queryRunner.query(`DROP TABLE IF EXISTS core."myahAgent"`);
  }
}
