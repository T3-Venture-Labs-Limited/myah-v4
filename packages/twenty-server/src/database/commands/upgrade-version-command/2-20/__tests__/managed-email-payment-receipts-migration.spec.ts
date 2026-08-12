import { type DataSource, type QueryRunner } from 'typeorm';

import { AddManagedEmailPaymentReceiptsColumnFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1786000004000-add-managed-email-payment-receipts-column';
import { MigrateManagedEmailPaymentReceiptsSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1786000004001-migrate-managed-email-payment-receipts';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('managed email payment receipt migration', () => {
  const fastCommand =
    new AddManagedEmailPaymentReceiptsColumnFastInstanceCommand();
  const slowCommand =
    new MigrateManagedEmailPaymentReceiptsSlowInstanceCommand();

  it('registers the schema phase before the data and cutover phase', () => {
    expect(
      getRegisteredInstanceCommandMetadata(
        AddManagedEmailPaymentReceiptsColumnFastInstanceCommand,
      ),
    ).toEqual({
      version: '2.20.0',
      timestamp: 1786000004000,
      type: 'fast',
      runAfterWorkspace: false,
    });
    expect(
      getRegisteredInstanceCommandMetadata(
        MigrateManagedEmailPaymentReceiptsSlowInstanceCommand,
      ),
    ).toEqual({
      version: '2.20.0',
      timestamp: 1786000004001,
      type: 'slow',
      runAfterWorkspace: false,
    });
    expect(slowCommand.runDataMigrationWithoutWorkspaces).toBe(true);
    expect(
      INSTANCE_COMMANDS.filter(
        (candidate) =>
          candidate ===
            AddManagedEmailPaymentReceiptsColumnFastInstanceCommand ||
          candidate === MigrateManagedEmailPaymentReceiptsSlowInstanceCommand,
      ),
    ).toEqual([
      AddManagedEmailPaymentReceiptsColumnFastInstanceCommand,
      MigrateManagedEmailPaymentReceiptsSlowInstanceCommand,
    ]);
  });

  it('adds and removes only the new nullable column in the fast phase', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await fastCommand.up(queryRunner);
    await fastCommand.down(queryRunner);

    expect(query.mock.calls.map((call) => call[0])).toEqual([
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "paymentReceipts" jsonb',
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "paymentReceipts"',
    ]);
  });

  it('preflights and backfills complete receipts before schema cutover', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          hasInvalidReceiptRows: false,
          hasInvalidRenewalProjections: false,
        },
      ])
      .mockResolvedValue(undefined);

    await slowCommand.runDataMigration({
      query,
    } as unknown as DataSource);

    const statements = query.mock.calls.map((call) => call[0] as string);

    expect(statements[0]).toContain('WITH normalized AS');
    expect(statements[0]).toContain(
      '"pendingRenewalProjection"->\'receipts\'->0',
    );
    expect(statements[0]).toContain('AS "hasInvalidReceiptRows"');
    expect(statements[0]).toContain('AS "hasInvalidRenewalProjections"');
    expect(statements[0]).toContain('btrim("externalInvoiceId") <>');
    expect(statements.slice(1)).toEqual([
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "paymentReceipts" = jsonb_build_array(jsonb_build_object(\'externalInvoiceId\', "externalInvoiceId", \'externalPaymentId\', "externalPaymentId", \'metronomeInvoiceId\', "metronomeInvoiceId")) WHERE "externalInvoiceId" IS NOT NULL AND "externalPaymentId" IS NOT NULL AND "metronomeInvoiceId" IS NOT NULL',
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "pendingRenewalProjection" = jsonb_build_object(\'receipts\', jsonb_build_array("pendingRenewalProjection"->\'receipt\'), \'resources\', "pendingRenewalProjection"->\'resources\') WHERE "pendingRenewalProjection" IS NOT NULL AND "pendingRenewalProjection" ? \'receipt\'',
    ]);
  });

  it('rejects invalid legacy rows before running either backfill', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        hasInvalidReceiptRows: true,
        hasInvalidRenewalProjections: false,
      },
    ]);

    await expect(
      slowCommand.runDataMigration({ query } as unknown as DataSource),
    ).rejects.toThrow('Managed email payment receipt migration preflight failed');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preflights converted projections before dropping legacy columns', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ hasInvalidRenewalProjections: false }])
      .mockResolvedValue(undefined);

    await slowCommand.up({ query } as unknown as QueryRunner);

    const statements = query.mock.calls.map((call) => call[0] as string);

    expect(statements[0]).toContain('AS "hasInvalidRenewalProjections"');
    expect(statements.slice(1)).toEqual([
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "metronomeInvoiceId"',
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "externalInvoiceId"',
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" DROP COLUMN "externalPaymentId"',
    ]);
  });

  it('rejects incomplete conversion before dropping legacy columns', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ hasInvalidRenewalProjections: true }]);

    await expect(
      slowCommand.up({ query } as unknown as QueryRunner),
    ).rejects.toThrow(
      'Managed email payment receipt cutover preflight failed',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('restores one-receipt legacy state before fast rollback removes the new column', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          hasInvalidPaymentReceipts: false,
          hasInvalidRenewalProjections: false,
        },
      ])
      .mockResolvedValue(undefined);

    await slowCommand.down({ query } as unknown as QueryRunner);

    const statements = query.mock.calls.map((call) => call[0] as string);

    expect(statements[0]).toContain('AS "hasInvalidPaymentReceipts"');
    expect(statements[0]).toContain('AS "hasInvalidRenewalProjections"');
    expect(statements.slice(1)).toEqual([
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "metronomeInvoiceId" uuid',
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "externalInvoiceId" text',
      'ALTER TABLE "core"."managedEmailAcquisitionOperation" ADD "externalPaymentId" text',
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "metronomeInvoiceId" = NULLIF("paymentReceipts"->0->>\'metronomeInvoiceId\', \'\')::uuid, "externalInvoiceId" = NULLIF("paymentReceipts"->0->>\'externalInvoiceId\', \'\'), "externalPaymentId" = NULLIF("paymentReceipts"->0->>\'externalPaymentId\', \'\') WHERE "paymentReceipts" IS NOT NULL',
      'UPDATE "core"."managedEmailAcquisitionOperation" SET "pendingRenewalProjection" = jsonb_build_object(\'receipt\', "pendingRenewalProjection"->\'receipts\'->0, \'resources\', "pendingRenewalProjection"->\'resources\') WHERE "pendingRenewalProjection" IS NOT NULL',
    ]);
  });

  it('rejects multi-receipt rollback before mutating the schema', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        hasInvalidPaymentReceipts: true,
        hasInvalidRenewalProjections: false,
      },
    ]);

    await expect(
      slowCommand.down({ query } as unknown as QueryRunner),
    ).rejects.toThrow('Managed email payment receipt rollback preflight failed');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
