import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatViewGroupMapCacheService } from 'src/engine/metadata-modules/flat-view-group/services/workspace-flat-view-group-map-cache.service';
import { ViewGroupEntity } from 'src/engine/metadata-modules/view-group/entities/view-group.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [ViewGroupEntity, ApplicationEntity, ViewEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  deletedAt?: Date | null;
  [key: string]: unknown;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Record<string, unknown> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  applicationId: 'app',
  ...extras,
});
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    [ViewEntity, [row('view', { deletedAt: new Date('2024-01-01') })]],
    [
      ViewGroupEntity,
      [
        row('group', {
          viewId: 'view',
          fieldValue: 'creator',
          isVisible: false,
          position: 2,
          deletedAt: new Date('2024-01-01'),
        }),
        row('other', {
          viewId: 'view',
          fieldValue: 'partner',
          isVisible: true,
          position: 3,
        }),
      ],
    ],
  ]);

// Only repository I/O is fake; provider, scoped wrappers, converter and indexes are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(true);
      expect(options.select).toEqual(
        entity === ViewGroupEntity ? undefined : ['id', 'universalIdentifier'],
      );
      expect(options.relations).toBeUndefined();
      return (state.get(entity) ?? []).filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (options.withDeleted || !item.deletedAt),
      );
    });
    calls.set(entity, find);
    repositories.set(entity, {
      target: entity,
      find,
    } as unknown as Repository<never>);
  }
  const manager = {
    getRepository: (entity: Function) => {
      const repository = repositories.get(entity);
      if (!repository) throw new Error(`Unexpected repository: ${entity.name}`);
      return repository;
    },
  } as unknown as EntityManager;
  return { manager, calls };
};

const service = (ordinaryManager: EntityManager) => {
  const pooled = <T extends { workspaceId: string }>(entity: Function) =>
    ({
      target: entity,
      find: () => {
        throw new Error(`POOLED_READ:${entity.name}`);
      },
    }) as unknown as Repository<T>;
  const scoped = <T extends { workspaceId: string }>(entity: Function) =>
    new WorkspaceScopedRepository(pooled<T>(entity));
  return new WorkspaceFlatViewGroupMapCacheService(
    scoped<ViewGroupEntity>(ViewGroupEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    scoped<ViewEntity>(ViewEntity),
  );
};

describe('WorkspaceFlatViewGroupMapCacheService manager-bound computation', () => {
  it('binds all three reads for ordinary and explicit managers and resolves scalars, owner, view and indexes', async () => {
    const state = rows();
    const ordinary = fixture(state);
    const pinned = fixture(state);
    const provider = service(ordinary.manager);
    const cached = await provider.computeForCache(workspaceId);
    const local = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(local).toEqual(cached);
    for (const entity of entities) {
      expect(ordinary.calls.get(entity)).toHaveBeenCalledTimes(1);
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(1);
    }
    expect(local.byUniversalIdentifier['uid-group']).toMatchObject({
      fieldValue: 'creator',
      isVisible: false,
      position: 2,
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
    });
    expect(local.byUniversalIdentifier['uid-other']).toMatchObject({
      fieldValue: 'partner',
      isVisible: true,
      position: 3,
      viewUniversalIdentifier: 'uid-view',
    });
    expect(local.universalIdentifierById).toEqual({
      group: 'uid-group',
      other: 'uid-other',
    });
    expect(local.universalIdentifiersByApplicationId['app']).toEqual([
      'uid-group',
      'uid-other',
    ]);
  });

  it('recomputes changed local group/view state without mutating the earlier map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(ViewEntity)!.push(row('new-view'));
    state.get(ViewGroupEntity)![0] = {
      ...state.get(ViewGroupEntity)![0],
      universalIdentifier: 'uid-group-v2',
      viewId: 'new-view',
      fieldValue: 'updated',
      isVisible: true,
      position: 5,
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-group']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-group-v2']).toMatchObject({
      viewUniversalIdentifier: 'uid-new-view',
      fieldValue: 'updated',
      isVisible: true,
      position: 5,
    });
    expect(second.byUniversalIdentifier['uid-other']).toBeDefined();
    expect(second.universalIdentifierById).toEqual({
      group: 'uid-group-v2',
      other: 'uid-other',
    });
    expect(second.universalIdentifiersByApplicationId['app']).toEqual([
      'uid-group-v2',
      'uid-other',
    ]);
    expect(first.byUniversalIdentifier['uid-group']).toMatchObject({
      viewUniversalIdentifier: 'uid-view',
      fieldValue: 'creator',
      isVisible: false,
      position: 2,
    });
    expect(first.universalIdentifierById).toEqual({
      group: 'uid-group',
      other: 'uid-other',
    });
    expect(first.universalIdentifiersByApplicationId['app']).toEqual([
      'uid-group',
      'uid-other',
    ]);
  });

  it('excludes foreign workspace rows while retaining deleted group, view and owner rows', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          viewId: 'foreign-ViewEntity',
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-group',
      'uid-other',
    ]);
    expect(
      local.universalIdentifierById['foreign-ViewGroupEntity'],
    ).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-group']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
    });
  });

  it('preserves missing owner/view UID errors and duplicate UID rejection', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Application with id app not found for viewGroup group');
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(ViewEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('View with id view not found for viewGroup group');
    state.set(ViewEntity, rows().get(ViewEntity)!);
    state.get(ViewGroupEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-group',
        viewId: 'view',
        fieldValue: 'duplicate',
        isVisible: true,
        position: 4,
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'rejects invalid workspace %s at the scoped boundary',
    async (invalidId) => {
      const manager = {
        getRepository: (entity: Function) => ({
          target: entity,
          find: () => Promise.resolve([]),
        }),
      } as unknown as EntityManager;
      await expect(
        service(manager).computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
    },
  );
});
