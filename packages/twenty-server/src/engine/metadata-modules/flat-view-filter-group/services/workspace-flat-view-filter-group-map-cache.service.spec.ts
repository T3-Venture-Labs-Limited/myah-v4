import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';
import { ViewFilterGroupLogicalOperator } from 'twenty-shared/types';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatViewFilterGroupMapCacheService } from 'src/engine/metadata-modules/flat-view-filter-group/services/workspace-flat-view-filter-group-map-cache.service';
import { ViewFilterGroupEntity } from 'src/engine/metadata-modules/view-filter-group/entities/view-filter-group.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  ViewFilterGroupEntity,
  ApplicationEntity,
  ViewFilterEntity,
  ViewEntity,
] as const;
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
      ViewFilterGroupEntity,
      [
        row('parent', {
          viewId: 'view',
          parentViewFilterGroupId: null,
          logicalOperator: ViewFilterGroupLogicalOperator.AND,
          positionInViewFilterGroup: 1,
          deletedAt: new Date('2024-01-01'),
        }),
        row('child', {
          viewId: 'view',
          parentViewFilterGroupId: 'parent',
          logicalOperator: ViewFilterGroupLogicalOperator.OR,
          positionInViewFilterGroup: 2,
        }),
        row('other', {
          viewId: 'view',
          parentViewFilterGroupId: null,
          logicalOperator: ViewFilterGroupLogicalOperator.AND,
          positionInViewFilterGroup: 3,
        }),
      ],
    ],
    [
      ViewFilterEntity,
      [
        row('filter', {
          viewFilterGroupId: 'child',
          deletedAt: new Date('2024-01-01'),
        }),
        row('other-filter', { viewFilterGroupId: 'other' }),
        row('ungrouped', { viewFilterGroupId: null }),
      ],
    ],
  ]);

// Fake repository I/O only; scoped wrapper, conversion, regrouping and indexes are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(true);
      expect(options.select).toEqual(
        entity === ViewFilterGroupEntity
          ? undefined
          : entity === ViewFilterEntity
            ? ['id', 'universalIdentifier', 'viewFilterGroupId']
            : ['id', 'universalIdentifier'],
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
  return new WorkspaceFlatViewFilterGroupMapCacheService(
    scoped<ViewFilterGroupEntity>(ViewFilterGroupEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    scoped<ViewFilterEntity>(ViewFilterEntity),
    scoped<ViewEntity>(ViewEntity),
  );
};

const expectIndexes = (
  map: Awaited<
    ReturnType<WorkspaceFlatViewFilterGroupMapCacheService['computeForCache']>
  >,
  parentUid: string,
  childUid: string,
) => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([
    parentUid,
    childUid,
    'uid-other',
  ]);
  expect(map.universalIdentifierById).toEqual({
    parent: parentUid,
    child: childUid,
    other: 'uid-other',
  });
  expect(map.universalIdentifiersByApplicationId['app']).toEqual([
    parentUid,
    childUid,
    'uid-other',
  ]);
};

describe('WorkspaceFlatViewFilterGroupMapCacheService manager-bound computation', () => {
  it('binds all four exact reads for ordinary and explicit managers and converts nested groups, filters and indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-parent']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
      parentViewFilterGroupUniversalIdentifier: null,
      logicalOperator: ViewFilterGroupLogicalOperator.AND,
      positionInViewFilterGroup: 1,
      childViewFilterGroupIds: ['child'],
      childViewFilterGroupUniversalIdentifiers: ['uid-child'],
      viewFilterIds: [],
      viewFilterUniversalIdentifiers: [],
    });
    expect(local.byUniversalIdentifier['uid-child']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
      parentViewFilterGroupUniversalIdentifier: 'uid-parent',
      logicalOperator: ViewFilterGroupLogicalOperator.OR,
      viewFilterIds: ['filter'],
      viewFilterUniversalIdentifiers: ['uid-filter'],
      childViewFilterGroupIds: [],
    });
    expect(local.byUniversalIdentifier['uid-other']).toMatchObject({
      viewFilterIds: ['other-filter'],
      viewFilterUniversalIdentifiers: ['uid-other-filter'],
    });
    expectIndexes(local, 'uid-parent', 'uid-child');
  });

  it('rebuilds relationship/filter regrouping and rekeys indexes without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(ViewEntity)!.push(row('new-view'));
    state.get(ViewFilterGroupEntity)![1] = {
      ...state.get(ViewFilterGroupEntity)![1],
      universalIdentifier: 'uid-child-v2',
      parentViewFilterGroupId: 'other',
      viewId: 'new-view',
      logicalOperator: ViewFilterGroupLogicalOperator.AND,
      positionInViewFilterGroup: 7,
    };
    state.get(ViewFilterEntity)![0] = {
      ...state.get(ViewFilterEntity)![0],
      viewFilterGroupId: 'other',
    };
    state
      .get(ViewFilterEntity)!
      .push(row('new-filter', { viewFilterGroupId: 'child' }));
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-child']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-parent']).toMatchObject({
      childViewFilterGroupIds: [],
      childViewFilterGroupUniversalIdentifiers: [],
    });
    expect(second.byUniversalIdentifier['uid-other']).toMatchObject({
      childViewFilterGroupIds: ['child'],
      childViewFilterGroupUniversalIdentifiers: ['uid-child-v2'],
      viewFilterIds: ['filter', 'other-filter'],
      viewFilterUniversalIdentifiers: ['uid-filter', 'uid-other-filter'],
    });
    expect(second.byUniversalIdentifier['uid-child-v2']).toMatchObject({
      parentViewFilterGroupUniversalIdentifier: 'uid-other',
      viewUniversalIdentifier: 'uid-new-view',
      logicalOperator: ViewFilterGroupLogicalOperator.AND,
      positionInViewFilterGroup: 7,
      viewFilterIds: ['new-filter'],
      viewFilterUniversalIdentifiers: ['uid-new-filter'],
    });
    expectIndexes(second, 'uid-parent', 'uid-child-v2');
    expect(first.byUniversalIdentifier['uid-parent']).toMatchObject({
      childViewFilterGroupIds: ['child'],
      childViewFilterGroupUniversalIdentifiers: ['uid-child'],
    });
    expect(first.byUniversalIdentifier['uid-child']).toMatchObject({
      parentViewFilterGroupUniversalIdentifier: 'uid-parent',
      viewUniversalIdentifier: 'uid-view',
      logicalOperator: ViewFilterGroupLogicalOperator.OR,
      positionInViewFilterGroup: 2,
      viewFilterIds: ['filter'],
      viewFilterUniversalIdentifiers: ['uid-filter'],
    });
    expect(first.byUniversalIdentifier['uid-other']).toMatchObject({
      childViewFilterGroupIds: [],
      viewFilterIds: ['other-filter'],
    });
    expectIndexes(first, 'uid-parent', 'uid-child');
  });

  it('excludes foreign workspace rows and retains real soft-deleted group, owner, view and filter rows', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          viewId: 'foreign-ViewEntity',
          parentViewFilterGroupId: 'foreign-ViewFilterGroupEntity',
          viewFilterGroupId: 'foreign-ViewFilterGroupEntity',
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(local, 'uid-parent', 'uid-child');
    expect(
      local.universalIdentifierById['foreign-ViewFilterGroupEntity'],
    ).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-child']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
      viewFilterUniversalIdentifiers: ['uid-filter'],
    });
  });

  it('preserves missing owner/view/parent UID errors and duplicate UID rejection', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for viewFilterGroup parent',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(ViewEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('View with id view not found for viewFilterGroup parent');
    state.set(ViewEntity, rows().get(ViewEntity)!);
    state.get(ViewFilterGroupEntity)![1] = {
      ...state.get(ViewFilterGroupEntity)![1],
      parentViewFilterGroupId: 'missing',
    };
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'ViewFilterGroup with id missing not found for viewFilterGroup child',
    );
    state.set(ViewFilterGroupEntity, rows().get(ViewFilterGroupEntity)!);
    state.get(ViewFilterGroupEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-parent',
        viewId: 'view',
        parentViewFilterGroupId: null,
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'rejects invalid workspace %s at the scoped boundary',
    async (invalidId) => {
      const manager = fixture(new Map()).manager;
      await expect(
        service(manager).computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
    },
  );
});
