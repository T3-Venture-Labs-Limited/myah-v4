import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.19.0', 1784112963056)
export class CreateManagedProviderBillingFoundationFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."myahWorkspaceInstallation" ADD "metronomeCustomerId" uuid',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE" ON "core"."myahWorkspaceInstallation" ("metronomeCustomerId") WHERE "metronomeCustomerId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."managedProviderOperation" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorUserWorkspaceId" uuid, "requestId" text NOT NULL, "providerKey" text NOT NULL, "providerConfigurationKey" text NOT NULL, "operationKey" text NOT NULL, "metronomeEventType" text NOT NULL, "maximumUsageProperties" jsonb NOT NULL, "actualUsageProperties" jsonb, "reservedAmountCents" bigint NOT NULL, "quotedActualAmountCents" bigint, "providerExecutionId" text, "providerCostMicrousd" bigint, "state" text NOT NULL DEFAULT \'RESERVED\', "deliveryAttemptCount" integer NOT NULL DEFAULT 0, "settlementAttemptCount" integer NOT NULL DEFAULT 0, "nextDeliveryAttemptAt" TIMESTAMP WITH TIME ZONE, "settleAfter" TIMESTAMP WITH TIME ZONE, "lastDeliveryErrorCode" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, "metronomeAcceptedAt" TIMESTAMP WITH TIME ZONE, "settledAt" TIMESTAMP WITH TIME ZONE, "releasedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_MANAGED_PROVIDER_OPERATION" PRIMARY KEY ("id"), CONSTRAINT "UQ_MANAGED_PROVIDER_OPERATION_WORKSPACE_REQUEST" UNIQUE ("workspaceId", "requestId"), CONSTRAINT "FK_MANAGED_PROVIDER_OPERATION_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_RESERVED_AMOUNT_NON_NEGATIVE" CHECK ("reservedAmountCents" >= 0), CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_QUOTED_AMOUNT_NON_NEGATIVE" CHECK ("quotedActualAmountCents" IS NULL OR "quotedActualAmountCents" >= 0), CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_PROVIDER_COST_NON_NEGATIVE" CHECK ("providerCostMicrousd" IS NULL OR "providerCostMicrousd" >= 0), CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_STATE" CHECK ("state" IN (\'RESERVED\', \'USAGE_PENDING\', \'USAGE_ACCEPTED\', \'USAGE_SETTLED\', \'RELEASED\', \'RECONCILIATION_REQUIRED\')), CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_STATE_FIELDS" CHECK (("state" NOT IN (\'USAGE_ACCEPTED\', \'USAGE_SETTLED\') OR ("metronomeAcceptedAt" IS NOT NULL AND "settleAfter" IS NOT NULL)) AND ("state" <> \'USAGE_SETTLED\' OR "settledAt" IS NOT NULL) AND ("state" <> \'RELEASED\' OR "releasedAt" IS NOT NULL)))',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderOperation" ADD "expectedProductIds" jsonb NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderOperation" ADD "expectedBillableMetricIds" jsonb NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderOperation" ADD "completionOutcome" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderOperation" ADD "deliveryEventAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_MANAGED_PROVIDER_OPERATION_PROVIDER_EXECUTION_UNIQUE" ON "core"."managedProviderOperation" ("providerKey", "providerConfigurationKey", "providerExecutionId") WHERE "providerExecutionId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_MANAGED_PROVIDER_OPERATION_DELIVERY_DUE" ON "core"."managedProviderOperation" ("nextDeliveryAttemptAt") WHERE "state" = \'USAGE_PENDING\'',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_MANAGED_PROVIDER_OPERATION_STALE_RESERVATION" ON "core"."managedProviderOperation" ("createdAt") WHERE "state" IN (\'RESERVED\', \'RECONCILIATION_REQUIRED\')',
    );
    await queryRunner.query(
      'CREATE TABLE "core"."managedProviderFundingAction" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "fundingType" text NOT NULL, "actionType" text NOT NULL, "operatorIdentity" text NOT NULL, "permissionUsed" text NOT NULL, "idempotencyKey" text NOT NULL, "externalReference" text NOT NULL, "metronomeUniquenessKey" text NOT NULL, "amountCents" bigint NOT NULL, "currency" text NOT NULL DEFAULT \'USD\', "reason" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE, "applicability" jsonb, "paymentEvidence" jsonb, "correctedOperationId" uuid, "correctionOfActionId" uuid, "state" text NOT NULL DEFAULT \'PENDING\', "metronomeEditId" text, "creditId" text, "commitmentId" text, "externalResourceId" text, "safeErrorCode" text, "failureCode" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_MANAGED_PROVIDER_FUNDING_ACTION" PRIMARY KEY ("id"), CONSTRAINT "UQ_MANAGED_PROVIDER_FUNDING_ACTION_IDEMPOTENCY" UNIQUE ("workspaceId", "idempotencyKey"), CONSTRAINT "UQ_MANAGED_PROVIDER_FUNDING_ACTION_EXTERNAL_REFERENCE" UNIQUE ("externalReference"), CONSTRAINT "UQ_MANAGED_PROVIDER_FUNDING_ACTION_METRONOME_KEY" UNIQUE ("metronomeUniquenessKey"), CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_AMOUNT_POSITIVE" CHECK ("amountCents" > 0), CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_STATE" CHECK ("state" IN (\'PENDING\', \'SUCCEEDED\', \'RECONCILIATION_REQUIRED\', \'FAILED_DEFINITIVE\')), CONSTRAINT "FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE)',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_MANAGED_PROVIDER_FUNDING_ACTION_PENDING" ON "core"."managedProviderFundingAction" ("state", "createdAt") WHERE "state" IN (\'PENDING\', \'RECONCILIATION_REQUIRED\')',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE "core"."managedProviderFundingAction"',
    );
    await queryRunner.query('DROP TABLE "core"."managedProviderOperation"');
    await queryRunner.query(
      'DROP INDEX "core"."IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."myahWorkspaceInstallation" DROP COLUMN "metronomeCustomerId"',
    );
  }
}
