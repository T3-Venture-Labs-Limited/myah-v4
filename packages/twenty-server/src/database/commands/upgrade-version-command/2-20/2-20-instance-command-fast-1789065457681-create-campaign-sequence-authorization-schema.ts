import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789065457681)
export class CreateCampaignSequenceAuthorizationSchemaFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "core"."campaignSequenceAuthorization_state_enum" AS ENUM('ACTIVE', 'REVOKED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "core"."campaignSequenceAuthorization_revocationReason_enum" AS ENUM('CAMPAIGN_PAUSED', 'CAMPAIGN_COMPLETED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "core"."campaignSequenceAuthorization" ("authorizationId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "campaignId" uuid NOT NULL, "campaignExecutionId" uuid NOT NULL, "generation" integer NOT NULL, "startIdempotencyKey" uuid NOT NULL, "preparedFingerprint" character varying(64) NOT NULL, "workflowId" uuid NOT NULL, "workflowVersionId" uuid NOT NULL, "initiatingUserWorkspaceId" uuid NOT NULL, "state" "core"."campaignSequenceAuthorization_state_enum" NOT NULL, "authorizedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "revocationReason" "core"."campaignSequenceAuthorization_revocationReason_enum", "binding" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_CSA_SCOPE_GENERATION" UNIQUE ("workspaceId", "campaignId", "generation"), CONSTRAINT "UQ_CSA_SCOPE_START_KEY" UNIQUE ("workspaceId", "campaignId", "startIdempotencyKey"), CONSTRAINT "UQ_CSA_SCOPE_AUTH_VERSION" UNIQUE ("workspaceId", "campaignId", "authorizationId", "workflowVersionId"), CONSTRAINT "UQ_CSA_SCOPE_AUTHORIZATION" UNIQUE ("workspaceId", "campaignId", "authorizationId"), CONSTRAINT "CHK_CSA_REVOCATION_SHAPE" CHECK (("state" = 'ACTIVE' AND "revokedAt" IS NULL AND "revocationReason" IS NULL) OR ("state" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revocationReason" IS NOT NULL)), CONSTRAINT "CHK_CSA_STATE" CHECK ("state" IN ('ACTIVE', 'REVOKED')), CONSTRAINT "CHK_CSA_PREPARED_FINGERPRINT" CHECK ("preparedFingerprint" ~ '^[0-9a-f]{64}$'), CONSTRAINT "CHK_CSA_GENERATION_POSITIVE" CHECK ("generation" > 0), CONSTRAINT "PK_CAMPAIGN_SEQUENCE_AUTHORIZATION" PRIMARY KEY ("authorizationId"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_CSA_ONE_ACTIVE_SCOPE" ON "core"."campaignSequenceAuthorization" ("workspaceId", "campaignId") WHERE "state" = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "core"."UQ_CSA_ONE_ACTIVE_SCOPE"',
    );
    await queryRunner.query('DROP TABLE "core"."campaignSequenceAuthorization"');
    await queryRunner.query(
      'DROP TYPE "core"."campaignSequenceAuthorization_revocationReason_enum"',
    );
    await queryRunner.query(
      'DROP TYPE "core"."campaignSequenceAuthorization_state_enum"',
    );
  }
}
