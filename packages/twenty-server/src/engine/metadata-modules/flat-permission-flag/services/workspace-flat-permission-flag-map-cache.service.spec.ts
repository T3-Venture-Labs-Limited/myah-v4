import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatPermissionFlagMapCacheService } from 'src/engine/metadata-modules/flat-permission-flag/services/workspace-flat-permission-flag-map-cache.service';
import { PermissionFlagEntity } from 'src/engine/metadata-modules/permission-flag/permission-flag.entity';
import { RolePermissionFlagEntity } from 'src/engine/metadata-modules/role-permission-flag/role-permission-flag.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  PermissionFlagEntity,
  ApplicationEntity,
  RolePermissionFlagEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  permissionFlagId?: string;
  key?: string;
  label?: string;
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
    [
      PermissionFlagEntity,
      [
        row('flag', { applicationId: 'app', key: 'creator', label: 'Creator' }),
        row('other', {
          applicationId: 'app',
          key: 'campaign',
          label: 'Campaign',
        }),
      ],
    ],
    [
      RolePermissionFlagEntity,
      [row('grant', { applicationId: 'app', permissionFlagId: 'flag' })],
    ],
  ]);

// Fake only repository I/O: provider, workspace wrapper, converter and index helper remain real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === ApplicationEntity
          ? { select: ['id', 'universalIdentifier'] }
          : {}),
        withDeleted: true,
      });
      return (state.get(entity) ?? []).filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (entity !== ApplicationEntity ||
            options.withDeleted ||
            !item.deletedAt),
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
  return new WorkspaceFlatPermissionFlagMapCacheService(
    new WorkspaceScopedRepository(
      pooled<PermissionFlagEntity>(PermissionFlagEntity),
    ),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    pooled<RolePermissionFlagEntity>(RolePermissionFlagEntity),
  );
};

describe('WorkspaceFlatPermissionFlagMapCacheService manager-bound computation', () => {
  it('uses all three manager reads for ordinary and explicit entry points and preserves reverse IDs, UIDs and indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-flag']).toMatchObject({
      id: 'flag',
      key: 'creator',
      label: 'Creator',
      applicationUniversalIdentifier: 'uid-app',
      rolePermissionFlagIds: ['grant'],
      rolePermissionFlagUniversalIdentifiers: ['uid-grant'],
    });
    expect(local.byUniversalIdentifier['uid-other']).toMatchObject({
      rolePermissionFlagIds: [],
      rolePermissionFlagUniversalIdentifiers: [],
    });
    expect(local.universalIdentifierById).toEqual({
      flag: 'uid-flag',
      other: 'uid-other',
    });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-flag', 'uid-other'],
    });
  });

  it('starts the direct reads while the first scoped read is still pending', async () => {
    let releaseFlags!: (value: Row[]) => void;
    const flags = new Promise<Row[]>((resolve) => {
      releaseFlags = resolve;
    });
    const applicationFind = jest.fn(async () => []);
    const grantFind = jest.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find:
          entity === PermissionFlagEntity
            ? jest.fn(() => flags)
            : entity === ApplicationEntity
              ? applicationFind
              : grantFind,
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    expect(applicationFind).toHaveBeenCalledWith({
      where: { workspaceId },
      select: ['id', 'universalIdentifier'],
      withDeleted: true,
    });
    expect(grantFind).toHaveBeenCalledWith({
      where: { workspaceId },
      withDeleted: true,
    });
    releaseFlags([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('recomputes a moved grant and rekeyed flag and grant UIDs without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(PermissionFlagEntity)![0] = {
      ...state.get(PermissionFlagEntity)![0],
      universalIdentifier: 'uid-flag-v2',
      label: 'Changed',
    };
    state.get(RolePermissionFlagEntity)![0] = {
      ...state.get(RolePermissionFlagEntity)![0],
      universalIdentifier: 'uid-grant-v2',
      permissionFlagId: 'other',
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(second.byUniversalIdentifier['uid-flag']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-flag-v2']).toMatchObject({
      label: 'Changed',
      rolePermissionFlagIds: [],
      rolePermissionFlagUniversalIdentifiers: [],
    });
    expect(second.byUniversalIdentifier['uid-other']).toMatchObject({
      rolePermissionFlagIds: ['grant'],
      rolePermissionFlagUniversalIdentifiers: ['uid-grant-v2'],
    });
    expect(second.universalIdentifierById).toEqual({
      flag: 'uid-flag-v2',
      other: 'uid-other',
    });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-flag-v2', 'uid-other'],
    });
    expect(first.byUniversalIdentifier['uid-flag']).toMatchObject({
      label: 'Creator',
      rolePermissionFlagIds: ['grant'],
      rolePermissionFlagUniversalIdentifiers: ['uid-grant'],
    });
    expect(first.byUniversalIdentifier['uid-other']).toMatchObject({
      rolePermissionFlagIds: [],
      rolePermissionFlagUniversalIdentifiers: [],
    });
    expect(first.universalIdentifierById).toEqual({
      flag: 'uid-flag',
      other: 'uid-other',
    });
    expect(first.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-flag', 'uid-other'],
    });
    expect(pinned.calls.get(PermissionFlagEntity)).toHaveBeenCalledTimes(2);
  });

  it('keeps only workspace A flags and grants, including an application with a real soft-delete column', async () => {
    const state = rows();
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    state.get(PermissionFlagEntity)!.push(
      row('foreign-flag', {
        workspaceId: 'workspace-B',
        applicationId: 'foreign-app',
      }),
    );
    state.get(RolePermissionFlagEntity)!.push(
      row('foreign-grant', {
        workspaceId: 'workspace-B',
        permissionFlagId: 'flag',
      }),
    );
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-flag',
      'uid-other',
    ]);
    expect(local.universalIdentifierById['foreign-flag']).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-flag']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      rolePermissionFlagIds: ['grant'],
      rolePermissionFlagUniversalIdentifiers: ['uid-grant'],
    });
  });

  it('preserves missing owner and duplicate UID errors', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for permissionFlag flag',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.get(PermissionFlagEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-flag',
        applicationId: 'app',
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it('returns fresh empty indexes for empty state', async () => {
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(new Map()).manager,
    );
    expect(local).toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it.each([undefined, null, ''])(
    'rejects invalid workspace %s before direct finds on both entry points',
    async (invalidId) => {
      const directFind = jest.fn();
      const manager = {
        getRepository: (entity: Function) => ({
          target: entity,
          find: directFind,
        }),
      } as unknown as EntityManager;
      const provider = service(manager);
      await expect(
        provider.computeForCache(invalidId as string),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      await expect(
        provider.computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
      expect(directFind).not.toHaveBeenCalled();
    },
  );
});
