import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatFieldMetadataMapCacheService } from 'src/engine/metadata-modules/flat-field-metadata/services/workspace-flat-field-metadata-map-cache.service';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewGroupEntity } from 'src/engine/metadata-modules/view-group/entities/view-group.entity';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'application-A';
const objectId = 'object-A';
const entities = [
  FieldMetadataEntity,
  FieldPermissionEntity,
  IndexMetadataEntity,
  ObjectMetadataEntity,
  ApplicationEntity,
  ViewFieldEntity,
  ViewFilterEntity,
  ViewSortEntity,
  ViewEntity,
  SearchFieldMetadataEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  deletedAt?: Date | null;
  [key: string]: unknown;
};
type Rows = Map<Function, Row[]>;

const field = (id: string, extras: Record<string, unknown> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  applicationId,
  objectMetadataId: objectId,
  name: id,
  label: id,
  type: FieldMetadataType.TEXT,
  settings: null,
  relationTargetFieldMetadataId: null,
  relationTargetObjectMetadataId: null,
  ...extras,
});
const child = (id: string, fieldMetadataId: string): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  fieldMetadataId,
});
const view = (id: string, fieldMetadataId: string): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  calendarFieldMetadataId: fieldMetadataId,
  kanbanAggregateOperationFieldMetadataId: fieldMetadataId,
  mainGroupByFieldMetadataId: fieldMetadataId,
  deletedAt: new Date('2024-01-01'),
});
const index = (id: string, fieldIds: string[]): Row => ({
  id,
  workspaceId,
  isUnique: true,
  indexFieldMetadatas: fieldIds.map((fieldMetadataId) => ({
    fieldMetadataId,
    subFieldName: null,
  })),
});

const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      FieldMetadataEntity,
      [field('old', { deletedAt: new Date('2024-01-01') }), field('new')],
    ],
    [
      IndexMetadataEntity,
      [
        index('single', ['old']),
        {
          ...index('partial-composite', ['old', 'new']),
          indexWhereClause: '"isActive" = true',
        },
      ],
    ],
    [
      ObjectMetadataEntity,
      [
        {
          id: objectId,
          workspaceId,
          universalIdentifier: 'uid-object',
          deletedAt: new Date('2024-01-01'),
        },
      ],
    ],
    [
      ApplicationEntity,
      [
        {
          id: applicationId,
          workspaceId,
          universalIdentifier: 'uid-application',
          deletedAt: new Date('2024-01-01'),
        },
      ],
    ],
    [FieldPermissionEntity, [child('permission', 'old')]],
    [ViewFieldEntity, [child('view-field', 'old')]],
    [ViewFilterEntity, [child('view-filter', 'old')]],
    [ViewSortEntity, [child('view-sort', 'old')]],
    [ViewEntity, [view('view', 'old')]],
    [SearchFieldMetadataEntity, [child('search', 'old')]],
  ]);

// Real scoped wrappers bind through repository.target; only the database read is fake.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({
        workspaceId,
        ...(entity === IndexMetadataEntity ? { isUnique: true } : {}),
      });
      expect(options.withDeleted).toBe(
        entity === SearchFieldMetadataEntity ? undefined : true,
      );
      if (entity === FieldPermissionEntity) {
        expect(options).toEqual({
          where: { workspaceId },
          select: ['id', 'universalIdentifier', 'fieldMetadataId'],
          withDeleted: true,
        });
      }
      if (entity === IndexMetadataEntity) {
        expect(options.relations).toEqual(['indexFieldMetadatas']);
      } else if (
        entity === ObjectMetadataEntity ||
        entity === ApplicationEntity
      ) {
        expect(options.select).toEqual(['id', 'universalIdentifier']);
      } else if (entity === ViewEntity) {
        expect(options.select).toEqual([
          'id',
          'universalIdentifier',
          'kanbanAggregateOperationFieldMetadataId',
          'calendarFieldMetadataId',
          'mainGroupByFieldMetadataId',
        ]);
      } else if (
        entity === FieldPermissionEntity ||
        entity === ViewFieldEntity ||
        entity === ViewFilterEntity ||
        entity === ViewSortEntity ||
        entity === SearchFieldMetadataEntity
      ) {
        expect(options.select).toEqual([
          'id',
          'universalIdentifier',
          'fieldMetadataId',
        ]);
      }
      // This fake enforces the workspace predicate even if a caller mistakenly
      // supplies another workspace's rows to the same repository.
      return (state.get(entity) ?? []).filter(
        (row) =>
          row.workspaceId === workspaceId &&
          (options.withDeleted || !row.deletedAt) &&
          (entity !== IndexMetadataEntity || row.isUnique === true),
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
  const fieldRepository = {
    ...pooled<FieldMetadataEntity>(FieldMetadataEntity),
    manager: ordinaryManager,
  } as Repository<FieldMetadataEntity>;

  return new WorkspaceFlatFieldMetadataMapCacheService(
    fieldRepository,
    scoped<IndexMetadataEntity>(IndexMetadataEntity),
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    pooled<ApplicationEntity>(ApplicationEntity),
    scoped<ViewFieldEntity>(ViewFieldEntity),
    scoped<ViewFilterEntity>(ViewFilterEntity),
    scoped<ViewGroupEntity>(ViewGroupEntity),
    scoped<ViewSortEntity>(ViewSortEntity),
    scoped<ViewEntity>(ViewEntity),
    scoped<SearchFieldMetadataEntity>(SearchFieldMetadataEntity),
  );
};

describe('WorkspaceFlatFieldMetadataMapCacheService manager-bound computation', () => {
  it('uses the same nontrivial conversion for production cache reads and explicit manager reads, without pooled reads', async () => {
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
    const old = local.byUniversalIdentifier['uid-old'];
    const replacement = local.byUniversalIdentifier['uid-new'];

    expect(old).toMatchObject({
      objectMetadataUniversalIdentifier: 'uid-object',
      applicationUniversalIdentifier: 'uid-application',
      isUnique: true,
      viewFieldIds: ['view-field'],
      viewFieldUniversalIdentifiers: ['uid-view-field'],
      fieldPermissionIds: ['permission'],
      fieldPermissionUniversalIdentifiers: ['uid-permission'],
      viewFilterIds: ['view-filter'],
      viewSortIds: ['view-sort'],
      searchFieldMetadataIds: ['search'],
      calendarViewIds: ['view'],
      kanbanAggregateOperationViewIds: ['view'],
      mainGroupByFieldMetadataViewIds: ['view'],
    });
    expect(replacement).toMatchObject({
      isUnique: false,
      viewFieldIds: [],
      fieldPermissionIds: [],
      fieldPermissionUniversalIdentifiers: [],
    });
    expect(local.universalIdentifierById).toEqual({
      old: 'uid-old',
      new: 'uid-new',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-old',
      'uid-new',
    ]);
  });

  it('rebuilds reverse edges and uniqueness after local row changes, without mutating the first result', async () => {
    const state = rows();
    const local = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(workspaceId, local.manager);

    for (const entity of [
      ViewFieldEntity,
      ViewFilterEntity,
      ViewSortEntity,
      SearchFieldMetadataEntity,
    ]) {
      state.set(entity, [child(entity.name, 'new')]);
    }
    state.set(FieldPermissionEntity, [child('moved-permission', 'new')]);
    state.set(ViewEntity, [view('moved-view', 'new')]);
    state.set(IndexMetadataEntity, [index('new-single', ['new'])]);
    const second = await provider.computeFromManager(
      workspaceId,
      local.manager,
    );

    expect(second.byUniversalIdentifier['uid-old']).toMatchObject({
      isUnique: false,
      viewFieldIds: [],
      fieldPermissionIds: [],
      fieldPermissionUniversalIdentifiers: [],
      viewFilterIds: [],
      viewSortIds: [],
      searchFieldMetadataIds: [],
      calendarViewIds: [],
      kanbanAggregateOperationViewIds: [],
      mainGroupByFieldMetadataViewIds: [],
    });
    expect(second.byUniversalIdentifier['uid-new']).toMatchObject({
      isUnique: true,
      viewFieldIds: [ViewFieldEntity.name],
      fieldPermissionIds: ['moved-permission'],
      fieldPermissionUniversalIdentifiers: ['uid-moved-permission'],
      viewFilterIds: [ViewFilterEntity.name],
      viewSortIds: [ViewSortEntity.name],
      searchFieldMetadataIds: [SearchFieldMetadataEntity.name],
      calendarViewIds: ['moved-view'],
      kanbanAggregateOperationViewIds: ['moved-view'],
      mainGroupByFieldMetadataViewIds: ['moved-view'],
    });
    expect(first.byUniversalIdentifier['uid-old']).toMatchObject({
      viewFieldIds: ['view-field'],
      fieldPermissionIds: ['permission'],
      fieldPermissionUniversalIdentifiers: ['uid-permission'],
      isUnique: true,
    });
  });

  it('resolves reciprocal relations, their junction target and both map indexes', async () => {
    const state = rows();
    state.set(FieldMetadataEntity, [
      field('left', {
        type: FieldMetadataType.RELATION,
        relationTargetFieldMetadataId: 'right',
        relationTargetObjectMetadataId: objectId,
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          junctionTargetFieldId: 'right',
        },
      }),
      field('right', {
        type: FieldMetadataType.RELATION,
        relationTargetFieldMetadataId: 'left',
        relationTargetObjectMetadataId: objectId,
        settings: { relationType: RelationType.ONE_TO_MANY },
      }),
    ]);
    state.set(IndexMetadataEntity, []);
    const maps = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );

    expect(maps.byUniversalIdentifier['uid-left']).toMatchObject({
      relationTargetFieldMetadataUniversalIdentifier: 'uid-right',
      relationTargetObjectMetadataUniversalIdentifier: 'uid-object',
      universalSettings: {
        junctionTargetFieldUniversalIdentifier: 'uid-right',
      },
      isUnique: false,
    });
    expect(maps.byUniversalIdentifier['uid-right']).toMatchObject({
      relationTargetFieldMetadataUniversalIdentifier: 'uid-left',
    });
    expect(maps.universalIdentifierById).toEqual({
      left: 'uid-left',
      right: 'uid-right',
    });
    expect(maps.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-left',
      'uid-right',
    ]);
  });

  it('scopes every manager read, including child rows from another workspace', async () => {
    const state = rows();

    for (const entity of entities) {
      const original = state.get(entity)![0];

      state.get(entity)!.push({
        ...original,
        id: `foreign-${entity.name}`,
        workspaceId: 'workspace-B',
        universalIdentifier: `uid-foreign-${entity.name}`,
        applicationId: 'foreign-ApplicationEntity',
        objectMetadataId: 'foreign-ObjectMetadataEntity',
        indexFieldMetadatas: [
          {
            fieldMetadataId: 'foreign-FieldMetadataEntity',
            subFieldName: null,
          },
        ],
        fieldMetadataId: 'foreign-FieldMetadataEntity',
        calendarFieldMetadataId: 'foreign-FieldMetadataEntity',
        kanbanAggregateOperationFieldMetadataId: 'foreign-FieldMetadataEntity',
        mainGroupByFieldMetadataId: 'foreign-FieldMetadataEntity',
      });
    }

    const isolated = await service(
      fixture(new Map()).manager,
    ).computeFromManager(workspaceId, fixture(state).manager);

    expect(Object.keys(isolated.byUniversalIdentifier)).toEqual([
      'uid-old',
      'uid-new',
    ]);
    expect(isolated.byUniversalIdentifier['uid-old']).toMatchObject({
      viewFieldIds: ['view-field'],
      fieldPermissionIds: ['permission'],
      fieldPermissionUniversalIdentifiers: ['uid-permission'],
      viewFilterIds: ['view-filter'],
      viewSortIds: ['view-sort'],
      searchFieldMetadataIds: ['search'],
      calendarViewIds: ['view'],
      isUnique: true,
    });
    expect(
      isolated.universalIdentifierById['foreign-FieldMetadataEntity'],
    ).toBeUndefined();
  });

  it('keeps both permission associations empty when no permission rows exist', async () => {
    const state = rows();
    state.set(FieldPermissionEntity, []);
    const maps = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );

    expect(maps.byUniversalIdentifier['uid-old']).toMatchObject({
      fieldPermissionIds: [],
      fieldPermissionUniversalIdentifiers: [],
    });
    expect(maps.universalIdentifierById.old).toBe('uid-old');
    expect(maps.universalIdentifiersByApplicationId[applicationId]).toContain(
      'uid-old',
    );
  });

  it('preserves native missing-owner, missing-relation and duplicate-UID failures', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;

    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      `Application with id ${applicationId} not found for fieldMetadata old`,
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);

    state.set(ObjectMetadataEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      `ObjectMetadata with id ${objectId} not found for fieldMetadata old`,
    );
    state.set(ObjectMetadataEntity, rows().get(ObjectMetadataEntity)!);

    state.get(FieldMetadataEntity)![0] = field('old', {
      type: FieldMetadataType.RELATION,
      relationTargetFieldMetadataId: 'missing-target',
      settings: { relationType: RelationType.MANY_TO_ONE },
    });
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'FieldMetadata with id missing-target not found for fieldMetadata old',
    );
    state.get(FieldMetadataEntity)![0] = rows().get(FieldMetadataEntity)![0];

    state
      .get(FieldMetadataEntity)!
      .push(field('duplicate', { universalIdentifier: 'uid-old' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'rejects invalid workspace ID %s at the scoped boundary',
    async (invalidWorkspaceId) => {
      // A plain non-rejecting field read avoids a dangling promise when the
      // following scoped index repository rejects before Promise.all is formed.
      const manager = {
        getRepository: (entity: Function) => ({
          target: entity,
          find: () => Promise.resolve([]),
        }),
      } as unknown as EntityManager;

      await expect(
        service(manager).computeFromManager(
          invalidWorkspaceId as string,
          manager,
        ),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
    },
  );
});
