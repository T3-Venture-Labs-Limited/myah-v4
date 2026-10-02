import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatViewFieldGroupMapCacheService } from 'src/engine/metadata-modules/flat-view-field-group/services/workspace-flat-view-field-group-map-cache.service';
import { ViewFieldGroupEntity } from 'src/engine/metadata-modules/view-field-group/entities/view-field-group.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  ViewFieldGroupEntity,
  ApplicationEntity,
  ViewEntity,
  ViewFieldEntity,
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
      ViewFieldGroupEntity,
      [
        row('group', {
          viewId: 'view',
          name: 'Creators',
          position: 2,
          isVisible: false,
          deletedAt: new Date('2024-01-01'),
        }),
        row('other', {
          viewId: 'view',
          name: 'Partners',
          position: 3,
          isVisible: true,
        }),
      ],
    ],
    [
      ViewFieldEntity,
      [
        row('view-field', {
          viewFieldGroupId: 'group',
          deletedAt: new Date('2024-01-01'),
        }),
        row('other-field', { viewFieldGroupId: 'other' }),
        row('ungrouped', { viewFieldGroupId: null }),
      ],
    ],
  ]);

// Fake only repository I/O; keep real scoped wrappers, converter, regrouping and index insertion.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(true);
      expect(options.select).toEqual(
        entity === ViewFieldGroupEntity
          ? undefined
          : entity === ViewFieldEntity
            ? ['id', 'universalIdentifier', 'viewFieldGroupId']
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
  return new WorkspaceFlatViewFieldGroupMapCacheService(
    scoped<ViewFieldGroupEntity>(ViewFieldGroupEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    scoped<ViewEntity>(ViewEntity),
    scoped<ViewFieldEntity>(ViewFieldEntity),
  );
};

describe('WorkspaceFlatViewFieldGroupMapCacheService manager-bound computation', () => {
  it('binds all four exact reads for ordinary and explicit managers, including grouped field UIDs and all indexes', async () => {
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
      name: 'Creators',
      position: 2,
      isVisible: false,
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
      viewFieldIds: ['view-field'],
      viewFieldUniversalIdentifiers: ['uid-view-field'],
    });
    expect(local.byUniversalIdentifier['uid-other']).toMatchObject({
      name: 'Partners',
      viewFieldIds: ['other-field'],
      viewFieldUniversalIdentifiers: ['uid-other-field'],
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

  it('recomputes a changed local group UID/view and regrouped fields without changing the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(ViewEntity)!.push(row('new-view'));
    state.get(ViewFieldGroupEntity)![0] = {
      ...state.get(ViewFieldGroupEntity)![0],
      universalIdentifier: 'uid-group-v2',
      viewId: 'new-view',
      name: 'Updated creators',
      position: 5,
      isVisible: true,
    };
    state.get(ViewFieldEntity)![0] = {
      ...state.get(ViewFieldEntity)![0],
      viewFieldGroupId: 'other',
    };
    state
      .get(ViewFieldEntity)!
      .push(row('new-field', { viewFieldGroupId: 'group' }));
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-group']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-group-v2']).toMatchObject({
      name: 'Updated creators',
      position: 5,
      isVisible: true,
      viewUniversalIdentifier: 'uid-new-view',
      viewFieldIds: ['new-field'],
      viewFieldUniversalIdentifiers: ['uid-new-field'],
    });
    expect(second.byUniversalIdentifier['uid-other']).toMatchObject({
      viewFieldIds: ['view-field', 'other-field'],
      viewFieldUniversalIdentifiers: ['uid-view-field', 'uid-other-field'],
    });
    expect(second.universalIdentifierById).toEqual({
      group: 'uid-group-v2',
      other: 'uid-other',
    });
    expect(second.universalIdentifiersByApplicationId['app']).toEqual([
      'uid-group-v2',
      'uid-other',
    ]);
    expect(first.byUniversalIdentifier['uid-group']).toMatchObject({
      name: 'Creators',
      position: 2,
      isVisible: false,
      viewUniversalIdentifier: 'uid-view',
      viewFieldIds: ['view-field'],
      viewFieldUniversalIdentifiers: ['uid-view-field'],
    });
    expect(first.byUniversalIdentifier['uid-other']).toMatchObject({
      viewFieldIds: ['other-field'],
      viewFieldUniversalIdentifiers: ['uid-other-field'],
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

  it('excludes foreign workspace rows and retains deleted group, owner, view and child rows', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          viewId: 'foreign-ViewEntity',
          viewFieldGroupId: 'foreign-ViewFieldGroupEntity',
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
      local.universalIdentifierById['foreign-ViewFieldGroupEntity'],
    ).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-group']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
      viewFieldUniversalIdentifiers: ['uid-view-field'],
    });
  });

  it('preserves missing owner/view UID errors and duplicate UID rejection', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for viewFieldGroup group',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(ViewEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('View with id view not found for viewFieldGroup group');
    state.set(ViewEntity, rows().get(ViewEntity)!);
    state.get(ViewFieldGroupEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-group',
        viewId: 'view',
        name: 'Duplicate',
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
