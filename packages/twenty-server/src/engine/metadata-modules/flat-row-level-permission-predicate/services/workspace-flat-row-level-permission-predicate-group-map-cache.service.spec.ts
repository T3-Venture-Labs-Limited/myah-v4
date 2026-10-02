import { RowLevelPermissionPredicateGroupLogicalOperator } from 'twenty-shared/types';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService } from 'src/engine/metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-group-map-cache.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RowLevelPermissionPredicateGroupEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity';
import { RowLevelPermissionPredicateEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  RowLevelPermissionPredicateGroupEntity,
  ApplicationEntity,
  ObjectMetadataEntity,
  RoleEntity,
  RowLevelPermissionPredicateEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  objectMetadataId?: string;
  roleId?: string;
  parentRowLevelPermissionPredicateGroupId?: string | null;
  rowLevelPermissionPredicateGroupId?: string | null;
  logicalOperator?: RowLevelPermissionPredicateGroupLogicalOperator;
  positionInRowLevelPermissionPredicateGroup?: number | null;
  deletedAt?: Date | null;
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
    [ObjectMetadataEntity, [row('object')]],
    [RoleEntity, [row('role')]],
    [
      RowLevelPermissionPredicateGroupEntity,
      [
        row('old-parent', {
          objectMetadataId: 'object',
          roleId: 'role',
          parentRowLevelPermissionPredicateGroupId: null,
          logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
          deletedAt: new Date('2024-02-01T00:00:00.000Z'),
        }),
        row('new-parent', {
          objectMetadataId: 'object',
          roleId: 'role',
          parentRowLevelPermissionPredicateGroupId: null,
          logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.OR,
        }),
        row('child', {
          objectMetadataId: 'object',
          roleId: 'role',
          parentRowLevelPermissionPredicateGroupId: 'old-parent',
          positionInRowLevelPermissionPredicateGroup: 1,
          logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
        }),
      ],
    ],
    [
      RowLevelPermissionPredicateEntity,
      [row('predicate', { rowLevelPermissionPredicateGroupId: 'old-parent' })],
    ],
  ]);

// Fake only TypeORM I/O: provider, scoped wrappers, converter and indexes are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === RowLevelPermissionPredicateGroupEntity
          ? {}
          : entity === RowLevelPermissionPredicateEntity
            ? {
                select: [
                  'id',
                  'universalIdentifier',
                  'rowLevelPermissionPredicateGroupId',
                ],
              }
            : { select: ['id', 'universalIdentifier'] }),
        withDeleted: true,
      });
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
  return new WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService(
    scoped<RowLevelPermissionPredicateGroupEntity>(
      RowLevelPermissionPredicateGroupEntity,
    ),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    scoped<RoleEntity>(RoleEntity),
    scoped<RowLevelPermissionPredicateEntity>(
      RowLevelPermissionPredicateEntity,
    ),
  );
};

describe('WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService manager-bound computation', () => {
  it('binds five exact manager reads for both entry points and resolves owner, role, object, parent and reverse arrays', async () => {
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
    expect(local.byUniversalIdentifier['uid-old-parent']).toMatchObject({
      id: 'old-parent',
      workspaceId,
      applicationUniversalIdentifier: 'uid-app',
      objectMetadataUniversalIdentifier: 'uid-object',
      roleUniversalIdentifier: 'uid-role',
      parentRowLevelPermissionPredicateGroupUniversalIdentifier: null,
      logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator.AND,
      deletedAt: '2024-02-01T00:00:00.000Z',
      childRowLevelPermissionPredicateGroupIds: ['child'],
      childRowLevelPermissionPredicateGroupUniversalIdentifiers: ['uid-child'],
      rowLevelPermissionPredicateIds: ['predicate'],
      rowLevelPermissionPredicateUniversalIdentifiers: ['uid-predicate'],
    });
    expect(local.byUniversalIdentifier['uid-child']).toMatchObject({
      parentRowLevelPermissionPredicateGroupUniversalIdentifier:
        'uid-old-parent',
      positionInRowLevelPermissionPredicateGroup: 1,
      childRowLevelPermissionPredicateGroupIds: [],
      rowLevelPermissionPredicateIds: [],
    });
    expect(local.universalIdentifierById).toEqual({
      'old-parent': 'uid-old-parent',
      'new-parent': 'uid-new-parent',
      child: 'uid-child',
    });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-old-parent', 'uid-new-parent', 'uid-child'],
    });
  });

  it('starts the four independent manager reads while the scoped group read is pending', async () => {
    const state = rows();
    const pinned = fixture(state);
    let releaseGroup!: (groups: Row[]) => void;
    const pendingGroup = new Promise<Row[]>((resolve) => {
      releaseGroup = resolve;
    });
    const manager = {
      getRepository: (entity: Function) => {
        const repository = pinned.manager.getRepository(
          entity as typeof RowLevelPermissionPredicateGroupEntity,
        );
        return entity === RowLevelPermissionPredicateGroupEntity
          ? { ...repository, find: jest.fn(() => pendingGroup) }
          : repository;
      },
    } as unknown as EntityManager;
    const pending = service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      manager,
    );

    const startedBeforeGroupResolved = entities
      .slice(1)
      .map((entity) => pinned.calls.get(entity)?.mock.calls.length === 1);
    releaseGroup(state.get(RowLevelPermissionPredicateGroupEntity) ?? []);
    await pending;

    expect(startedBeforeGroupResolved).toEqual([true, true, true, true]);
  });

  it('reparents a child and predicate and rekeys child UID in a fresh map without altering the first', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(RowLevelPermissionPredicateGroupEntity)![2] = {
      ...state.get(RowLevelPermissionPredicateGroupEntity)![2],
      universalIdentifier: 'uid-child-v2',
      parentRowLevelPermissionPredicateGroupId: 'new-parent',
    };
    state.get(RowLevelPermissionPredicateEntity)![0] = {
      ...state.get(RowLevelPermissionPredicateEntity)![0],
      rowLevelPermissionPredicateGroupId: 'new-parent',
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-child']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-child-v2']).toMatchObject({
      parentRowLevelPermissionPredicateGroupUniversalIdentifier:
        'uid-new-parent',
    });
    expect(second.byUniversalIdentifier['uid-old-parent']).toMatchObject({
      childRowLevelPermissionPredicateGroupIds: [],
      childRowLevelPermissionPredicateGroupUniversalIdentifiers: [],
      rowLevelPermissionPredicateIds: [],
      rowLevelPermissionPredicateUniversalIdentifiers: [],
    });
    expect(second.byUniversalIdentifier['uid-new-parent']).toMatchObject({
      childRowLevelPermissionPredicateGroupIds: ['child'],
      childRowLevelPermissionPredicateGroupUniversalIdentifiers: [
        'uid-child-v2',
      ],
      rowLevelPermissionPredicateIds: ['predicate'],
      rowLevelPermissionPredicateUniversalIdentifiers: ['uid-predicate'],
    });
    expect(second.universalIdentifierById).toEqual({
      'old-parent': 'uid-old-parent',
      'new-parent': 'uid-new-parent',
      child: 'uid-child-v2',
    });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-old-parent', 'uid-new-parent', 'uid-child-v2'],
    });
    expect(first.byUniversalIdentifier['uid-old-parent']).toMatchObject({
      childRowLevelPermissionPredicateGroupIds: ['child'],
      childRowLevelPermissionPredicateGroupUniversalIdentifiers: ['uid-child'],
      rowLevelPermissionPredicateIds: ['predicate'],
      rowLevelPermissionPredicateUniversalIdentifiers: ['uid-predicate'],
    });
    expect(first.byUniversalIdentifier['uid-new-parent']).toMatchObject({
      childRowLevelPermissionPredicateGroupIds: [],
      rowLevelPermissionPredicateIds: [],
    });
    expect(first.byUniversalIdentifier['uid-child']).toMatchObject({
      parentRowLevelPermissionPredicateGroupUniversalIdentifier:
        'uid-old-parent',
    });
    expect(first.universalIdentifierById).toEqual({
      'old-parent': 'uid-old-parent',
      'new-parent': 'uid-new-parent',
      child: 'uid-child',
    });
    expect(first.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-old-parent', 'uid-new-parent', 'uid-child'],
    });
    expect(
      pinned.calls.get(RowLevelPermissionPredicateGroupEntity),
    ).toHaveBeenCalledTimes(2);
  });

  it('returns an empty map and excludes workspace-B rows on every read', async () => {
    const state = rows();
    state.set(RowLevelPermissionPredicateGroupEntity, []);
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    const empty = await provider.computeFromManager(workspaceId, manager);
    expect(empty.byUniversalIdentifier).toEqual({});
    expect(empty.universalIdentifierById).toEqual({});
    state.set(
      RowLevelPermissionPredicateGroupEntity,
      rows().get(RowLevelPermissionPredicateGroupEntity)!,
    );
    for (const entity of entities) {
      const original = state.get(entity)![0];
      state.get(entity)!.push({
        ...original,
        workspaceId: 'workspace-B',
        id: `foreign-${entity.name}`,
        universalIdentifier: `uid-foreign-${entity.name}`,
      });
    }
    const local = await provider.computeFromManager(workspaceId, manager);
    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-old-parent',
      'uid-new-parent',
      'uid-child',
    ]);
    expect(
      local.universalIdentifierById[
        'foreign-RowLevelPermissionPredicateGroupEntity'
      ],
    ).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-old-parent']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      childRowLevelPermissionPredicateGroupIds: ['child'],
      rowLevelPermissionPredicateIds: ['predicate'],
    });
  });

  it('retains native missing owner and required relation errors', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    for (const [entity, message] of [
      [ApplicationEntity, 'Application with id app not found'],
      [ObjectMetadataEntity, 'ObjectMetadata with id object not found'],
      [RoleEntity, 'Role with id role not found'],
      [
        RowLevelPermissionPredicateGroupEntity,
        'RowLevelPermissionPredicateGroup with id old-parent not found',
      ],
    ] as const) {
      const original = state.get(entity)!;
      state.set(
        entity,
        entity === RowLevelPermissionPredicateGroupEntity
          ? original.filter((entry) => entry.id !== 'old-parent')
          : [],
      );
      await expect(
        provider.computeFromManager(workspaceId, manager),
      ).rejects.toThrow(message);
      state.set(entity, original);
    }
  });

  it('retains missing non-nullable role FK and duplicate group UID rejection', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    const group = state.get(RowLevelPermissionPredicateGroupEntity)![0];
    delete group.roleId;
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Missing non-nullable foreign key roleId');
    group.roleId = 'role';
    state.get(RowLevelPermissionPredicateGroupEntity)!.push({
      ...group,
      id: 'duplicate',
    });
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before any direct manager find on both entry points',
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
