import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

it('updates and rereads the custom application on the pinned runner, invalidating cache only after commit', async () => {
  const updated = {
    id: 'app',
    workspaceId: 'workspace',
    applicationRegistrationId: 'registration',
  };
  const update = jest.fn(async () => undefined);
  const findOne = jest.fn(async () => updated);
  const invalidateAndRecompute = jest.fn(async () => undefined);
  const pooledUpdate = jest.fn(() => {
    throw new Error('pooled update forbidden');
  });
  const pooledFindById = jest.fn(() => {
    throw new Error('pooled read cannot see pending update');
  });
  const effects: Array<() => Promise<void> | void> = [];
  const queryRunner = {
    manager: { getRepository: () => ({ update, findOne }) },
  } as never;
  const service = {
    applicationRepository: { update: pooledUpdate },
    workspaceCacheService: { invalidateAndRecompute },
    findById: pooledFindById,
  } as never;
  const transaction: UpgradeWorkspaceTransaction = {
    queryRunner,
    afterCommit: (effect) => effects.push(effect),
  };
  await expect(
    ApplicationService.prototype.update.call(
      service,
      'app',
      { workspaceId: 'workspace', applicationRegistrationId: 'registration' },
      transaction,
    ),
  ).resolves.toEqual(updated);
  expect(update).toHaveBeenCalledWith(
    { id: 'app', workspaceId: 'workspace' },
    { workspaceId: 'workspace', applicationRegistrationId: 'registration' },
  );
  expect(findOne).toHaveBeenCalledWith({
    where: { id: 'app', workspaceId: 'workspace' },
  });
  expect(pooledUpdate).not.toHaveBeenCalled();
  expect(pooledFindById).not.toHaveBeenCalled();
  expect(invalidateAndRecompute).not.toHaveBeenCalled();
  expect(effects).toHaveLength(1);
  await effects[0]();
  expect(invalidateAndRecompute).toHaveBeenCalledWith('workspace', [
    'flatApplicationMaps',
  ]);
});
