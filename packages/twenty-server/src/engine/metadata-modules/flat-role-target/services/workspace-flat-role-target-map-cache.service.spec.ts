import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatRoleTargetMapCacheService } from 'src/engine/metadata-modules/flat-role-target/services/workspace-flat-role-target-map-cache.service';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RoleTargetEntity } from 'src/engine/metadata-modules/role-target/role-target.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [RoleTargetEntity, ApplicationEntity, RoleEntity] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  roleId?: string;
  userWorkspaceId?: string | null;
  agentId?: string | null;
  apiKeyId?: string | null;
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
    [
      RoleTargetEntity,
      [
        row('target', {
          applicationId: 'app',
          roleId: 'role',
          userWorkspaceId: 'user-workspace',
          agentId: null,
          apiKeyId: null,
        }),
        row('agent-target', {
          applicationId: 'app',
          roleId: 'role',
          userWorkspaceId: null,
          agentId: 'agent',
          apiKeyId: null,
        }),
      ],
    ],
  ]);

// Fake only repository I/O; the scoped wrappers, converter and index insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === RoleTargetEntity
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

  return new WorkspaceFlatRoleTargetMapCacheService(
    scoped<RoleTargetEntity>(RoleTargetEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    scoped<RoleEntity>(RoleEntity),
  );
};

const expectIndexes = (
  map: Awaited<
    ReturnType<WorkspaceFlatRoleTargetMapCacheService['computeForCache']>
  >,
  targetUid: string,
) => {
  expect(Object.keys(map.byUniversalIdentifier)).toEqual([
    targetUid,
    'uid-agent-target',
  ]);
  expect(map.universalIdentifierById).toEqual({
    target: targetUid,
    'agent-target': 'uid-agent-target',
  });
  expect(map.universalIdentifiersByApplicationId).toEqual({
    app: [targetUid, 'uid-agent-target'],
  });
};

describe('WorkspaceFlatRoleTargetMapCacheService manager-bound computation', () => {
  it('uses three exact manager reads on both entry points and retains target, owner, role and indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-target']).toMatchObject({
      id: 'target',
      workspaceId,
      applicationId: 'app',
      applicationUniversalIdentifier: 'uid-app',
      roleId: 'role',
      roleUniversalIdentifier: 'uid-role',
      userWorkspaceId: 'user-workspace',
      agentId: null,
      apiKeyId: null,
    });
    expect(local.byUniversalIdentifier['uid-agent-target']).toMatchObject({
      roleUniversalIdentifier: 'uid-role',
      userWorkspaceId: null,
      agentId: 'agent',
      apiKeyId: null,
    });
    expectIndexes(local, 'uid-target');
  });

  it('rebuilds changed local target/role state and rekeys indexes without mutating the first map', async () => {
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
    state.get(RoleTargetEntity)![0] = {
      ...state.get(RoleTargetEntity)![0],
      universalIdentifier: 'uid-target-v2',
      userWorkspaceId: null,
      apiKeyId: 'api-key',
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-target']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-target-v2']).toMatchObject({
      roleUniversalIdentifier: 'uid-role-v2',
      userWorkspaceId: null,
      apiKeyId: 'api-key',
    });
    expect(second.byUniversalIdentifier['uid-agent-target']).toMatchObject({
      roleUniversalIdentifier: 'uid-role-v2',
    });
    expectIndexes(second, 'uid-target-v2');
    expect(first.byUniversalIdentifier['uid-target']).toMatchObject({
      roleUniversalIdentifier: 'uid-role',
      userWorkspaceId: 'user-workspace',
      apiKeyId: null,
    });
    expectIndexes(first, 'uid-target');
    expect(pinned.calls.get(RoleTargetEntity)).toHaveBeenCalledTimes(2);
  });

  it('scopes all three reads and retains the soft-deleted application owner', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          roleId: 'foreign-RoleEntity',
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expectIndexes(local, 'uid-target');
    expect(local.byUniversalIdentifier['uid-target']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      roleUniversalIdentifier: 'uid-role',
    });
    expect(
      local.universalIdentifierById['foreign-RoleTargetEntity'],
    ).toBeUndefined();
  });

  it('preserves missing owner/role UID failures and duplicate UID rejection', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for roleTarget target',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(RoleEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Role with id role not found for roleTarget target');
    state.set(RoleEntity, rows().get(RoleEntity)!);
    state.get(RoleTargetEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-target',
        applicationId: 'app',
        roleId: 'role',
        agentId: 'other-agent',
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'rejects invalid workspace %s at the scoped boundary',
    async (invalidId) => {
      const manager = fixture(new Map()).manager;
      await expect(
        service(manager).computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
    },
  );
});
