import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { ApplicationVariableEntity } from 'src/engine/core-modules/application/application-variable/application-variable.entity';
import { WorkspaceFlatApplicationVariableMapCacheService } from 'src/engine/metadata-modules/flat-application-variable/services/workspace-flat-application-variable-map-cache.service';

const workspaceId = 'workspace-A';
const entities = [ApplicationVariableEntity, ApplicationEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  key?: string;
  value?: '';
  description?: string;
  isSecret?: boolean;
  deletedAt?: Date | null;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
// ApplicationVariableEntity.value is encrypted; only the permitted empty value
// is used in synthetic fixtures, irrespective of isSecret.
const variable = (id: string, extras: Partial<Row> = {}): Row =>
  row(id, {
    applicationId: 'app',
    key: 'ORIGINAL_KEY',
    value: '',
    description: 'Synthetic variable',
    isSecret: false,
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app')]],
    [ApplicationVariableEntity, [variable('variable'), variable('other')]],
  ]);

// Fake only TypeORM I/O; provider, converter and three-index insertion stay real.
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
        (entry) => entry.workspaceId === workspaceId && !entry.deletedAt,
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
  return new WorkspaceFlatApplicationVariableMapCacheService(
    {
      ...pooled<ApplicationVariableEntity>(ApplicationVariableEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationVariableEntity>,
    pooled<ApplicationEntity>(ApplicationEntity),
  );
};

const expectIndexes = (
  map: Awaited<
    ReturnType<
      WorkspaceFlatApplicationVariableMapCacheService['computeForCache']
    >
  >,
  variableUid: string,
  ownerId = 'app',
) => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([
    variableUid,
    'uid-other',
  ]);
  expect(map.universalIdentifierById).toEqual({
    variable: variableUid,
    other: 'uid-other',
  });
  expect(map.universalIdentifiersByApplicationId).toEqual({
    [ownerId]: [variableUid, 'uid-other'],
  });
};

describe('WorkspaceFlatApplicationVariableMapCacheService manager-bound computation', () => {
  it('uses both direct manager reads on ordinary and pinned paths with unchanged query options', async () => {
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
    expect(local.byUniversalIdentifier['uid-variable']).toMatchObject({
      id: 'variable',
      workspaceId,
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      key: 'ORIGINAL_KEY',
      value: '',
      description: 'Synthetic variable',
      isSecret: false,
    });
    expectIndexes(local, 'uid-variable');
  });

  it('starts both parallel reads before the first finishes', async () => {
    let releaseVariables!: (value: Row[]) => void;
    const variables = new Promise<Row[]>((resolve) => {
      releaseVariables = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find:
          entity === ApplicationVariableEntity
            ? () => variables
            : applicationFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
    });
    releaseVariables([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('rebuilds key, UID and owner indexes on the second read without mutating the first map', async () => {
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
    state.set(ApplicationVariableEntity, [
      variable('variable', {
        applicationId: 'new-app',
        universalIdentifier: 'uid-variable-v2',
        key: 'CHANGED_KEY',
      }),
      variable('other', { applicationId: 'new-app' }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-variable']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-variable-v2']).toMatchObject({
      key: 'CHANGED_KEY',
      value: '',
      applicationId: 'new-app',
      applicationUniversalIdentifier: 'uid-new-app',
    });
    expectIndexes(second, 'uid-variable-v2', 'new-app');
    expect(first.byUniversalIdentifier['uid-variable']).toMatchObject({
      key: 'ORIGINAL_KEY',
      applicationUniversalIdentifier: 'uid-app',
    });
    expectIndexes(first, 'uid-variable');
    for (const entity of entities) {
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
    }
  });

  it('filters workspace B and excludes deleted application owners from the UID lookup', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(ApplicationVariableEntity)!.push(
      variable('foreign-variable', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
    );
    const provider = service(fixture(new Map()).manager);
    const local = await provider.computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(local, 'uid-variable');
    expect(local.universalIdentifierById['foreign-variable']).toBeUndefined();

    state.get(ApplicationEntity)![0] = row('app', {
      deletedAt: new Date('2024-01-01'),
    });
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow(
      'Application with id app not found for applicationVariable variable',
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
      'Application with id app not found for applicationVariable variable',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state
      .get(ApplicationVariableEntity)!
      .push(variable('duplicate', { universalIdentifier: 'uid-variable' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
    state.set(ApplicationVariableEntity, []);
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
