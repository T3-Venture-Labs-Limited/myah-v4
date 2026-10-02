import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { ConnectionProviderEntity } from 'src/engine/core-modules/application/connection-provider/connection-provider.entity';
import { WorkspaceFlatConnectionProviderMapCacheService } from 'src/engine/metadata-modules/flat-connection-provider/services/workspace-flat-connection-provider-map-cache.service';

const workspaceId = 'workspace-A';
const entities = [ConnectionProviderEntity, ApplicationEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  name?: string;
  displayName?: string;
  type?: 'oauth';
  oauthConfig?: null;
  deletedAt?: Date | null;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
// Never place private OAuth material in fixtures: null is the only config value.
const connectionProvider = (id: string, extras: Partial<Row> = {}): Row =>
  row(id, {
    applicationId: 'app',
    name: 'original',
    displayName: 'Original',
    type: 'oauth',
    oauthConfig: null,
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app')]],
    [
      ConnectionProviderEntity,
      [connectionProvider('provider'), connectionProvider('other')],
    ],
  ]);

// Only TypeORM I/O is fake; provider, converter and map-index insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === ApplicationEntity
          ? { where: { workspaceId }, select: ['id', 'universalIdentifier'] }
          : { where: { workspaceId } },
      );
      return (state.get(entity) ?? []).filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          (entity !== ApplicationEntity || !entry.deletedAt),
      );
    });
    calls.set(entity, find);
    repositories.set(entity, {
      target: entity,
      find,
    } as unknown as Repository<never>);
  }
  const getRepository = jest.fn((entity: Function) => {
    const repository = repositories.get(entity);
    if (!repository) throw new Error(`Unexpected repository: ${entity.name}`);
    return repository;
  });
  return {
    manager: { getRepository } as unknown as EntityManager,
    calls,
    getRepository,
  };
};

const service = (ordinaryManager: EntityManager) => {
  const pooled = <T extends { workspaceId: string }>(entity: Function) =>
    ({
      target: entity,
      find: () => {
        throw new Error(`POOLED_READ:${entity.name}`);
      },
    }) as unknown as Repository<T>;
  return new WorkspaceFlatConnectionProviderMapCacheService(
    {
      ...pooled<ConnectionProviderEntity>(ConnectionProviderEntity),
      manager: ordinaryManager,
    } as Repository<ConnectionProviderEntity>,
    pooled<ApplicationEntity>(ApplicationEntity),
  );
};

type Maps = Awaited<
  ReturnType<WorkspaceFlatConnectionProviderMapCacheService['computeForCache']>
>;
const expectIndexes = (map: Maps, providerUid: string, ownerId = 'app') => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([
    providerUid,
    'uid-other',
  ]);
  expect(map.universalIdentifierById).toEqual({
    provider: providerUid,
    other: 'uid-other',
  });
  expect(map.universalIdentifiersByApplicationId).toEqual({
    [ownerId]: [providerUid, 'uid-other'],
  });
};

describe('WorkspaceFlatConnectionProviderMapCacheService manager-bound computation', () => {
  it('uses both direct manager reads on ordinary and explicit paths with unchanged options', async () => {
    const state = rows();
    const ordinary = fixture(state);
    const pinned = fixture(state);
    const provider = service(ordinary.manager);
    const cached = await provider.computeForCache(workspaceId);
    const local = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(cached).toEqual(local);
    for (const entity of entities) {
      expect(ordinary.calls.get(entity)).toHaveBeenCalledTimes(1);
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(1);
      expect(ordinary.getRepository).toHaveBeenCalledWith(entity);
      expect(pinned.getRepository).toHaveBeenCalledWith(entity);
    }
    expect(local.byUniversalIdentifier['uid-provider']).toMatchObject({
      id: 'provider',
      workspaceId,
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      name: 'original',
      displayName: 'Original',
      type: 'oauth',
      oauthConfig: null,
    });
    expectIndexes(local, 'uid-provider');
  });

  it('starts both parallel reads before the first finishes', async () => {
    let releaseProviders!: (value: Row[]) => void;
    const providers = new Promise<Row[]>((resolve) => {
      releaseProviders = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find:
          entity === ConnectionProviderEntity
            ? () => providers
            : applicationFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
    });
    releaseProviders([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('rekeys name, UID and owner on a second read without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.set(ApplicationEntity, [
      row('new-app', { universalIdentifier: 'uid-new-app' }),
    ]);
    state.set(ConnectionProviderEntity, [
      connectionProvider('provider', {
        applicationId: 'new-app',
        universalIdentifier: 'uid-provider-v2',
        name: 'changed',
        displayName: 'Changed',
      }),
      connectionProvider('other', { applicationId: 'new-app' }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-provider']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-provider-v2']).toMatchObject({
      name: 'changed',
      displayName: 'Changed',
      oauthConfig: null,
      applicationId: 'new-app',
      applicationUniversalIdentifier: 'uid-new-app',
    });
    expectIndexes(second, 'uid-provider-v2', 'new-app');
    expect(first.byUniversalIdentifier['uid-provider']).toMatchObject({
      name: 'original',
      displayName: 'Original',
      applicationUniversalIdentifier: 'uid-app',
    });
    expectIndexes(first, 'uid-provider');
    for (const entity of entities) {
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
    }
  });

  it('scopes workspace B out and excludes deleted application owners', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(ConnectionProviderEntity)!.push(
      connectionProvider('foreign-provider', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
    );
    const provider = service(fixture(new Map()).manager);
    const local = await provider.computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(local, 'uid-provider');
    expect(local.universalIdentifierById['foreign-provider']).toBeUndefined();

    state.get(ApplicationEntity)![0] = row('app', {
      deletedAt: new Date('2024-01-01'),
    });
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow(
      'Application with id app not found for connectionProvider provider',
    );
  });

  it('preserves missing owner, duplicate UID rejection and fresh empty indexes', async () => {
    const state = rows();
    const manager = fixture(state).manager;
    const provider = service(manager);
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for connectionProvider provider',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.get(ConnectionProviderEntity)!.push(
      connectionProvider('duplicate', {
        universalIdentifier: 'uid-provider',
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
    state.set(ConnectionProviderEntity, []);
    const empty = await provider.computeFromManager(workspaceId, manager);
    expect(empty).toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
    expect(empty).not.toBe(
      await provider.computeFromManager(workspaceId, manager),
    );
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before either direct read on both entry points',
    async (invalidId) => {
      const directFind = jest.fn();
      const getRepository = jest.fn(() => ({ find: directFind }));
      const manager = { getRepository } as unknown as EntityManager;
      const provider = service(manager);
      await expect(
        provider.computeForCache(invalidId as string),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      await expect(
        provider.computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      expect(getRepository).not.toHaveBeenCalled();
      expect(directFind).not.toHaveBeenCalled();
    },
  );
});
