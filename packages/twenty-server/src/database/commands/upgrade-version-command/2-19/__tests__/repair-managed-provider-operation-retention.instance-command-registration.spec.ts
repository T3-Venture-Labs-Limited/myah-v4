import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';

import { RepairManagedProviderOperationRetentionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784488000000-repair-managed-provider-operation-retention';

describe('managed provider operation retention migration registration', () => {
  it('registers the repair command in the instance command registry', () => {
    expect(
      INSTANCE_COMMANDS.some(
        (command) =>
          command.name ===
          RepairManagedProviderOperationRetentionFastInstanceCommand.name,
      ),
    ).toBe(true);
  });
});
