import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

it('recovers publication from committed DB version instead of stale Redis or an uncommitted value', async () => {
  const findOne = jest
    .fn()
    .mockResolvedValue({ id: 'workspace', metadataVersion: 9 });
  const setMetadataVersion = jest.fn().mockResolvedValue(undefined);
  const invalidate = jest.fn().mockResolvedValue(undefined);
  const service = new WorkspaceMetadataVersionService(
    { findOne } as never,
    { setMetadataVersion } as never,
    { invalidate } as never,
  );
  await service.publishCommittedMetadataVersion('workspace');
  expect(findOne).toHaveBeenCalledWith({
    select: ['id', 'metadataVersion'],
    where: { id: 'workspace' },
    withDeleted: true,
  });
  expect(setMetadataVersion).toHaveBeenCalledWith('workspace', 9);
  expect(invalidate).toHaveBeenCalledWith('workspaceEntity', 'workspace');
});

it('retries after committed version publication fails without changing the DB version again', async () => {
  const findOne = jest
    .fn()
    .mockResolvedValue({ id: 'workspace', metadataVersion: 12 });
  const setMetadataVersion = jest
    .fn()
    .mockRejectedValueOnce(new Error('Redis unavailable'))
    .mockResolvedValue(undefined);
  const invalidate = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn(() => {
    throw new Error('must not increment on recovery');
  });
  const service = new WorkspaceMetadataVersionService(
    { findOne, update } as never,
    { setMetadataVersion } as never,
    { invalidate } as never,
  );
  await expect(
    service.publishCommittedMetadataVersion('workspace'),
  ).rejects.toThrow('Redis unavailable');
  expect(invalidate).not.toHaveBeenCalled();
  await service.publishCommittedMetadataVersion('workspace');
  expect(setMetadataVersion).toHaveBeenNthCalledWith(2, 'workspace', 12);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(update).not.toHaveBeenCalled();
});

it('retries a successful Redis version write when subsequent core cache invalidation throws', async () => {
  const findOne = jest
    .fn()
    .mockResolvedValue({ id: 'workspace', metadataVersion: 15 });
  const setMetadataVersion = jest.fn().mockResolvedValue(undefined);
  const invalidate = jest
    .fn()
    .mockRejectedValueOnce(new Error('cache failed'))
    .mockResolvedValue(undefined);
  const service = new WorkspaceMetadataVersionService(
    { findOne } as never,
    { setMetadataVersion } as never,
    { invalidate } as never,
  );
  await expect(
    service.publishCommittedMetadataVersion('workspace'),
  ).rejects.toThrow('cache failed');
  await service.publishCommittedMetadataVersion('workspace');
  expect(setMetadataVersion).toHaveBeenCalledTimes(2);
  expect(setMetadataVersion).toHaveBeenNthCalledWith(2, 'workspace', 15);
  expect(invalidate).toHaveBeenCalledTimes(2);
});

it('increments version on the pinned backend and publishes cache only after command commit', async () => {
  const findOne = jest
    .fn()
    .mockResolvedValue({ id: 'workspace', metadataVersion: 7 });
  const update = jest.fn().mockResolvedValue(undefined);
  const pooledFind = jest.fn(() => {
    throw new Error('pooled read forbidden');
  });
  const setMetadataVersion = jest.fn().mockResolvedValue(undefined);
  const invalidate = jest.fn().mockResolvedValue(undefined);
  const runner = {
    manager: { getRepository: () => ({ findOne, update }) },
  } as never;
  const effects: Array<() => Promise<void> | void> = [];
  const transaction: UpgradeWorkspaceTransaction = {
    queryRunner: runner,
    afterCommit: (effect) => effects.push(effect),
  };
  const service = new WorkspaceMetadataVersionService(
    { findOne: pooledFind } as never,
    { setMetadataVersion } as never,
    { invalidate } as never,
  );
  await service.incrementMetadataVersion('workspace', transaction);
  expect(pooledFind).not.toHaveBeenCalled();
  expect(findOne).toHaveBeenCalledWith({
    select: ['id', 'metadataVersion'],
    where: { id: 'workspace' },
    withDeleted: true,
  });
  expect(update).toHaveBeenCalledWith(
    { id: 'workspace' },
    { metadataVersion: 8 },
  );
  expect(setMetadataVersion).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(effects).toHaveLength(1);
  await effects[0]();
  expect(setMetadataVersion).toHaveBeenCalledWith('workspace', 8);
  expect(invalidate).toHaveBeenCalledWith('workspaceEntity', 'workspace');
});
