import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatObjectMetadataMapCacheService } from 'src/engine/metadata-modules/flat-object-metadata/services/workspace-flat-object-metadata-map-cache.service';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'app-A';
const entities = [
  ObjectMetadataEntity,
  ApplicationEntity,
  FieldMetadataEntity,
  IndexMetadataEntity,
  ViewEntity,
  ObjectPermissionEntity,
  FieldPermissionEntity,
  SearchFieldMetadataEntity,
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
const child = (id: string, objectMetadataId = 'old') =>
  row(id, { objectMetadataId });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      ObjectMetadataEntity,
      [
        row('old', {
          deletedAt: new Date('2024-01-01'),
          labelIdentifierFieldMetadataId: 'field',
          imageIdentifierFieldMetadataId: 'field',
        }),
        row('new'),
      ],
    ],
    [
      ApplicationEntity,
      [row(applicationId, { deletedAt: new Date('2024-01-01') })],
    ],
    [FieldMetadataEntity, [child('field')]],
    [IndexMetadataEntity, [child('index')]],
    [ViewEntity, [child('view', 'new')]],
    [ObjectPermissionEntity, [child('permission')]],
    [FieldPermissionEntity, [child('field-permission')]],
    [
      SearchFieldMetadataEntity,
      [
        child('search'),
        row('deleted-search', {
          objectMetadataId: 'old',
          deletedAt: new Date('2024-01-01'),
        }),
      ],
    ],
  ]);

// Real workspace-scoped wrappers and converters; only the TypeORM read is fake.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(
        entity === SearchFieldMetadataEntity ? undefined : true,
      );
      if (entity === ObjectMetadataEntity) {
        expect(options.select).toBeUndefined();
      } else {
        expect(options.select).toEqual(
          entity === ApplicationEntity
            ? ['id', 'universalIdentifier']
            : ['id', 'universalIdentifier', 'objectMetadataId'],
        );
      }
      expect(options.relations).toBeUndefined();
      if (entity === FieldPermissionEntity) {
        expect(options).toEqual({
          where: { workspaceId },
          select: ['id', 'universalIdentifier', 'objectMetadataId'],
          withDeleted: true,
        });
      }
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
  const objectRepository = {
    ...pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    manager: ordinaryManager,
  } as Repository<ObjectMetadataEntity>;

  return new WorkspaceFlatObjectMetadataMapCacheService(
    objectRepository,
    pooled<ApplicationEntity>(ApplicationEntity),
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
    scoped<IndexMetadataEntity>(IndexMetadataEntity),
    scoped<ViewEntity>(ViewEntity),
    scoped<ObjectPermissionEntity>(ObjectPermissionEntity),
    scoped<SearchFieldMetadataEntity>(SearchFieldMetadataEntity),
  );
};

describe('WorkspaceFlatObjectMetadataMapCacheService manager-bound computation', () => {
  it('uses eight manager reads in both entry points and resolves soft-deleted rows and three map indexes', async () => {
    const state = rows();
    for (const entity of [
      FieldMetadataEntity,
      IndexMetadataEntity,
      ViewEntity,
      ObjectPermissionEntity,
    ]) {
      state.get(entity)![0].deletedAt = new Date('2024-01-01');
    }
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
    expect(local.byUniversalIdentifier['uid-old']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app-A',
      labelIdentifierFieldMetadataUniversalIdentifier: 'uid-field',
      imageIdentifierFieldMetadataUniversalIdentifier: 'uid-field',
      fieldIds: ['field'],
      fieldUniversalIdentifiers: ['uid-field'],
      indexMetadataIds: ['index'],
      indexMetadataUniversalIdentifiers: ['uid-index'],
      objectPermissionIds: ['permission'],
      objectPermissionUniversalIdentifiers: ['uid-permission'],
      fieldPermissionIds: ['field-permission'],
      fieldPermissionUniversalIdentifiers: ['uid-field-permission'],
      searchFieldMetadataIds: ['search'],
      searchFieldMetadataUniversalIdentifiers: ['uid-search'],
      viewIds: [],
    });
    expect(local.byUniversalIdentifier['uid-new']).toMatchObject({
      viewIds: ['view'],
      viewUniversalIdentifiers: ['uid-view'],
      fieldIds: [],
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

  it('rebuilds all reverse associations after local row changes without altering the first snapshot', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    for (const entity of [
      FieldMetadataEntity,
      IndexMetadataEntity,
      ViewEntity,
      ObjectPermissionEntity,
      FieldPermissionEntity,
      SearchFieldMetadataEntity,
    ]) {
      state.set(entity, [child(`moved-${entity.name}`, 'new')]);
    }
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-old']).toMatchObject({
      fieldIds: [],
      indexMetadataIds: [],
      viewIds: [],
      objectPermissionIds: [],
      fieldPermissionIds: [],
      fieldPermissionUniversalIdentifiers: [],
      searchFieldMetadataIds: [],
      labelIdentifierFieldMetadataUniversalIdentifier: null,
    });
    expect(second.byUniversalIdentifier['uid-new']).toMatchObject({
      fieldIds: ['moved-FieldMetadataEntity'],
      indexMetadataIds: ['moved-IndexMetadataEntity'],
      viewIds: ['moved-ViewEntity'],
      objectPermissionIds: ['moved-ObjectPermissionEntity'],
      fieldPermissionIds: ['moved-FieldPermissionEntity'],
      fieldPermissionUniversalIdentifiers: ['uid-moved-FieldPermissionEntity'],
      searchFieldMetadataIds: ['moved-SearchFieldMetadataEntity'],
    });
    expect(first.byUniversalIdentifier['uid-old']).toMatchObject({
      fieldIds: ['field'],
      indexMetadataIds: ['index'],
      objectPermissionIds: ['permission'],
      fieldPermissionIds: ['field-permission'],
      fieldPermissionUniversalIdentifiers: ['uid-field-permission'],
      searchFieldMetadataIds: ['search'],
    });
  });

  it('filters other-workspace parents and children from every manager read', async () => {
    const state = rows();
    for (const entity of entities) {
      const original = state.get(entity)![0];
      state.get(entity)!.push({
        ...original,
        id: `foreign-${entity.name}`,
        universalIdentifier: `uid-foreign-${entity.name}`,
        workspaceId: 'workspace-B',
        objectMetadataId: 'foreign-ObjectMetadataEntity',
        applicationId: 'foreign-ApplicationEntity',
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
      fieldIds: ['field'],
      indexMetadataIds: ['index'],
      objectPermissionIds: ['permission'],
      fieldPermissionIds: ['field-permission'],
      fieldPermissionUniversalIdentifiers: ['uid-field-permission'],
      searchFieldMetadataIds: ['search'],
    });
    expect(
      isolated.universalIdentifierById['foreign-ObjectMetadataEntity'],
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

  it('preserves native missing-owner and duplicate-identifier errors', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;

    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      `Application with id ${applicationId} not found for objectMetadata old`,
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);

    state.get(ObjectMetadataEntity)![0] = row('old', {
      applicationId: 'missing-app',
    });
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id missing-app not found for objectMetadata old',
    );
    state.get(ObjectMetadataEntity)![0] = rows().get(ObjectMetadataEntity)![0];

    state
      .get(ObjectMetadataEntity)!
      .push(row('duplicate', { universalIdentifier: 'uid-old' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'keeps the scoped invalid-workspace guard for %s',
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
