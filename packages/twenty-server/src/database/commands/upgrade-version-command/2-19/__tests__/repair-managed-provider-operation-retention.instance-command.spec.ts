import { RepairManagedProviderOperationRetentionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784488000000-repair-managed-provider-operation-retention';

describe('managed provider operation retention repair', () => {
  it('removes the cascading workspace FK without mutating journal rows', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command = new RepairManagedProviderOperationRetentionFastInstanceCommand();

    await command.up({ query } as never);

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT IF EXISTS "FK_MANAGED_PROVIDER_OPERATION_WORKSPACE"',
    ]);
  });

  it('has a no-op rollback because the foundation owns this schema', async () => {
    const query = jest.fn();
    const command = new RepairManagedProviderOperationRetentionFastInstanceCommand();

    await command.down({ query } as never);

    expect(query).not.toHaveBeenCalled();
  });
});
