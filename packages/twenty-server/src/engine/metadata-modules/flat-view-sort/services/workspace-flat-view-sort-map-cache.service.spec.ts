import { ViewSortDirection } from 'twenty-shared/types';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatViewSortMapCacheService } from 'src/engine/metadata-modules/flat-view-sort/services/workspace-flat-view-sort-map-cache.service';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  ViewSortEntity,
  ApplicationEntity,
  ViewEntity,
  FieldMetadataEntity,
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
    [FieldMetadataEntity, [row('field'), row('replacement')]],
    [
      ViewSortEntity,
      [
        row('sort', {
          fieldMetadataId: 'field',
          viewId: 'view',
          direction: ViewSortDirection.DESC,
          subFieldName: 'amount',
          deletedAt: new Date('2024-01-01'),
        }),
        row('other', {
          fieldMetadataId: 'field',
          viewId: 'view',
          direction: ViewSortDirection.ASC,
          subFieldName: null,
        }),
      ],
    ],
  ]);

// Fake only TypeORM I/O; use the real provider, scoped wrappers, converter and indexes.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(true);
      expect(options.select).toEqual(
        entity === ViewSortEntity ? undefined : ['id', 'universalIdentifier'],
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
  return new WorkspaceFlatViewSortMapCacheService(
    scoped<ViewSortEntity>(ViewSortEntity),
    scoped<ViewEntity>(ViewEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
  );
};

describe('WorkspaceFlatViewSortMapCacheService manager-bound computation', () => {
  it('uses all four manager reads through both entry points and resolves sorts and three indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-sort']).toMatchObject({
      direction: ViewSortDirection.DESC,
      subFieldName: 'amount',
      applicationUniversalIdentifier: 'uid-app',
      fieldMetadataUniversalIdentifier: 'uid-field',
      viewUniversalIdentifier: 'uid-view',
    });
    expect(local.byUniversalIdentifier['uid-other']).toMatchObject({
      direction: ViewSortDirection.ASC,
      subFieldName: null,
    });
    expect(local.universalIdentifierById).toEqual({
      sort: 'uid-sort',
      other: 'uid-other',
    });
    expect(local.universalIdentifiersByApplicationId['app']).toEqual([
      'uid-sort',
      'uid-other',
    ]);
  });

  it('recomputes a second local sort, field and view state without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(ViewEntity)!.push(row('new-view'));
    state.get(ViewSortEntity)![0] = {
      ...state.get(ViewSortEntity)![0],
      fieldMetadataId: 'replacement',
      viewId: 'new-view',
      direction: ViewSortDirection.ASC,
      subFieldName: 'year',
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-sort']).toMatchObject({
      fieldMetadataUniversalIdentifier: 'uid-replacement',
      viewUniversalIdentifier: 'uid-new-view',
      direction: ViewSortDirection.ASC,
      subFieldName: 'year',
    });
    expect(first.byUniversalIdentifier['uid-sort']).toMatchObject({
      fieldMetadataUniversalIdentifier: 'uid-field',
      viewUniversalIdentifier: 'uid-view',
      direction: ViewSortDirection.DESC,
      subFieldName: 'amount',
    });
  });

  it('excludes foreign workspace rows and retains real deleted owner and sort inclusion', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          fieldMetadataId: 'foreign-FieldMetadataEntity',
          viewId: 'foreign-ViewEntity',
          direction: ViewSortDirection.ASC,
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-sort',
      'uid-other',
    ]);
    expect(
      local.universalIdentifierById['foreign-ViewSortEntity'],
    ).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-sort']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewUniversalIdentifier: 'uid-view',
    });
  });

  it('preserves missing owner/view/field and duplicate UID errors', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Application with id app not found for viewSort sort');
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(ViewEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('View with id view not found for viewSort sort');
    state.set(ViewEntity, rows().get(ViewEntity)!);
    state.set(FieldMetadataEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'FieldMetadata with id field not found for viewSort sort',
    );
    state.set(FieldMetadataEntity, rows().get(FieldMetadataEntity)!);
    state.get(ViewSortEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-sort',
        fieldMetadataId: 'field',
        viewId: 'view',
        direction: ViewSortDirection.ASC,
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
