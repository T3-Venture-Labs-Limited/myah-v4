import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { WorkspaceFlatViewMapCacheService } from 'src/engine/metadata-modules/flat-view/services/workspace-flat-view-map-cache.service';
import { ViewFieldGroupEntity } from 'src/engine/metadata-modules/view-field-group/entities/view-field-group.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewFilterGroupEntity } from 'src/engine/metadata-modules/view-filter-group/entities/view-filter-group.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewGroupEntity } from 'src/engine/metadata-modules/view-group/entities/view-group.entity';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'app-A';
const children = [
  ViewFieldEntity,
  ViewFilterEntity,
  ViewGroupEntity,
  ViewFilterGroupEntity,
  ViewSortEntity,
  ViewFieldGroupEntity,
] as const;
const entities = [
  ViewEntity,
  ApplicationEntity,
  ObjectMetadataEntity,
  FieldMetadataEntity,
  ...children,
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
  applicationId,
  ...extras,
});
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      ApplicationEntity,
      [row(applicationId, { deletedAt: new Date('2024-01-01') })],
    ],
    [
      ObjectMetadataEntity,
      [row('object', { deletedAt: new Date('2024-01-01') })],
    ],
    [
      FieldMetadataEntity,
      [row('field', { deletedAt: new Date('2024-01-01') })],
    ],
    [
      ViewEntity,
      [
        row('view', {
          objectMetadataId: 'object',
          calendarFieldMetadataId: 'field',
          kanbanAggregateOperationFieldMetadataId: 'field',
          mainGroupByFieldMetadataId: 'field',
          overrides: {
            calendarFieldMetadataId: 'field',
            mainGroupByFieldMetadataId: 'field',
          },
          deletedAt: new Date('2024-01-01'),
        }),
        row('other-view', { objectMetadataId: 'object' }),
      ],
    ],
    ...children.map(
      (entity) =>
        [
          entity,
          [
            row(`child-${entity.name}`, {
              viewId: 'view',
              deletedAt: new Date('2024-01-01'),
            }),
          ],
        ] as [Function, Row[]],
    ),
  ]);

// Fake only TypeORM reads. Scoped wrappers, provider, conversion and map insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(true);
      expect(options.select).toEqual(
        entity === ViewEntity
          ? undefined
          : entity === ApplicationEntity ||
              entity === ObjectMetadataEntity ||
              entity === FieldMetadataEntity
            ? ['id', 'universalIdentifier']
            : ['id', 'universalIdentifier', 'viewId'],
      );
      expect(options.relations).toBeUndefined();
      return (state.get(entity) ?? []).filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          (options.withDeleted || !entry.deletedAt),
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
  const applicationRepository = {
    ...pooled<ApplicationEntity>(ApplicationEntity),
    manager: ordinaryManager,
  } as Repository<ApplicationEntity>;

  return new WorkspaceFlatViewMapCacheService(
    scoped<ViewEntity>(ViewEntity),
    applicationRepository,
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
    scoped<ViewFieldEntity>(ViewFieldEntity),
    scoped<ViewFilterEntity>(ViewFilterEntity),
    scoped<ViewGroupEntity>(ViewGroupEntity),
    scoped<ViewFilterGroupEntity>(ViewFilterGroupEntity),
    scoped<ViewSortEntity>(ViewSortEntity),
    scoped<ViewFieldGroupEntity>(ViewFieldGroupEntity),
  );
};

const associations = [
  ['viewFieldIds', 'viewFieldUniversalIdentifiers', ViewFieldEntity],
  ['viewFilterIds', 'viewFilterUniversalIdentifiers', ViewFilterEntity],
  ['viewGroupIds', 'viewGroupUniversalIdentifiers', ViewGroupEntity],
  [
    'viewFilterGroupIds',
    'viewFilterGroupUniversalIdentifiers',
    ViewFilterGroupEntity,
  ],
  ['viewSortIds', 'viewSortUniversalIdentifiers', ViewSortEntity],
  [
    'viewFieldGroupIds',
    'viewFieldGroupUniversalIdentifiers',
    ViewFieldGroupEntity,
  ],
] as const;

describe('WorkspaceFlatViewMapCacheService manager-bound computation', () => {
  it('uses all ten manager reads through both entry points and resolves deleted rows and indexes', async () => {
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
    const view = local.byUniversalIdentifier['uid-view'];
    expect(view).toMatchObject({
      applicationUniversalIdentifier: 'uid-app-A',
      objectMetadataUniversalIdentifier: 'uid-object',
      calendarFieldMetadataUniversalIdentifier: 'uid-field',
      kanbanAggregateOperationFieldMetadataUniversalIdentifier: 'uid-field',
      mainGroupByFieldMetadataUniversalIdentifier: 'uid-field',
      universalOverrides: {
        calendarFieldMetadataUniversalIdentifier: 'uid-field',
        mainGroupByFieldMetadataUniversalIdentifier: 'uid-field',
      },
    });
    for (const [ids, uids, entity] of associations) {
      expect(view).toMatchObject({
        [ids]: [`child-${entity.name}`],
        [uids]: [`uid-child-${entity.name}`],
      });
      expect(local.byUniversalIdentifier['uid-other-view']).toMatchObject({
        [ids]: [],
      });
    }
    expect(local.universalIdentifierById).toEqual({
      view: 'uid-view',
      'other-view': 'uid-other-view',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-view',
      'uid-other-view',
    ]);
  });

  it('rebuilds six associations and field UID references after changed local rows without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    state.get(FieldMetadataEntity)!.push(row('replacement'));
    const originalView = state.get(ViewEntity)![0];
    state.get(ViewEntity)![0] = {
      ...originalView,
      calendarFieldMetadataId: 'replacement',
      kanbanAggregateOperationFieldMetadataId: 'replacement',
      mainGroupByFieldMetadataId: 'replacement',
      overrides: { calendarFieldMetadataId: 'replacement' },
    };
    for (const entity of children) {
      state.set(entity, [
        row(`moved-${entity.name}`, { viewId: 'other-view' }),
      ]);
    }
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-view']).toMatchObject({
      calendarFieldMetadataUniversalIdentifier: 'uid-replacement',
      kanbanAggregateOperationFieldMetadataUniversalIdentifier:
        'uid-replacement',
      mainGroupByFieldMetadataUniversalIdentifier: 'uid-replacement',
      universalOverrides: {
        calendarFieldMetadataUniversalIdentifier: 'uid-replacement',
      },
    });
    for (const [ids, uids, entity] of associations) {
      expect(second.byUniversalIdentifier['uid-view']).toMatchObject({
        [ids]: [],
      });
      expect(second.byUniversalIdentifier['uid-other-view']).toMatchObject({
        [ids]: [`moved-${entity.name}`],
        [uids]: [`uid-moved-${entity.name}`],
      });
      expect(first.byUniversalIdentifier['uid-view']).toMatchObject({
        [ids]: [`child-${entity.name}`],
      });
    }
    expect(first.byUniversalIdentifier['uid-view']).toMatchObject({
      calendarFieldMetadataUniversalIdentifier: 'uid-field',
      universalOverrides: {
        calendarFieldMetadataUniversalIdentifier: 'uid-field',
      },
    });
  });

  it('isolates foreign-workspace parents and children on every manager read', async () => {
    const state = rows();
    for (const entity of entities) {
      const original = state.get(entity)![0];
      state.get(entity)!.push({
        ...original,
        id: `foreign-${entity.name}`,
        universalIdentifier: `uid-foreign-${entity.name}`,
        workspaceId: 'workspace-B',
        viewId: 'view',
        objectMetadataId: 'foreign-ObjectMetadataEntity',
        applicationId: 'foreign-ApplicationEntity',
      });
    }
    const isolated = await service(
      fixture(new Map()).manager,
    ).computeFromManager(workspaceId, fixture(state).manager);
    expect(Object.keys(isolated.byUniversalIdentifier)).toEqual([
      'uid-view',
      'uid-other-view',
    ]);
    for (const [ids, , entity] of associations) {
      expect(isolated.byUniversalIdentifier['uid-view']).toMatchObject({
        [ids]: [`child-${entity.name}`],
      });
    }
    expect(
      isolated.universalIdentifierById['foreign-ViewEntity'],
    ).toBeUndefined();
  });

  it('retains native required owner/relation errors and duplicate UID rejection, but nullable overrides remain null', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;

    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      `Application with id ${applicationId} not found for view view`,
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);

    state.get(ViewEntity)![0].objectMetadataId = 'missing-object';
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'ObjectMetadata with id missing-object not found for view view',
    );
    state.get(ViewEntity)![0].objectMetadataId = 'object';

    state.get(ViewEntity)![0].calendarFieldMetadataId = 'missing-field';
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'FieldMetadata with id missing-field not found for view view',
    );
    state.get(ViewEntity)![0].calendarFieldMetadataId = 'field';
    state.get(ViewEntity)![0].overrides = {
      calendarFieldMetadataId: 'missing-field',
    };
    expect(
      (await provider.computeFromManager(workspaceId, manager))
        .byUniversalIdentifier['uid-view'],
    ).toMatchObject({
      universalOverrides: { calendarFieldMetadataUniversalIdentifier: null },
    });

    state.get(ViewEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-view',
        objectMetadataId: 'object',
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'preserves the scoped invalid-workspace guard for %s',
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
