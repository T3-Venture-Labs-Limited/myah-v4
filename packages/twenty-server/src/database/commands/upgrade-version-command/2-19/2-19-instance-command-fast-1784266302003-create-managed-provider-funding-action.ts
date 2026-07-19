import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

// The funding table was appended to an already-recorded 2.19 command.
// This distinct current-version identity repairs existing installations;
// IF NOT EXISTS also keeps fresh installs idempotent.
@RegisteredInstanceCommand('2.19.0', 1784266302003)
export class CreateManagedProviderFundingActionFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS "core"."managedProviderFundingAction" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" uuid NOT NULL, "fundingType" text NOT NULL, "actionType" text NOT NULL, "operatorIdentity" text NOT NULL, "permissionUsed" text NOT NULL, "idempotencyKey" text NOT NULL, "externalReference" text NOT NULL, "metronomeUniquenessKey" text NOT NULL, "amountCents" bigint NOT NULL, "currency" text NOT NULL DEFAULT \'USD\', "reason" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE, "applicability" jsonb, "paymentEvidence" jsonb, "correctedOperationId" uuid, "state" text NOT NULL DEFAULT \'PENDING\', "metronomeEditId" text, "creditId" text, "commitmentId" text, "externalResourceId" text, "safeErrorCode" text, "failureCode" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_MANAGED_PROVIDER_FUNDING_ACTION" PRIMARY KEY ("id"), CONSTRAINT "UQ_MANAGED_PROVIDER_FUNDING_ACTION_IDEMPOTENCY" UNIQUE ("workspaceId", "idempotencyKey"), CONSTRAINT "UQ_MANAGED_PROVIDER_FUNDING_ACTION_EXTERNAL_REFERENCE" UNIQUE ("externalReference"), CONSTRAINT "UQ_MANAGED_PROVIDER_FUNDING_ACTION_METRONOME_KEY" UNIQUE ("metronomeUniquenessKey"), CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_AMOUNT_POSITIVE" CHECK ("amountCents" > 0), CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_STATE" CHECK ("state" IN (\'PENDING\', \'SUCCEEDED\', \'RECONCILIATION_REQUIRED\', \'FAILED_DEFINITIVE\')), CONSTRAINT "FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE)',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderFundingAction" ADD COLUMN IF NOT EXISTS "applicableProductIds" jsonb, ADD COLUMN IF NOT EXISTS "creditProductId" text',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderFundingAction" ALTER COLUMN "workspaceId" DROP NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderFundingAction" DROP CONSTRAINT IF EXISTS "FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."managedProviderFundingAction" ADD CONSTRAINT "FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE SET NULL',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_MANAGED_PROVIDER_FUNDING_ACTION_PENDING" ON "core"."managedProviderFundingAction" ("state", "createdAt") WHERE "state" IN (\'PENDING\', \'RECONCILIATION_REQUIRED\')',
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Deliberately retained: this repair may be a no-op because the 2.19
    // command created the table, so down cannot safely infer ownership.
  }
}
