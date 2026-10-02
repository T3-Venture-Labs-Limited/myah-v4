import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';
import { FeatureFlagKey } from 'twenty-shared/types';

import { FeatureFlagEntity } from 'src/engine/core-modules/feature-flag/feature-flag.entity';
import { WorkspaceFeatureFlagsMapCacheService } from 'src/engine/metadata-modules/workspace-feature-flags-map-cache/workspace-feature-flags-map-cache.service';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const flag = (
  key: FeatureFlagKey,
  value: boolean,
  overrides: Partial<FeatureFlagEntity> = {},
): FeatureFlagEntity =>
  ({
    id: `id-${key}`,
    workspaceId,
    key,
    value,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  }) as FeatureFlagEntity;

const fixture = (rows: FeatureFlagEntity[]) => {
  const find = jest.fn(async (options: FindManyOptions<FeatureFlagEntity>) => {
    expect(options).toEqual({ where: { workspaceId } });
    return rows.filter((row) => row.workspaceId === workspaceId);
  });
  const getRepository = jest.fn((entity: Function) => {
    if (entity !== FeatureFlagEntity) throw new Error('unexpected repository');
    return {
      target: FeatureFlagEntity,
      find,
    } as unknown as Repository<FeatureFlagEntity>;
  });
  return {
    manager: { getRepository } as unknown as EntityManager,
    find,
    getRepository,
  };
};

const provider = (ordinaryManager: EntityManager) => {
  const pooledFind = jest.fn(() => {
    throw new Error('POOLED_READ:flags');
  });
  const repository = {
    target: FeatureFlagEntity,
    find: pooledFind,
    manager: ordinaryManager,
  } as unknown as Repository<FeatureFlagEntity>;
  return {
    service: new WorkspaceFeatureFlagsMapCacheService(
      new WorkspaceScopedRepository(repository),
      repository,
    ),
    pooledFind,
  };
};

describe('WorkspaceFeatureFlagsMapCacheService manager calculation', () => {
  it('uses ordinary manager through the scoped wrapper, not pooled reads or cache state', async () => {
    const state = fixture([
      flag(FeatureFlagKey.IS_UNIQUE_INDEXES_ENABLED, true),
      flag(FeatureFlagKey.IS_JSON_FILTER_ENABLED, false),
      flag(FeatureFlagKey.IS_EMAIL_GROUP_ENABLED, true, {
        workspaceId: 'workspace-B',
      }),
    ]);
    const { service, pooledFind } = provider(state.manager);
    const ordinary = await service.computeForCache(workspaceId);
    const explicit = await service.computeFromManager(
      workspaceId,
      state.manager,
    );

    expect(ordinary).toEqual({
      [FeatureFlagKey.IS_UNIQUE_INDEXES_ENABLED]: true,
      [FeatureFlagKey.IS_JSON_FILTER_ENABLED]: false,
    });
    expect(explicit).toEqual(ordinary);
    expect(state.getRepository).toHaveBeenCalledTimes(2);
    expect(state.find).toHaveBeenCalledTimes(2);
    expect(pooledFind).not.toHaveBeenCalled();
  });

  it('uses supplied manager and fresh sequential results when keys and values change', async () => {
    const ordinary = fixture([]);
    const rows = [flag(FeatureFlagKey.IS_UNIQUE_INDEXES_ENABLED, true)];
    const pinned = fixture(rows);
    const { service, pooledFind } = provider(ordinary.manager);
    const first = await service.computeFromManager(workspaceId, pinned.manager);
    rows.splice(
      0,
      rows.length,
      flag(FeatureFlagKey.IS_JSON_FILTER_ENABLED, false),
    );
    const second = await service.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(first).toEqual({ [FeatureFlagKey.IS_UNIQUE_INDEXES_ENABLED]: true });
    expect(second).toEqual({ [FeatureFlagKey.IS_JSON_FILTER_ENABLED]: false });
    expect(first).not.toBe(second);
    expect(ordinary.getRepository).not.toHaveBeenCalled();
    expect(pinned.find).toHaveBeenCalledTimes(2);
    expect(pooledFind).not.toHaveBeenCalled();
  });

  it('preserves last-wins duplicate keys and returns independent empty maps', async () => {
    const rows = [
      flag(FeatureFlagKey.IS_JSON_FILTER_ENABLED, false),
      flag(FeatureFlagKey.IS_JSON_FILTER_ENABLED, true, { id: 'second' }),
    ];
    const state = fixture(rows);
    const { service } = provider(state.manager);
    expect(
      await service.computeFromManager(workspaceId, state.manager),
    ).toEqual({
      [FeatureFlagKey.IS_JSON_FILTER_ENABLED]: true,
    });
    rows.length = 0;
    const empty = await service.computeFromManager(workspaceId, state.manager);
    expect(empty).toEqual({});
    expect(empty).not.toBe(
      await service.computeFromManager(workspaceId, state.manager),
    );
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before repository acquisition or find on both paths',
    async (invalidId) => {
      const state = fixture([]);
      const { service, pooledFind } = provider(state.manager);
      for (const read of [
        () => service.computeForCache(invalidId as string),
        () => service.computeFromManager(invalidId as string, state.manager),
      ]) {
        await expect(read()).rejects.toThrow(
          'workspaceId must be a non-empty string',
        );
      }
      expect(state.getRepository).not.toHaveBeenCalled();
      expect(state.find).not.toHaveBeenCalled();
      expect(pooledFind).not.toHaveBeenCalled();
    },
  );
});
