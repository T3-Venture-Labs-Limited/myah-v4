import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatIndexMapCacheService } from 'src/engine/metadata-modules/flat-index-metadata/services/workspace-flat-index-map-cache.service';
import { IndexMetadataEntity } from 'src/engine/metadata-modules/index-metadata/index-metadata.entity';
import { IndexType } from 'src/engine/metadata-modules/index-metadata/types/indexType.types';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'app-A';
const entities = [
  IndexMetadataEntity,
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
const row = (id: string, extras: Record<string, unknown> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  applicationId,
  ...extras,
});
const timestamp = new Date('2024-01-01T00:00:00.000Z');
const indexField = (id: string, fieldMetadataId: string, order: number) => ({
  id,
  workspaceId,
  indexMetadataId: 'index',
  fieldMetadataId,
  order,
  subFieldName: order === 0 ? 'addressCity' : null,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row(applicationId)]],
    [ObjectMetadataEntity, [row('object', { deletedAt: timestamp })]],
    [
      FieldMetadataEntity,
      [row('field', { deletedAt: timestamp }), row('replacement')],
    ],
    [
      IndexMetadataEntity,
      [
        row('index', {
          objectMetadataId: 'object',
          name: 'composite_unique',
          indexType: IndexType.BTREE,
          isUnique: true,
          indexWhereClause: 'deletedAt IS NULL',
          deletedAt: timestamp,
          indexFieldMetadatas: [
            indexField('index-field', 'field', 0),
            indexField('second-index-field', 'replacement', 1),
          ],
        }),
        row('other-index', {
          objectMetadataId: 'object',
          indexFieldMetadatas: [],
        }),
      ],
    ],
  ]);

// Only TypeORM reads are faked; the scoped wrapper, converter and map insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === IndexMetadataEntity
          ? {
              where: { workspaceId },
              withDeleted: true,
              relationLoadStrategy: 'join',
              relations: ['indexFieldMetadatas'],
            }
          : {
              where: { workspaceId },
              select: ['id', 'universalIdentifier'],
              ...(entity === ApplicationEntity ? {} : { withDeleted: true }),
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

  return new WorkspaceFlatIndexMapCacheService(
    new WorkspaceScopedRepository(
      pooled<IndexMetadataEntity>(IndexMetadataEntity),
    ),
    applicationRepository,
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
  );
};

describe('WorkspaceFlatIndexMapCacheService manager-bound computation', () => {
  it('uses all four exact manager reads in both entry points and converts composite children and maps', async () => {
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
    expect(local.byUniversalIdentifier['uid-index']).toMatchObject({
      id: 'index',
      applicationUniversalIdentifier: 'uid-app-A',
      objectMetadataUniversalIdentifier: 'uid-object',
      isUnique: true,
      indexType: IndexType.BTREE,
      indexWhereClause: 'deletedAt IS NULL',
      flatIndexFieldMetadatas: [
        {
          id: 'index-field',
          fieldMetadataId: 'field',
          createdAt: timestamp.toISOString(),
          subFieldName: 'addressCity',
        },
        { id: 'second-index-field', fieldMetadataId: 'replacement', order: 1 },
      ],
      universalFlatIndexFieldMetadatas: [
        {
          indexMetadataUniversalIdentifier: 'uid-index',
          fieldMetadataUniversalIdentifier: 'uid-field',
          subFieldName: 'addressCity',
          createdAt: timestamp.toISOString(),
        },
        { fieldMetadataUniversalIdentifier: 'uid-replacement', order: 1 },
      ],
    });
    expect(local.byUniversalIdentifier['uid-other-index']).toMatchObject({
      flatIndexFieldMetadatas: [],
      universalFlatIndexFieldMetadatas: [],
    });
    expect(local.universalIdentifierById).toEqual({
      index: 'uid-index',
      'other-index': 'uid-other-index',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-index',
      'uid-other-index',
    ]);
  });

  it('rebuilds from changed local rows without mutating the first snapshot', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    state.get(IndexMetadataEntity)![0] = {
      ...state.get(IndexMetadataEntity)![0],
      name: 'updated',
      indexFieldMetadatas: [indexField('new-child', 'replacement', 0)],
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-index']).toMatchObject({
      name: 'updated',
      flatIndexFieldMetadatas: [{ id: 'new-child' }],
      universalFlatIndexFieldMetadatas: [
        { fieldMetadataUniversalIdentifier: 'uid-replacement' },
      ],
    });
    expect(first.byUniversalIdentifier['uid-index']).toMatchObject({
      name: 'composite_unique',
      flatIndexFieldMetadatas: [
        { id: 'index-field' },
        { id: 'second-index-field' },
      ],
      universalFlatIndexFieldMetadatas: [
        { fieldMetadataUniversalIdentifier: 'uid-field' },
        { fieldMetadataUniversalIdentifier: 'uid-replacement' },
      ],
    });
    for (const entity of entities) {
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
    }
  });

  it('excludes foreign-workspace indexes and lookup rows, and excludes deleted applications', async () => {
    const state = rows();
    for (const entity of entities) {
      const original = state.get(entity)![0];
      state.get(entity)!.push({
        ...original,
        id: `foreign-${entity.name}`,
        universalIdentifier: `uid-foreign-${entity.name}`,
        workspaceId: 'workspace-B',
      });
    }
    state
      .get(ApplicationEntity)!
      .push(row('deleted-app', { deletedAt: timestamp }));
    const manager = fixture(state).manager;
    const provider = service(fixture(new Map()).manager);
    const maps = await provider.computeFromManager(workspaceId, manager);

    expect(Object.keys(maps.byUniversalIdentifier)).toEqual([
      'uid-index',
      'uid-other-index',
    ]);
    expect(maps.byUniversalIdentifier['uid-index']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app-A',
      objectMetadataUniversalIdentifier: 'uid-object',
    });
    expect(
      maps.universalIdentifierById['foreign-IndexMetadataEntity'],
    ).toBeUndefined();

    state.get(IndexMetadataEntity)![0] = {
      ...state.get(IndexMetadataEntity)![0],
      applicationId: 'deleted-app',
    };
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id deleted-app not found for index index',
    );
  });

  it('preserves missing required owner/child and duplicate-map failures', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;

    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      `Application with id ${applicationId} not found for index index`,
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);

    state.get(IndexMetadataEntity)![0] = {
      ...state.get(IndexMetadataEntity)![0],
      objectMetadataId: 'missing-object',
    };
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'ObjectMetadata with id missing-object not found for index index',
    );
    state.get(IndexMetadataEntity)![0] = rows().get(IndexMetadataEntity)![0];

    state.set(FieldMetadataEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'FieldMetadata with id field not found for index field metadata index-field',
    );
    state.set(FieldMetadataEntity, rows().get(FieldMetadataEntity)!);

    state.get(IndexMetadataEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-index',
        objectMetadataId: 'object',
        indexFieldMetadatas: [],
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });
});
