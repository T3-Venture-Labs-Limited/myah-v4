import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1786000000000)
export class AddManagedEmailLifecycleFieldsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "nextSubscriptionReconciliationAt" timestamptz');
    await queryRunner.query('ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "pendingRenewalProjection" jsonb');
    await queryRunner.query('CREATE INDEX "IDX_MANAGED_EMAIL_ACQUISITION_SUBSCRIPTION_RECONCILIATION_DUE" ON "core"."managedEmailAcquisitionOperation" ("nextSubscriptionReconciliationAt") WHERE "nextSubscriptionReconciliationAt" IS NOT NULL');
    await queryRunner.query('ALTER TABLE "core"."managedEmailDomain" ADD "pendingLifecycleAction" text');
    await queryRunner.query('ALTER TABLE "core"."managedEmailDomain" ADD "pendingLifecycleKey" text');
    await queryRunner.query('ALTER TABLE "core"."managedEmailDomain" ADD "nextPeriodBoundaryAt" timestamptz');
    await queryRunner.query('CREATE INDEX "IDX_MANAGED_EMAIL_DOMAIN_PERIOD_BOUNDARY_DUE" ON "core"."managedEmailDomain" ("nextPeriodBoundaryAt") WHERE "nextPeriodBoundaryAt" IS NOT NULL');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" ADD "infrastructureCancelAtPeriodEnd" boolean NOT NULL DEFAULT false');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" ADD "pendingLifecycleAction" text');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" ADD "pendingLifecycleKey" text');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" ADD "nextPeriodBoundaryAt" timestamptz');
    await queryRunner.query('CREATE INDEX "IDX_MANAGED_EMAIL_MAILBOX_PERIOD_BOUNDARY_DUE" ON "core"."managedEmailMailbox" ("nextPeriodBoundaryAt") WHERE "nextPeriodBoundaryAt" IS NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "core"."IDX_MANAGED_EMAIL_MAILBOX_PERIOD_BOUNDARY_DUE"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" DROP COLUMN "nextPeriodBoundaryAt"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" DROP COLUMN "pendingLifecycleKey"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" DROP COLUMN "pendingLifecycleAction"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailMailbox" DROP COLUMN "infrastructureCancelAtPeriodEnd"');
    await queryRunner.query('DROP INDEX "core"."IDX_MANAGED_EMAIL_DOMAIN_PERIOD_BOUNDARY_DUE"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailDomain" DROP COLUMN "nextPeriodBoundaryAt"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailDomain" DROP COLUMN "pendingLifecycleKey"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailDomain" DROP COLUMN "pendingLifecycleAction"');
    await queryRunner.query('DROP INDEX "core"."IDX_MANAGED_EMAIL_ACQUISITION_SUBSCRIPTION_RECONCILIATION_DUE"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "pendingRenewalProjection"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "nextSubscriptionReconciliationAt"');
  }
}
