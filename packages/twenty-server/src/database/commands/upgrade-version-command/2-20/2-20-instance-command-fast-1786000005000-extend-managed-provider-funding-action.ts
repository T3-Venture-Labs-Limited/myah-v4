import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1786000005000)
export class ExtendManagedProviderFundingActionFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."managedProviderFundingAction"
       ADD COLUMN IF NOT EXISTS "metronomeCustomerId" text,
       ADD COLUMN IF NOT EXISTS "metronomeContractId" text,
       ADD COLUMN IF NOT EXISTS "metronomeInvoiceId" text,
       ADD COLUMN IF NOT EXISTS "stripeBillingConfigurationId" text,
       ADD COLUMN IF NOT EXISTS "stripeDeliveryMethodId" text,
       ADD COLUMN IF NOT EXISTS "stripeCustomerId" text,
       ADD COLUMN IF NOT EXISTS "stripeInvoiceId" text,
       ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" text,
       ADD COLUMN IF NOT EXISTS "stripeCreditNoteId" text,
       ADD COLUMN IF NOT EXISTS "stripeRefundId" text,
       ADD COLUMN IF NOT EXISTS "prepaidPrincipalCents" bigint,
       ADD COLUMN IF NOT EXISTS "taxCents" bigint,
       ADD COLUMN IF NOT EXISTS "collectedTotalCents" bigint,
       ADD COLUMN IF NOT EXISTS "paymentReceipt" jsonb,
       ADD COLUMN IF NOT EXISTS "refundReceipt" jsonb,
       ADD COLUMN IF NOT EXISTS "nextReconciliationAt" TIMESTAMP WITH TIME ZONE,
       ADD COLUMN IF NOT EXISTS "reconciliationClaimedAt" TIMESTAMP WITH TIME ZONE,
       ADD COLUMN IF NOT EXISTS "reconciliationAttemptCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MANAGED_PROVIDER_FUNDING_ACTION_RECONCILIATION_DUE"
       ON "core"."managedProviderFundingAction" ("state", "nextReconciliationAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."IDX_MANAGED_PROVIDER_FUNDING_ACTION_RECONCILIATION_DUE"',
    );
    await queryRunner.query(
      `ALTER TABLE "core"."managedProviderFundingAction"
       DROP COLUMN IF EXISTS "metronomeCustomerId",
       DROP COLUMN IF EXISTS "metronomeContractId",
       DROP COLUMN IF EXISTS "metronomeInvoiceId",
       DROP COLUMN IF EXISTS "stripeBillingConfigurationId",
       DROP COLUMN IF EXISTS "stripeDeliveryMethodId",
       DROP COLUMN IF EXISTS "stripeCustomerId",
       DROP COLUMN IF EXISTS "stripeInvoiceId",
       DROP COLUMN IF EXISTS "stripePaymentIntentId",
       DROP COLUMN IF EXISTS "stripeCreditNoteId",
       DROP COLUMN IF EXISTS "stripeRefundId",
       DROP COLUMN IF EXISTS "prepaidPrincipalCents",
       DROP COLUMN IF EXISTS "taxCents",
       DROP COLUMN IF EXISTS "collectedTotalCents",
       DROP COLUMN IF EXISTS "paymentReceipt",
       DROP COLUMN IF EXISTS "refundReceipt",
       DROP COLUMN IF EXISTS "nextReconciliationAt",
       DROP COLUMN IF EXISTS "reconciliationClaimedAt",
       DROP COLUMN IF EXISTS "reconciliationAttemptCount"`,
    );
  }
}
