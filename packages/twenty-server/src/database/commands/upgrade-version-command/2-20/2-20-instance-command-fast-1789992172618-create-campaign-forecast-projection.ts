import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789992172618)
export class CreateCampaignForecastProjectionFastInstanceCommand implements FastInstanceCommand {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_CO_FORECAST_PENDING" ON core."campaignOccurrence" ("workspaceId","dueAt",id) WHERE state='PENDING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CO_OVERVIEW" ON core."campaignOccurrence" ("workspaceId","dueAt",id)`,
    );
    await queryRunner.query(`CREATE TABLE core."campaignForecastHead" (
      "workspaceId" uuid NOT NULL,
      "scopeKey" text NOT NULL,
      "inputRevision" bigint NOT NULL DEFAULT 1,
      "currentGenerationId" uuid,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_CAMPAIGN_FORECAST_HEAD" PRIMARY KEY ("workspaceId","scopeKey"),
      CONSTRAINT "CHK_CFH_SCOPE_NONEMPTY" CHECK (btrim("scopeKey") <> ''),
      CONSTRAINT "CHK_CFH_REVISION_POSITIVE" CHECK ("inputRevision" > 0)
    )`);
    await queryRunner.query(`CREATE TABLE core."campaignForecastGeneration" (
      id uuid NOT NULL,
      "workspaceId" uuid NOT NULL,
      "scopeKey" text NOT NULL,
      "inputRevision" bigint NOT NULL,
      "generatedAt" timestamptz NOT NULL,
      "horizonEndsAt" timestamptz NOT NULL,
      complete boolean NOT NULL,
      "evaluatedCount" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_CAMPAIGN_FORECAST_GENERATION" PRIMARY KEY (id),
      CONSTRAINT "UQ_CFG_SCOPE_ID" UNIQUE ("workspaceId","scopeKey",id),
      CONSTRAINT "FK_CFG_HEAD" FOREIGN KEY ("workspaceId","scopeKey") REFERENCES core."campaignForecastHead"("workspaceId","scopeKey") ON DELETE CASCADE,
      CONSTRAINT "CHK_CFG_HORIZON_ORDER" CHECK ("horizonEndsAt" > "generatedAt"),
      CONSTRAINT "CHK_CFG_EVALUATED_NONNEGATIVE" CHECK ("evaluatedCount" >= 0)
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_CFG_SCOPE_CREATED" ON core."campaignForecastGeneration" ("workspaceId","scopeKey","generatedAt",id)`,
    );
    await queryRunner.query(
      `ALTER TABLE core."campaignForecastHead" ADD CONSTRAINT "FK_CFH_CURRENT_GENERATION" FOREIGN KEY ("workspaceId","scopeKey","currentGenerationId") REFERENCES core."campaignForecastGeneration"("workspaceId","scopeKey",id) ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE TABLE core."campaignForecastEntry" (
      "generationId" uuid NOT NULL,
      "occurrenceId" uuid NOT NULL,
      "workspaceId" uuid NOT NULL,
      "campaignId" uuid NOT NULL,
      "connectedAccountId" uuid,
      "estimatedSendAt" timestamptz,
      CONSTRAINT "PK_CAMPAIGN_FORECAST_ENTRY" PRIMARY KEY ("generationId","occurrenceId"),
      CONSTRAINT "FK_CFE_GENERATION" FOREIGN KEY ("generationId") REFERENCES core."campaignForecastGeneration"(id) ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_CFE_WORKSPACE_CAMPAIGN" ON core."campaignForecastEntry" ("workspaceId","campaignId","generationId","occurrenceId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE core."campaignForecastEntry"`);
    await queryRunner.query(
      `ALTER TABLE core."campaignForecastHead" DROP CONSTRAINT "FK_CFH_CURRENT_GENERATION"`,
    );
    await queryRunner.query(`DROP TABLE core."campaignForecastGeneration"`);
    await queryRunner.query(`DROP TABLE core."campaignForecastHead"`);
    await queryRunner.query(`DROP INDEX core."IDX_CO_OVERVIEW"`);
    await queryRunner.query(`DROP INDEX core."IDX_CO_FORECAST_PENDING"`);
  }
}
