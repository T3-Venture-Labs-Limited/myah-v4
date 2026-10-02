import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatApplicationMapCacheService } from 'src/engine/core-modules/application/workspace-flat-application-map-cache.service';

const workspaceId = 'workspace-A';
const application = (
  id: string,
  overrides: Partial<ApplicationEntity> = {},
): ApplicationEntity =>
  ({
    id,
    workspaceId,
    universalIdentifier: `uid-${id}`,
    name: `synthetic-${id}`,
    description: null,
    logo: null,
    logoFileId: null,
    logoFile: null,
    version: null,
    sourceType: 'LOCAL',
    sourcePath: '',
    packageJsonChecksum: null,
    packageJsonFileId: null,
    packageJsonFile: null,
    yarnLockChecksum: null,
    yarnLockFileId: null,
    yarnLockFile: null,
    availablePackages: {},
    logicFunctionLayerId: null,
    defaultRoleId: null,
    defaultRole: null,
    settingsCustomTabFrontComponentId: null,
    canBeUninstalled: true,
    isSdkLayerStale: false,
    applicationRegistrationId: null,
    applicationRegistration: null,
    primaryPublicDomainId: null,
    primaryPublicDomain: null,
    publicDomains: [],
    agents: [],
    frontComponents: [],
    commandMenuItems: [],
    logicFunctions: [],
    objects: [],
    applicationVariables: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    deletedAt: null,
    ...overrides,
  }) as ApplicationEntity;

const fixture = (rows: ApplicationEntity[]) => {
  const find = jest.fn(async (options: FindManyOptions<ApplicationEntity>) => {
    expect(options).toEqual({ where: { workspaceId }, withDeleted: true });
    return rows.filter((row) => row.workspaceId === workspaceId);
  });
  const getRepository = jest.fn((entity: Function) => {
    if (entity !== ApplicationEntity) throw new Error('unexpected repository');
    return { find } as unknown as Repository<ApplicationEntity>;
  });
  const manager = { getRepository } as unknown as EntityManager;
  const pooledFind = jest.fn(() => {
    throw new Error('POOLED_READ:application');
  });
  const provider = new WorkspaceFlatApplicationMapCacheService({
    manager,
    find: pooledFind,
  } as unknown as Repository<ApplicationEntity>);

  return { provider, manager, find, getRepository, pooledFind };
};

describe('WorkspaceFlatApplicationMapCacheService manager calculation', () => {
  it('uses the ordinary manager, not the pooled repository, preserving deleted applications and relation stripping', async () => {
    const deleted = application('app', {
      deletedAt: new Date('2024-01-03'),
      universalIdentifier: 'uid-original',
    });
    const state = fixture([
      deleted,
      application('foreign', { workspaceId: 'workspace-B' }),
    ]);
    const ordinary = await state.provider.computeForCache(workspaceId);
    const explicit = await state.provider.computeFromManager(
      workspaceId,
      state.manager,
    );

    expect(ordinary).toEqual(explicit);
    expect(ordinary.byId.app).toMatchObject({
      name: 'synthetic-app',
      deletedAt: new Date('2024-01-03'),
      sourcePath: '',
      availablePackages: {},
    });
    expect(ordinary.byId.app).not.toHaveProperty('applicationRegistration');
    expect(ordinary.byId.app).not.toHaveProperty('publicDomains');
    expect(ordinary.byId.app).not.toHaveProperty('logoFile');
    expect(ordinary.idByUniversalIdentifier).toEqual({ 'uid-original': 'app' });
    expect(ordinary.byId.foreign).toBeUndefined();
    expect(state.find).toHaveBeenCalledTimes(2);
    expect(state.getRepository).toHaveBeenCalledTimes(2);
    expect(state.pooledFind).not.toHaveBeenCalled();
  });

  it('uses only the supplied manager and returns new maps after local rekeying without mutating the first map', async () => {
    const ordinary = fixture([]);
    const rows = [application('app', { universalIdentifier: 'uid-before' })];
    const pinned = fixture(rows);
    const first = await ordinary.provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    rows[0] = application('app', {
      universalIdentifier: 'uid-after',
      name: 'synthetic-renamed',
    });
    const second = await ordinary.provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(first.idByUniversalIdentifier).toEqual({ 'uid-before': 'app' });
    expect(first.byId.app?.name).toBe('synthetic-app');
    expect(second.idByUniversalIdentifier).toEqual({ 'uid-after': 'app' });
    expect(second.byId.app?.name).toBe('synthetic-renamed');
    expect(second).not.toBe(first);
    expect(second.byId).not.toBe(first.byId);
    expect(second.idByUniversalIdentifier).not.toBe(
      first.idByUniversalIdentifier,
    );
    expect(ordinary.getRepository).not.toHaveBeenCalled();
    expect(pinned.find).toHaveBeenCalledTimes(2);
  });

  it('preserves last-wins duplicate identifiers and returns fresh empty maps', async () => {
    const rows = [
      application('first', { universalIdentifier: 'uid-duplicate' }),
      application('last', { universalIdentifier: 'uid-duplicate' }),
    ];
    const state = fixture(rows);
    const duplicate = await state.provider.computeFromManager(
      workspaceId,
      state.manager,
    );
    expect(Object.keys(duplicate.byId)).toEqual(['first', 'last']);
    expect(duplicate.idByUniversalIdentifier).toEqual({
      'uid-duplicate': 'last',
    });
    rows.length = 0;
    const empty = await state.provider.computeFromManager(
      workspaceId,
      state.manager,
    );
    expect(empty).toEqual({ byId: {}, idByUniversalIdentifier: {} });
    expect(empty).not.toBe(
      await state.provider.computeFromManager(workspaceId, state.manager),
    );
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before repository acquisition on both paths',
    async (invalidId) => {
      const state = fixture([]);
      for (const read of [
        () => state.provider.computeForCache(invalidId as string),
        () =>
          state.provider.computeFromManager(invalidId as string, state.manager),
      ]) {
        await expect(read()).rejects.toThrow(
          'workspaceId must be a non-empty string',
        );
      }
      expect(state.getRepository).not.toHaveBeenCalled();
      expect(state.pooledFind).not.toHaveBeenCalled();
    },
  );
});
