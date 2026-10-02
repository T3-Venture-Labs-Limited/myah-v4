import { PermissionFlagType } from 'twenty-shared/constants';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatRolePermissionFlagMapCacheService } from 'src/engine/metadata-modules/flat-role-permission-flag/services/workspace-flat-role-permission-flag-map-cache.service';
import { PermissionFlagEntity } from 'src/engine/metadata-modules/permission-flag/permission-flag.entity';
import { RolePermissionFlagEntity } from 'src/engine/metadata-modules/role-permission-flag/role-permission-flag.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  RolePermissionFlagEntity,
  ApplicationEntity,
  RoleEntity,
  PermissionFlagEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  roleId?: string;
  permissionFlagId?: string;
  flag?: PermissionFlagType;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
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
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    [RoleEntity, [row('role')]],
    [PermissionFlagEntity, [row('permission')]],
    [
      RolePermissionFlagEntity,
      [
        row('grant', {
          applicationId: 'app',
          roleId: 'role',
          permissionFlagId: 'permission',
          flag: PermissionFlagType.WORKSPACE,
          createdAt: new Date('2024-02-01T00:00:00.000Z'),
          updatedAt: new Date('2024-02-02T00:00:00.000Z'),
        }),
      ],
    ],
  ]);

// Only repository I/O is fake; the provider, scoped wrappers, converter and index helper are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === RolePermissionFlagEntity
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

  return new WorkspaceFlatRolePermissionFlagMapCacheService(
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    scoped<RoleEntity>(RoleEntity),
    scoped<PermissionFlagEntity>(PermissionFlagEntity),
  );
};

const expectIndexes = (
  map: Awaited<
    ReturnType<
      WorkspaceFlatRolePermissionFlagMapCacheService['computeForCache']
    >
  >,
  grantUid: string,
) => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([grantUid]);
  expect(map.universalIdentifierById).toEqual({ grant: grantUid });
  expect(map.universalIdentifiersByApplicationId).toEqual({ app: [grantUid] });
};

describe('WorkspaceFlatRolePermissionFlagMapCacheService manager-bound computation', () => {
  it('uses four exact manager reads on both entry points and converts owner, role, permission and scalar fields', async () => {
    const state = rows();
    const ordinary = fixture(state);
    const pinned = fixture(state);
    const provider = service(ordinary.manager);
    const cached = await provider.computeForCache(workspaceId);
    const local = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(cached).toEqual(local);
    for (const entity of entities) {
      expect(ordinary.calls.get(entity)).toHaveBeenCalledTimes(1);
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(1);
    }
    expect(local.byUniversalIdentifier['uid-grant']).toMatchObject({
      id: 'grant',
      workspaceId,
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      roleId: 'role',
      roleUniversalIdentifier: 'uid-role',
      permissionFlagId: 'permission',
      permissionFlagUniversalIdentifier: 'uid-permission',
      flag: PermissionFlagType.WORKSPACE,
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-02T00:00:00.000Z',
    });
    expectIndexes(local, 'uid-grant');
  });

  it('rebuilds changed role/permission/flag state and rekeys indexes without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(RoleEntity)![0] = {
      ...state.get(RoleEntity)![0],
      universalIdentifier: 'uid-role-v2',
    };
    state.get(PermissionFlagEntity)![0] = {
      ...state.get(PermissionFlagEntity)![0],
      universalIdentifier: 'uid-permission-v2',
    };
    state.get(RolePermissionFlagEntity)![0] = {
      ...state.get(RolePermissionFlagEntity)![0],
      universalIdentifier: 'uid-grant-v2',
      flag: PermissionFlagType.SECURITY,
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-grant']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-grant-v2']).toMatchObject({
      roleUniversalIdentifier: 'uid-role-v2',
      permissionFlagUniversalIdentifier: 'uid-permission-v2',
      flag: PermissionFlagType.SECURITY,
    });
    expectIndexes(second, 'uid-grant-v2');
    expect(first.byUniversalIdentifier['uid-grant']).toMatchObject({
      roleUniversalIdentifier: 'uid-role',
      permissionFlagUniversalIdentifier: 'uid-permission',
      flag: PermissionFlagType.WORKSPACE,
    });
    expectIndexes(first, 'uid-grant');
    expect(pinned.calls.get(RolePermissionFlagEntity)).toHaveBeenCalledTimes(2);
  });

  it('scopes all four reads and retains an application with a real soft-delete column', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          roleId: 'foreign-RoleEntity',
          permissionFlagId: 'foreign-PermissionFlagEntity',
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(local, 'uid-grant');
    expect(local.byUniversalIdentifier['uid-grant']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      roleUniversalIdentifier: 'uid-role',
      permissionFlagUniversalIdentifier: 'uid-permission',
    });
    expect(
      local.universalIdentifierById['foreign-RolePermissionFlagEntity'],
    ).toBeUndefined();
  });

  it('preserves missing owner, role and flag UID failures and duplicate UID rejection', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    for (const [entity, message] of [
      [
        ApplicationEntity,
        'Application with id app not found for rolePermissionFlag grant',
      ],
      [RoleEntity, 'Role with id role not found for rolePermissionFlag grant'],
      [
        PermissionFlagEntity,
        'PermissionFlag with id permission not found for rolePermissionFlag grant',
      ],
    ] as const) {
      const original = state.get(entity)!;
      state.set(entity, []);
      await expect(
        provider.computeFromManager(workspaceId, manager),
      ).rejects.toThrow(message);
      state.set(entity, original);
    }
    state.get(RolePermissionFlagEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-grant',
        applicationId: 'app',
        roleId: 'role',
        permissionFlagId: 'permission',
        flag: PermissionFlagType.WORKSPACE,
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before any direct read',
    async (invalidId) => {
      const findRolePermissionFlags = jest.fn();
      const findApplications = jest.fn();
      const manager = {
        getRepository: (entity: Function) => ({
          find:
            entity === RolePermissionFlagEntity
              ? findRolePermissionFlags
              : findApplications,
        }),
      } as unknown as EntityManager;

      await expect(
        service(manager).computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      expect(findRolePermissionFlags).not.toHaveBeenCalled();
      expect(findApplications).not.toHaveBeenCalled();
    },
  );
});
