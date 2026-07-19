import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

import { CreateManagedProviderFundingActionFastInstanceCommand } from '../2-19-instance-command-fast-1784266302003-create-managed-provider-funding-action';

describe('CreateManagedProviderFundingActionFastInstanceCommand', () => {
  it('has a distinct registered 2.19 identity and is in the production registry', () => {
    expect(
      getRegisteredInstanceCommandMetadata(
        CreateManagedProviderFundingActionFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1784266302003,
      type: 'fast',
      version: '2.19.0',
    });
    expect(INSTANCE_COMMANDS).toContain(
      CreateManagedProviderFundingActionFastInstanceCommand,
    );
  });

  it('repairs both upgraded and fresh installations idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command = new CreateManagedProviderFundingActionFastInstanceCommand();

    await command.up({ query } as never);

    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS "core"."managedProviderFundingAction"',
    );
    expect(query.mock.calls[1][0]).toContain('ADD COLUMN IF NOT EXISTS');
    expect(query.mock.calls[4][0]).toContain('ON DELETE SET NULL');
  });

  it('does not drop a table that may be owned by the shipped 2.19 command', async () => {
    const query = jest.fn();
    const command = new CreateManagedProviderFundingActionFastInstanceCommand();

    await command.down({ query } as never);

    expect(query).not.toHaveBeenCalled();
  });
});
