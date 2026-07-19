import { type EntityManager, type Repository } from 'typeorm';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { MigrateOpenRouterModelIdentitiesCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1784485121000-migrate-openrouter-model-identities.command';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

describe('MigrateOpenRouterModelIdentitiesCommand', () => {
  const workspaceId = '20202020-0000-0000-0000-000000000001';
  let command: MigrateOpenRouterModelIdentitiesCommand;
  let transaction: jest.Mock;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn();
    transaction = jest.fn(async (callback: (manager: EntityManager) => unknown) =>
      callback({
        getRepository: () => ({ query }),
      } as unknown as EntityManager),
    );

    const workspaceRepository = {
      manager: { transaction },
    } as unknown as Repository<WorkspaceEntity>;

    command = new MigrateOpenRouterModelIdentitiesCommand(
      {} as WorkspaceIteratorService,
      workspaceRepository,
    );

    jest.spyOn(command['logger'], 'log').mockImplementation();
  });

  it('migrates every legacy OpenRouter reference, including a slug now reserved for managed OpenRouter', async () => {
    await command.runOnWorkspace({
      workspaceId,
      options: { dryRun: false },
      index: 0,
      total: 1,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual([
      'openrouter-custom/',
      'openrouter/',
      workspaceId,
    ]);
    expect(query.mock.calls[1][1]).toEqual([
      'openrouter-custom/',
      'openrouter/',
      workspaceId,
    ]);
    expect(query.mock.calls[0][0]).toContain('substring("fastModel"');
    expect(query.mock.calls[0][0]).toContain('smartModel" LIKE $2 || \'%\'');
    expect(query.mock.calls[0][0]).toContain('routerModel" LIKE $2 || \'%\'');
    expect(query.mock.calls[0][0]).toContain('model_id LIKE $2 || \'%\'');
    expect(query.mock.calls[1][0]).toContain('"modelId" LIKE $2 || \'%\'');
    expect(query.mock.calls[1][0]).toContain('substring("modelId"');
    expect(query.mock.calls[0][0]).not.toContain('ALL(');
    expect(query.mock.calls[1][0]).not.toContain('ALL(');
  });

  it('does not write in dry-run mode', async () => {
    await command.runOnWorkspace({
      workspaceId,
      options: { dryRun: true },
      index: 0,
      total: 1,
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
