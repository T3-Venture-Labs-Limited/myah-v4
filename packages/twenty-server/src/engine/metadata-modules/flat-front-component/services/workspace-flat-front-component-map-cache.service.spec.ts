import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatFrontComponentMapCacheService } from 'src/engine/metadata-modules/flat-front-component/services/workspace-flat-front-component-map-cache.service';
import { FrontComponentEntity } from 'src/engine/metadata-modules/front-component/entities/front-component.entity';

const workspaceId = 'workspace-A';
const entities = [FrontComponentEntity, ApplicationEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  name?: string;
  description?: string | null;
  sourceComponentPath?: string;
  builtComponentPath?: string;
  componentName?: string;
  builtComponentChecksum?: string;
  isHeadless?: boolean;
  usesSdkClient?: boolean;
  deletedAt?: Date | null;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
const component = (id: string, extras: Partial<Row> = {}): Row =>
  row(id, {
    applicationId: 'app',
    name: 'Original',
    description: null,
    sourceComponentPath: 'src/component.tsx',
    builtComponentPath: 'dist/component.js',
    componentName: 'OriginalComponent',
    builtComponentChecksum: 'checksum-original',
    isHeadless: false,
    usesSdkClient: true,
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app')]],
    [FrontComponentEntity, [component('front'), component('other')]],
  ]);

// Fake only TypeORM I/O: provider, converter and index insertion remain real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === ApplicationEntity
          ? {
              where: { workspaceId },
              select: ['id', 'universalIdentifier'],
              withDeleted: true,
            }
          : { where: { workspaceId }, withDeleted: true },
      );
      return (state.get(entity) ?? []).filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          (entity !== ApplicationEntity ||
            options.withDeleted ||
            !entry.deletedAt),
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
  return new WorkspaceFlatFrontComponentMapCacheService(
    {
      ...pooled<FrontComponentEntity>(FrontComponentEntity),
      manager: ordinaryManager,
    } as Repository<FrontComponentEntity>,
    pooled<ApplicationEntity>(ApplicationEntity),
  );
};

type Maps = Awaited<
  ReturnType<WorkspaceFlatFrontComponentMapCacheService['computeForCache']>
>;
const expectIndexes = (map: Maps, frontUid: string, ownerId = 'app') => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([
    frontUid,
    'uid-other',
  ]);
  expect(map.universalIdentifierById).toEqual({
    front: frontUid,
    other: 'uid-other',
  });
  expect(map.universalIdentifiersByApplicationId).toEqual({
    [ownerId]: [frontUid, 'uid-other'],
  });
};

describe('WorkspaceFlatFrontComponentMapCacheService manager-bound computation', () => {
  it('uses both manager reads with exact options on ordinary and explicit paths', async () => {
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
    expect(local.byUniversalIdentifier['uid-front']).toMatchObject({
      id: 'front',
      workspaceId,
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      name: 'Original',
      sourceComponentPath: 'src/component.tsx',
      componentName: 'OriginalComponent',
      builtComponentChecksum: 'checksum-original',
      isHeadless: false,
      usesSdkClient: true,
    });
    expectIndexes(local, 'uid-front');
  });

  it('launches both reads before the first resolves', async () => {
    let releaseComponents!: (value: Row[]) => void;
    const components = new Promise<Row[]>((resolve) => {
      releaseComponents = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find:
          entity === FrontComponentEntity ? () => components : applicationFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
      withDeleted: true,
    });
    releaseComponents([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('rekeys component name, UID and owner on a second read without changing the first maps', async () => {
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
    state.set(FrontComponentEntity, [
      component('front', {
        applicationId: 'new-app',
        universalIdentifier: 'uid-front-v2',
        name: 'Changed',
        componentName: 'ChangedComponent',
      }),
      component('other', { applicationId: 'new-app' }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-front']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-front-v2']).toMatchObject({
      name: 'Changed',
      componentName: 'ChangedComponent',
      applicationId: 'new-app',
      applicationUniversalIdentifier: 'uid-new-app',
    });
    expectIndexes(second, 'uid-front-v2', 'new-app');
    expect(first.byUniversalIdentifier['uid-front']).toMatchObject({
      name: 'Original',
      componentName: 'OriginalComponent',
      applicationUniversalIdentifier: 'uid-app',
    });
    expectIndexes(first, 'uid-front');
    for (const entity of entities)
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
  });

  it('scopes workspace B out and retains a soft-deleted Application owner', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(FrontComponentEntity)!.push(
      component('foreign-front', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
    );
    state.get(ApplicationEntity)![0] = row('app', {
      deletedAt: new Date('2024-01-01'),
    });
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(local, 'uid-front');
    expect(local.byUniversalIdentifier['uid-front']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
    });
    expect(local.universalIdentifierById['foreign-front']).toBeUndefined();
  });

  it('preserves missing-owner and duplicate-UID rejection and fresh empty indexes', async () => {
    const state = rows();
    const manager = fixture(state).manager;
    const provider = service(manager);
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for frontComponent front',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state
      .get(FrontComponentEntity)!
      .push(component('duplicate', { universalIdentifier: 'uid-front' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
    state.set(FrontComponentEntity, []);
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
