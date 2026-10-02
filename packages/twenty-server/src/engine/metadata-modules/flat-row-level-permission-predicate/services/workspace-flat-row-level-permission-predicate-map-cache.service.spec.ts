import { RowLevelPermissionPredicateOperand } from 'twenty-shared/types';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatRowLevelPermissionPredicateMapCacheService } from 'src/engine/metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-map-cache.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RowLevelPermissionPredicateGroupEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity';
import { RowLevelPermissionPredicateEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  RowLevelPermissionPredicateEntity,
  ApplicationEntity,
  FieldMetadataEntity,
  ObjectMetadataEntity,
  RoleEntity,
  RowLevelPermissionPredicateGroupEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  roleId?: string;
  fieldMetadataId?: string;
  objectMetadataId?: string;
  workspaceMemberFieldMetadataId?: string | null;
  rowLevelPermissionPredicateGroupId?: string | null;
  operand?: RowLevelPermissionPredicateOperand;
  value?: unknown;
  subFieldName?: string | null;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  applicationId: 'app',
  ...extras,
});
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    [
      FieldMetadataEntity,
      [row('field'), row('member-field'), row('other-field')],
    ],
    [ObjectMetadataEntity, [row('object')]],
    [RoleEntity, [row('role'), row('other-role')]],
    [RowLevelPermissionPredicateGroupEntity, [row('group')]],
    [
      RowLevelPermissionPredicateEntity,
      [
        row('predicate', {
          roleId: 'role',
          fieldMetadataId: 'field',
          objectMetadataId: 'object',
          workspaceMemberFieldMetadataId: 'member-field',
          rowLevelPermissionPredicateGroupId: 'group',
          operand: RowLevelPermissionPredicateOperand.CONTAINS,
          value: 'alpha',
          subFieldName: 'name',
          deletedAt: new Date('2024-02-01T00:00:00.000Z'),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        }),
      ],
    ],
  ]);

// Fake only TypeORM I/O. The scoped wrappers, converter and three-index insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === RowLevelPermissionPredicateEntity
          ? {}
          : { select: ['id', 'universalIdentifier'] }),
        withDeleted: true,
      });
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
  return new WorkspaceFlatRowLevelPermissionPredicateMapCacheService(
    scoped<RowLevelPermissionPredicateEntity>(
      RowLevelPermissionPredicateEntity,
    ),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    scoped<RoleEntity>(RoleEntity),
    scoped<RowLevelPermissionPredicateGroupEntity>(
      RowLevelPermissionPredicateGroupEntity,
    ),
  );
};

describe('WorkspaceFlatRowLevelPermissionPredicateMapCacheService manager-bound computation', () => {
  it('binds six exact reads for both entries and retains nullable/required relations and indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-predicate']).toMatchObject({
      id: 'predicate',
      workspaceId,
      applicationUniversalIdentifier: 'uid-app',
      roleUniversalIdentifier: 'uid-role',
      fieldMetadataUniversalIdentifier: 'uid-field',
      objectMetadataUniversalIdentifier: 'uid-object',
      workspaceMemberFieldMetadataUniversalIdentifier: 'uid-member-field',
      rowLevelPermissionPredicateGroupUniversalIdentifier: 'uid-group',
      operand: RowLevelPermissionPredicateOperand.CONTAINS,
      value: 'alpha',
      subFieldName: 'name',
      deletedAt: '2024-02-01T00:00:00.000Z',
    });
    expect(local.universalIdentifierById).toEqual({
      predicate: 'uid-predicate',
    });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-predicate'],
    });
  });

  it('rebuilds memberships and UID indexes on changed local rows without mutating the first result', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(RowLevelPermissionPredicateEntity)![0] = {
      ...state.get(RowLevelPermissionPredicateEntity)![0],
      universalIdentifier: 'uid-predicate-v2',
      roleId: 'other-role',
      fieldMetadataId: 'other-field',
      workspaceMemberFieldMetadataId: null,
      rowLevelPermissionPredicateGroupId: null,
      value: 'beta',
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-predicate']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-predicate-v2']).toMatchObject({
      roleUniversalIdentifier: 'uid-other-role',
      fieldMetadataUniversalIdentifier: 'uid-other-field',
      workspaceMemberFieldMetadataUniversalIdentifier: null,
      rowLevelPermissionPredicateGroupUniversalIdentifier: null,
      value: 'beta',
    });
    expect(second.universalIdentifierById).toEqual({
      predicate: 'uid-predicate-v2',
    });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-predicate-v2'],
    });
    expect(first.byUniversalIdentifier['uid-predicate']).toMatchObject({
      roleUniversalIdentifier: 'uid-role',
      fieldMetadataUniversalIdentifier: 'uid-field',
      workspaceMemberFieldMetadataUniversalIdentifier: 'uid-member-field',
      rowLevelPermissionPredicateGroupUniversalIdentifier: 'uid-group',
      value: 'alpha',
    });
    expect(first.universalIdentifierById).toEqual({
      predicate: 'uid-predicate',
    });
    expect(first.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-predicate'],
    });
    expect(
      pinned.calls.get(RowLevelPermissionPredicateEntity),
    ).toHaveBeenCalledTimes(2);
  });

  it('retains an empty map and filters foreign workspace rows on every read', async () => {
    const state = rows();
    state.set(RowLevelPermissionPredicateEntity, []);
    const provider = service(fixture(new Map()).manager);
    expect(
      (await provider.computeFromManager(workspaceId, fixture(state).manager))
        .byUniversalIdentifier,
    ).toEqual({});
    state
      .get(RowLevelPermissionPredicateEntity)!
      .push(rows().get(RowLevelPermissionPredicateEntity)![0]);
    for (const entity of entities) {
      const original = state.get(entity)![0];
      state.get(entity)!.push({
        ...original,
        workspaceId: 'workspace-B',
        id: `foreign-${entity.name}`,
        universalIdentifier: `uid-foreign-${entity.name}`,
      });
    }
    const local = await provider.computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(local.byUniversalIdentifier)).toEqual(['uid-predicate']);
    expect(local.universalIdentifierById).toEqual({
      predicate: 'uid-predicate',
    });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-predicate'],
    });
  });

  it('retains native missing required owner/relation failures', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const pinned = fixture(state);
    for (const [entity, message] of [
      [ApplicationEntity, 'Application with id app not found'],
      [RoleEntity, 'Role with id role not found'],
      [FieldMetadataEntity, 'FieldMetadata with id field not found'],
      [ObjectMetadataEntity, 'ObjectMetadata with id object not found'],
      [
        RowLevelPermissionPredicateGroupEntity,
        'RowLevelPermissionPredicateGroup with id group not found',
      ],
    ] as const) {
      const original = state.get(entity)!;
      state.set(
        entity,
        entity === FieldMetadataEntity
          ? original.filter((entry) => entry.id !== 'field')
          : [],
      );
      await expect(
        provider.computeFromManager(workspaceId, pinned.manager),
      ).rejects.toThrow(message);
      state.set(entity, original);
    }
  });

  it('retains native missing non-nullable foreign key failure', async () => {
    const state = rows();
    delete state.get(RowLevelPermissionPredicateEntity)![0].roleId;
    await expect(
      service(fixture(new Map()).manager).computeFromManager(
        workspaceId,
        fixture(state).manager,
      ),
    ).rejects.toThrow('Missing non-nullable foreign key roleId');
  });

  it('rejects duplicate predicate universal identifiers rather than overwriting', async () => {
    const state = rows();
    state.get(RowLevelPermissionPredicateEntity)!.push({
      ...state.get(RowLevelPermissionPredicateEntity)![0],
      id: 'duplicate',
    });
    await expect(
      service(fixture(new Map()).manager).computeFromManager(
        workspaceId,
        fixture(state).manager,
      ),
    ).rejects.toThrow('already exists');
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before direct reads',
    async (invalidId) => {
      const directFind = jest.fn();
      const getRepository = jest.fn((entity: Function) => ({
        target: entity,
        find: directFind,
      }));
      const manager = { getRepository } as unknown as EntityManager;
      const provider = service(manager);
      await expect(
        provider.computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      expect(directFind).not.toHaveBeenCalled();
      await expect(
        provider.computeForCache(invalidId as string),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      expect(directFind).not.toHaveBeenCalled();
    },
  );
});
