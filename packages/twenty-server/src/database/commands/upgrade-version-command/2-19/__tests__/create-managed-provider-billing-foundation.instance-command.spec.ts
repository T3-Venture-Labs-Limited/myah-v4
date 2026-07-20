import { type QueryRunner } from 'typeorm';

import { CreateManagedProviderBillingFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963056-create-managed-provider-billing-foundation';

describe('CreateManagedProviderBillingFoundationFastInstanceCommand', () => {
  let command: CreateManagedProviderBillingFoundationFastInstanceCommand;

  beforeEach(() => {
    command = new CreateManagedProviderBillingFoundationFastInstanceCommand();
  });

  describe('up', () => {
    it('creates the workspace mapping and durable operation journal constraints', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const queryRunner = { query } as unknown as QueryRunner;

      await command.up(queryRunner);

      const statements = query.mock.calls.map((call) => call[0] as string);

      expect(statements).toContain(
        'ALTER TABLE "core"."myahWorkspaceInstallation" ADD "metronomeCustomerId" uuid',
      );
      expect(statements).toContain(
        'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE" ON "core"."myahWorkspaceInstallation" ("metronomeCustomerId") WHERE "metronomeCustomerId" IS NOT NULL',
      );
      expect(
        statements.some((statement) =>
          statement.includes('CREATE TABLE "core"."managedProviderOperation"'),
        ),
      ).toBe(true);
      expect(
        statements.some((statement) =>
          statement.includes('"expectedProductIds" jsonb NOT NULL'),
        ),
      ).toBe(true);
      expect(statements).toContain(
        'ALTER TABLE "core"."managedProviderOperation" ADD "expectedBillableMetricIds" jsonb NOT NULL',
      );
      expect(statements).toContain(
        'ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT IF EXISTS "FK_MANAGED_PROVIDER_OPERATION_WORKSPACE"',
      );
      expect(
        statements.some((statement) =>
          statement.includes(
            'CONSTRAINT "UQ_MANAGED_PROVIDER_OPERATION_WORKSPACE_REQUEST" UNIQUE ("workspaceId", "requestId")',
          ),
        ),
      ).toBe(true);
      expect(statements).toContain(
        'CREATE UNIQUE INDEX "IDX_MANAGED_PROVIDER_OPERATION_PROVIDER_EXECUTION_UNIQUE" ON "core"."managedProviderOperation" ("providerKey", "providerConfigurationKey", "providerExecutionId") WHERE "providerExecutionId" IS NOT NULL',
      );
      expect(statements).toContain(
        'CREATE INDEX "IDX_MANAGED_PROVIDER_OPERATION_DELIVERY_DUE" ON "core"."managedProviderOperation" ("nextDeliveryAttemptAt") WHERE "state" = \'USAGE_PENDING\'',
      );
      expect(statements).toContain(
        'CREATE INDEX "IDX_MANAGED_PROVIDER_OPERATION_STALE_RESERVATION" ON "core"."managedProviderOperation" ("createdAt") WHERE "state" IN (\'RESERVED\', \'RECONCILIATION_REQUIRED\')',
      );
      expect(
        statements.some((statement) =>
          statement.includes(
            'CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_RESERVED_AMOUNT_NON_NEGATIVE" CHECK ("reservedAmountCents" >= 0)',
          ),
        ),
      ).toBe(true);
      expect(
        statements.some((statement) =>
          statement.includes(
            'CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_STATE_FIELDS" CHECK',
          ),
        ),
      ).toBe(true);
      expect(
        statements.some((statement) =>
          statement.includes(
            'CREATE TABLE "core"."managedProviderFundingAction"',
          ),
        ),
      ).toBe(true);
      expect(
        statements.some((statement) =>
          statement.includes(
            'CONSTRAINT "UQ_MANAGED_PROVIDER_FUNDING_ACTION_IDEMPOTENCY" UNIQUE ("workspaceId", "idempotencyKey")',
          ),
        ),
      ).toBe(true);
      expect(statements).toContain(
        'CREATE INDEX "IDX_MANAGED_PROVIDER_FUNDING_ACTION_PENDING" ON "core"."managedProviderFundingAction" ("state", "createdAt") WHERE "state" IN (\'PENDING\', \'RECONCILIATION_REQUIRED\')',
      );
      expect(statements).toContain(
        'ALTER TABLE "core"."managedProviderFundingAction" ADD COLUMN IF NOT EXISTS "applicableProductIds" jsonb, ADD COLUMN IF NOT EXISTS "creditProductId" text',
      );
      expect(statements).toContain(
        'ALTER TABLE "core"."managedProviderFundingAction" ADD CONSTRAINT "FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE SET NULL',
      );
    });
  });

  describe('down', () => {
    it('drops only the journal and installation mapping in reverse dependency order', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const queryRunner = { query } as unknown as QueryRunner;

      await command.down(queryRunner);

      expect(query.mock.calls.map((call) => call[0] as string)).toEqual([
        'DROP TABLE "core"."managedProviderFundingAction"',
        'DROP TABLE "core"."managedProviderOperation"',
        'DROP INDEX "core"."IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE"',
        'ALTER TABLE "core"."myahWorkspaceInstallation" DROP COLUMN "metronomeCustomerId"',
      ]);
    });
  });
});
