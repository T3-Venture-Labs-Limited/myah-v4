import { ConnectedAccountProvider } from 'twenty-shared/types';

import { RetireShopifyConnectionsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000411-retire-shopify-connections.command';

const workspaceId = '20202020-0000-4000-8000-000000000001';

const createCommand = (count: number) => {
  const repository = {
    countBy: jest.fn().mockResolvedValue(count),
    update: jest.fn().mockResolvedValue({ affected: count }),
  };

  return {
    command: new RetireShopifyConnectionsCommand(
      {} as never,
      repository as never,
    ),
    repository,
  };
};

describe('RetireShopifyConnectionsCommand', () => {
  it('reports without mutating during a dry run', async () => {
    const { command, repository } = createCommand(1);

    await command.runOnWorkspace({
      index: 0,
      options: { dryRun: true },
      total: 1,
      workspaceId,
    });

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('archives only active Shopify app connections and is repeat-safe', async () => {
    const { command, repository } = createCommand(1);

    await command.runOnWorkspace({
      index: 0,
      options: {},
      total: 1,
      workspaceId,
    });

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Shopify',
        provider: ConnectedAccountProvider.APP,
        workspaceId,
      }),
      { archivedAt: expect.any(Date) },
    );

    repository.countBy.mockResolvedValueOnce(0);
    await command.runOnWorkspace({
      index: 0,
      options: {},
      total: 1,
      workspaceId,
    });

    expect(repository.update).toHaveBeenCalledTimes(1);
  });
});
