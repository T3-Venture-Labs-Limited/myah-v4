import { FieldMetadataType } from 'twenty-shared/types';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatSearchFieldMetadataMapCacheService } from 'src/engine/metadata-modules/flat-search-field-metadata/services/workspace-flat-search-field-metadata-map-cache.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { SEARCH_VECTOR_FIELD } from 'src/engine/metadata-modules/search-field-metadata/constants/search-vector-field.constants';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'application-A';
const entities = [
  SearchFieldMetadataEntity,
  ApplicationEntity,
  ObjectMetadataEntity,
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
const date = new Date('2024-01-01T00:00:00.000Z');
const row = (id: string, extras: Record<string, unknown> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  applicationId,
  ...extras,
});
const search = (
  id: string,
  objectMetadataId: string,
  fieldMetadataId: string,
  tsVectorFieldMetadataId: string | null,
): Row =>
  row(id, {
    objectMetadataId,
    fieldMetadataId,
    tsVectorFieldMetadataId,
    position: 0,
    createdAt: date,
    updatedAt: date,
  });
const vector = (id: string, objectMetadataId: string): Row =>
  row(id, {
    objectMetadataId,
    name: SEARCH_VECTOR_FIELD.name,
    type: FieldMetadataType.TS_VECTOR,
    deletedAt: date,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row(applicationId, { deletedAt: date })]],
    [
      ObjectMetadataEntity,
      [row('object-1', { deletedAt: date }), row('object-2')],
    ],
    [
      FieldMetadataEntity,
      [
        vector('vector-1', 'object-1'),
        vector('vector-2', 'object-2'),
        row('field-1', {
          objectMetadataId: 'object-1',
          deletedAt: date,
          name: 'title',
          type: FieldMetadataType.TEXT,
        }),
        row('field-2', {
          objectMetadataId: 'object-2',
          name: 'name',
          type: FieldMetadataType.TEXT,
        }),
        row('field-3', {
          objectMetadataId: 'object-1',
          name: 'summary',
          type: FieldMetadataType.TEXT,
        }),
      ],
    ],
    [
      SearchFieldMetadataEntity,
      [
        search('legacy-1', 'object-1', 'field-1', null),
        search('legacy-2', 'object-2', 'field-2', null),
        search('explicit', 'object-1', 'field-3', 'vector-2'),
      ],
    ],
  ]);

// The real scoped wrapper and converter run; only the TypeORM repositories are fake.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === SearchFieldMetadataEntity
          ? { where: { workspaceId } }
          : {
              where: { workspaceId },
              select:
                entity === FieldMetadataEntity
                  ? [
                      'id',
                      'universalIdentifier',
                      'name',
                      'type',
                      'objectMetadataId',
                    ]
                  : ['id', 'universalIdentifier'],
              withDeleted: true,
            },
      );
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
  const applicationRepository = {
    ...pooled<ApplicationEntity>(ApplicationEntity),
    manager: ordinaryManager,
  } as Repository<ApplicationEntity>;
  return new WorkspaceFlatSearchFieldMetadataMapCacheService(
    new WorkspaceScopedRepository(
      pooled<SearchFieldMetadataEntity>(SearchFieldMetadataEntity),
    ),
    applicationRepository,
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
  );
};

describe('WorkspaceFlatSearchFieldMetadataMapCacheService manager-bound computation', () => {
  it('uses all four exact manager reads from both entry points and retains legacy fallback, explicit FK, conversion and indexes', async () => {
    const state = rows();
    const ordinary = fixture(state);
    const pinned = fixture(state);
    const provider = service(ordinary.manager);

    // Baseline behavior RED: the old computeForCache hits POOLED_READ before producing these maps.
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
    expect(local.byUniversalIdentifier['uid-legacy-1']).toMatchObject({
      id: 'legacy-1',
      applicationUniversalIdentifier: 'uid-application-A',
      objectMetadataUniversalIdentifier: 'uid-object-1',
      fieldMetadataUniversalIdentifier: 'uid-field-1',
      tsVectorFieldMetadataId: 'vector-1',
      tsVectorFieldMetadataUniversalIdentifier: 'uid-vector-1',
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
    expect(local.byUniversalIdentifier['uid-legacy-2']).toMatchObject({
      tsVectorFieldMetadataId: 'vector-2',
      tsVectorFieldMetadataUniversalIdentifier: 'uid-vector-2',
    });
    expect(local.byUniversalIdentifier['uid-explicit']).toMatchObject({
      tsVectorFieldMetadataId: 'vector-2',
      tsVectorFieldMetadataUniversalIdentifier: 'uid-vector-2',
    });
    expect(local.universalIdentifierById).toEqual({
      'legacy-1': 'uid-legacy-1',
      'legacy-2': 'uid-legacy-2',
      explicit: 'uid-explicit',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-legacy-1',
      'uid-legacy-2',
      'uid-explicit',
    ]);
  });

  it('rebuilds legacy NULL-FK resolution from changed local rows without changing the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state
      .get(FieldMetadataEntity)!
      .splice(0, 1, vector('replacement', 'object-1'));
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(first.byUniversalIdentifier['uid-legacy-1']).toMatchObject({
      tsVectorFieldMetadataId: 'vector-1',
      tsVectorFieldMetadataUniversalIdentifier: 'uid-vector-1',
    });
    expect(second.byUniversalIdentifier['uid-legacy-1']).toMatchObject({
      tsVectorFieldMetadataId: 'replacement',
      tsVectorFieldMetadataUniversalIdentifier: 'uid-replacement',
    });
    expect(second.byUniversalIdentifier['uid-legacy-2']).toMatchObject({
      tsVectorFieldMetadataUniversalIdentifier: 'uid-vector-2',
    });
    expect(pinned.calls.get(FieldMetadataEntity)).toHaveBeenCalledTimes(2);
  });

  it('scopes all queries and keeps deleted field owners while excluding foreign rows', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          objectMetadataId: 'object-1',
          fieldMetadataId: 'field-1',
          tsVectorFieldMetadataId: 'vector-1',
          createdAt: date,
          updatedAt: date,
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-legacy-1',
      'uid-legacy-2',
      'uid-explicit',
    ]);
    expect(local.byUniversalIdentifier['uid-legacy-1']).toMatchObject({
      fieldMetadataUniversalIdentifier: 'uid-field-1',
    });
  });

  it('preserves missing-owner and duplicate-UID failures, and scoped invalid-workspace guard', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow('Application with id application-A not found');
    state.set(ApplicationEntity, [row(applicationId)]);
    state.get(FieldMetadataEntity)!.splice(0, 1);
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow('TS_VECTOR field metadata with id null not found');
    state.get(FieldMetadataEntity)!.unshift(vector('vector-1', 'object-1'));
    state.get(SearchFieldMetadataEntity)!.push({
      ...search('duplicate', 'object-1', 'field-1', 'vector-1'),
      universalIdentifier: 'uid-legacy-1',
    });
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow('flat entity to add already exists');
    await expect(
      provider.computeFromManager('', fixture(state).manager),
    ).rejects.toThrow('workspaceId must be a non-empty string');
  });
});
