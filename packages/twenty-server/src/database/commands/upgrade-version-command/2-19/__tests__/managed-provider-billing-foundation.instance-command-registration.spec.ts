import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';

import { CreateManagedProviderBillingFoundationFastInstanceCommand } from '../2-19-instance-command-fast-1784112963056-create-managed-provider-billing-foundation';

describe('managed-provider billing foundation migration registration', () => {
  it('registers the fast schema command in the instance command registry', () => {
    expect(INSTANCE_COMMANDS).toContain(
      CreateManagedProviderBillingFoundationFastInstanceCommand,
    );
  });
});
