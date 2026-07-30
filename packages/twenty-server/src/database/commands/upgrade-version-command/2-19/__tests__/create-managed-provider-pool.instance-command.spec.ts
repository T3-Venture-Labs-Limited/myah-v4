import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

import { CreateManagedProviderPoolFastInstanceCommand } from '../2-19-instance-command-fast-1784486000000-create-managed-provider-pool';

describe('CreateManagedProviderPoolFastInstanceCommand', () => {
  it('has a distinct registered 2.19 identity and is in the production registry', () => {
    expect(
      getRegisteredInstanceCommandMetadata(
        CreateManagedProviderPoolFastInstanceCommand,
      ),
    ).toEqual({
      runAfterWorkspace: false,
      timestamp: 1784486000000,
      type: 'fast',
      version: '2.19.0',
    });
    expect(INSTANCE_COMMANDS).toContain(
      CreateManagedProviderPoolFastInstanceCommand,
    );
  });

  it('repairs upgraded and fresh installations idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command = new CreateManagedProviderPoolFastInstanceCommand();

    await command.up({ query } as never);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS "core"."managedProviderPool"',
    );
  });

  it('does not drop the durable admission fence during rollback', async () => {
    const query = jest.fn();
    const command = new CreateManagedProviderPoolFastInstanceCommand();

    await command.down({ query } as never);

    expect(query).not.toHaveBeenCalled();
  });
});
