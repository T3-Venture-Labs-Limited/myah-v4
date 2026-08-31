import { type QueryRunner } from 'typeorm';

import { ExtendManagedProviderFundingActionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1788163457871-extend-managed-provider-funding-action';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('ExtendManagedProviderFundingActionFastInstanceCommand', () => {
  it('is registered as the 2.20 fast command at its reserved timestamp', () => {
    expect(INSTANCE_COMMANDS).toContain(
      ExtendManagedProviderFundingActionFastInstanceCommand,
    );
    expect(
      getRegisteredInstanceCommandMetadata(
        ExtendManagedProviderFundingActionFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1788163457871,
      type: 'fast',
      version: '2.20.0',
    });
  });

  it('replaces the funding state check with all paid lifecycle states', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new ExtendManagedProviderFundingActionFastInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');
    expect(sql).toContain(
      'DROP CONSTRAINT IF EXISTS "CHK_MANAGED_PROVIDER_FUNDING_ACTION_STATE"',
    );
    expect(sql).toContain(
      'CHECK ("state" IN (\'PENDING\', \'METRONOME_EDIT_RECORDED\', \'PAYMENT_PENDING\', \'PAYMENT_ACTION_REQUIRED\', \'RECONCILIATION_REQUIRED\', \'SUCCEEDED\', \'FAILED_DEFINITIVE\', \'REFUND_INTENT_RECORDED\', \'REFUND_RECONCILIATION_REQUIRED\', \'REFUNDED\'))',
    );
  });

  it('normalizes expanded states before restoring the original check on down', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new ExtendManagedProviderFundingActionFastInstanceCommand().down({
      query,
    } as unknown as QueryRunner);

    const statements = query.mock.calls.map(
      ([statement]) => statement as string,
    );
    expect(statements[1]).toContain(
      'SET "state" = \'RECONCILIATION_REQUIRED\'',
    );
    expect(statements[2]).toContain(
      'DROP CONSTRAINT IF EXISTS "CHK_MANAGED_PROVIDER_FUNDING_ACTION_STATE"',
    );
    expect(statements[3]).toContain(
      'CHECK ("state" IN (\'PENDING\', \'SUCCEEDED\', \'RECONCILIATION_REQUIRED\', \'FAILED_DEFINITIVE\'))',
    );
  });
});
