import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { RolePermissionFlagEntity } from 'src/engine/metadata-modules/role-permission-flag/role-permission-flag.entity';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { WorkspaceFlatRoleMapCacheService } from 'src/engine/metadata-modules/role/services/workspace-flat-role-map-cache.service';
import { RowLevelPermissionPredicateGroupEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity';
import { RowLevelPermissionPredicateEntity } from 'src/engine/metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'app-A';
const children = [
  RoleTargetEntity,
  ObjectPermissionEntity,
  RolePermissionFlagEntity,
  FieldPermissionEntity,
  RowLevelPermissionPredicateEntity,
  RowLevelPermissionPredicateGroupEntity,
] as const;
const entities = [RoleEntity, ApplicationEntity, ...children] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  deletedAt?: Date | null;
  roleId?: string;
  applicationId?: string;
  label?: string;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extras,
});
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      ApplicationEntity,
      [row(applicationId, { deletedAt: new Date('2024-01-01') })],
    ],
    [
      RoleEntity,
      [
        row('role', {
          applicationId,
          label: 'Original',
          deletedAt: new Date('2024-01-01'),
        }),
        row('other-role', { applicationId, label: 'Other' }),
      ],
    ],
    ...children.map(
      (entity) =>
        [
          entity,
          [
            row(`child-${entity.name}`, {
              roleId: 'role',
              deletedAt: new Date('2024-01-01'),
            }),
          ],
        ] as [Function, Row[]],
    ),
  ]);

// Only TypeORM's IO is faked: scoped wrappers, grouping, conversion and insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === RoleEntity
          ? {}
          : {
              select:
                entity === ApplicationEntity
                  ? ['id', 'universalIdentifier']
                  : ['id', 'universalIdentifier', 'roleId'],
            }),
        withDeleted: true,
      });
      return (state.get(entity) ?? []).filter(
        (entry) => entry.workspaceId === workspaceId,
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

  return new WorkspaceFlatRoleMapCacheService(
    scoped<RoleEntity>(RoleEntity),
    applicationRepository,
    scoped<RoleTargetEntity>(RoleTargetEntity),
    scoped<ObjectPermissionEntity>(ObjectPermissionEntity),
    pooled<RolePermissionFlagEntity>(RolePermissionFlagEntity),
    scoped<FieldPermissionEntity>(FieldPermissionEntity),
    scoped<RowLevelPermissionPredicateEntity>(
      RowLevelPermissionPredicateEntity,
    ),
    scoped<RowLevelPermissionPredicateGroupEntity>(
      RowLevelPermissionPredicateGroupEntity,
    ),
  );
};

const associations = [
  ['roleTargetIds', 'roleTargetUniversalIdentifiers', RoleTargetEntity],
  [
    'objectPermissionIds',
    'objectPermissionUniversalIdentifiers',
    ObjectPermissionEntity,
  ],
  [
    'rolePermissionFlagIds',
    'rolePermissionFlagUniversalIdentifiers',
    RolePermissionFlagEntity,
  ],
  [
    'fieldPermissionIds',
    'fieldPermissionUniversalIdentifiers',
    FieldPermissionEntity,
  ],
  [
    'rowLevelPermissionPredicateIds',
    'rowLevelPermissionPredicateUniversalIdentifiers',
    RowLevelPermissionPredicateEntity,
  ],
  [
    'rowLevelPermissionPredicateGroupIds',
    'rowLevelPermissionPredicateGroupUniversalIdentifiers',
    RowLevelPermissionPredicateGroupEntity,
  ],
] as const;

describe('WorkspaceFlatRoleMapCacheService manager-bound computation', () => {
  it('routes both entry points through all eight exact manager reads and preserves deleted roles, applications, children and indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-role']).toMatchObject({
      id: 'role',
      label: 'Original',
      applicationUniversalIdentifier: 'uid-app-A',
    });
    for (const [ids, uids, entity] of associations) {
      expect(local.byUniversalIdentifier['uid-role']).toMatchObject({
        [ids]: [`child-${entity.name}`],
        [uids]: [`uid-child-${entity.name}`],
      });
      expect(local.byUniversalIdentifier['uid-other-role']).toMatchObject({
        [ids]: [],
        [uids]: [],
      });
    }
    expect(local.universalIdentifierById).toEqual({
      role: 'uid-role',
      'other-role': 'uid-other-role',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-role',
      'uid-other-role',
    ]);
  });

  it('refreshes all six reverse associations from changed manager rows without mutating the first snapshot', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    state.get(RoleEntity)![0] = {
      ...state.get(RoleEntity)![0],
      label: 'Changed',
    };
    for (const entity of children) {
      state.set(entity, [
        row(`moved-${entity.name}`, { roleId: 'other-role' }),
      ]);
    }
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-role']).toMatchObject({
      label: 'Changed',
    });
    expect(first.byUniversalIdentifier['uid-role']).toMatchObject({
      label: 'Original',
    });
    for (const [ids, uids, entity] of associations) {
      expect(second.byUniversalIdentifier['uid-role']).toMatchObject({
        [ids]: [],
        [uids]: [],
      });
      expect(second.byUniversalIdentifier['uid-other-role']).toMatchObject({
        [ids]: [`moved-${entity.name}`],
        [uids]: [`uid-moved-${entity.name}`],
      });
      expect(first.byUniversalIdentifier['uid-role']).toMatchObject({
        [ids]: [`child-${entity.name}`],
        [uids]: [`uid-child-${entity.name}`],
      });
    }
    for (const entity of entities) {
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
    }
  });

  it('excludes foreign-workspace parents and every child family', async () => {
    const state = rows();
    for (const entity of entities) {
      const original = state.get(entity)![0];
      state.get(entity)!.push({
        ...original,
        id: `foreign-${entity.name}`,
        universalIdentifier: `uid-foreign-${entity.name}`,
        workspaceId: 'workspace-B',
        // If any child query loses workspace scoping it pollutes A's role.
        roleId: 'role',
        applicationId: 'foreign-ApplicationEntity',
      });
    }
    const isolated = await service(
      fixture(new Map()).manager,
    ).computeFromManager(workspaceId, fixture(state).manager);
    expect(Object.keys(isolated.byUniversalIdentifier)).toEqual([
      'uid-role',
      'uid-other-role',
    ]);
    expect(
      isolated.universalIdentifierById['foreign-RoleEntity'],
    ).toBeUndefined();
    for (const [ids, uids, entity] of associations) {
      expect(isolated.byUniversalIdentifier['uid-role']).toMatchObject({
        [ids]: [`child-${entity.name}`],
        [uids]: [`uid-child-${entity.name}`],
      });
    }
  });

  it('preserves native missing-owner and duplicate-UID errors', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;

    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      `Application with id ${applicationId} not found for role role`,
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state
      .get(RoleEntity)!
      .push(
        row('duplicate', { applicationId, universalIdentifier: 'uid-role' }),
      );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'preserves invalid workspace guard for %s',
    async (invalidId) => {
      const provider = service(fixture(new Map()).manager);
      await expect(
        provider.computeFromManager(
          invalidId as string,
          fixture(rows()).manager,
        ),
      ).rejects.toThrow('workspaceId must be a non-empty string');
    },
  );
});
