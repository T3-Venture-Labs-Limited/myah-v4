import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatObjectPermissionMapCacheService } from 'src/engine/metadata-modules/flat-object-permission/services/workspace-flat-object-permission-map-cache.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'app-A';
const entities = [
  ObjectPermissionEntity,
  ApplicationEntity,
  RoleEntity,
  ObjectMetadataEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  roleId?: string;
  objectMetadataId?: string;
  canReadObjectRecords?: boolean | null;
  canUpdateObjectRecords?: boolean | null;
  canSoftDeleteObjectRecords?: boolean | null;
  canDestroyObjectRecords?: boolean | null;
  deletedAt?: Date | null;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extras: Partial<Row> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  applicationId,
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
      [row('role', { deletedAt: new Date('2024-01-01') }), row('other-role')],
    ],
    [
      ObjectMetadataEntity,
      [
        row('object', { deletedAt: new Date('2024-01-01') }),
        row('other-object'),
      ],
    ],
    [
      ObjectPermissionEntity,
      [
        row('permission', {
          roleId: 'role',
          objectMetadataId: 'object',
          canReadObjectRecords: false,
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: null,
          canDestroyObjectRecords: false,
          deletedAt: new Date('2024-01-01'),
        }),
      ],
    ],
  ]);

// Fake TypeORM IO only; scoped wrappers, conversion and map insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === ObjectPermissionEntity
          ? {}
          : { select: ['id', 'universalIdentifier'] }),
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
  const applicationRepository = {
    ...pooled<ApplicationEntity>(ApplicationEntity),
    manager: ordinaryManager,
  } as Repository<ApplicationEntity>;

  return new WorkspaceFlatObjectPermissionMapCacheService(
    new WorkspaceScopedRepository(
      pooled<ObjectPermissionEntity>(ObjectPermissionEntity),
    ),
    applicationRepository,
    new WorkspaceScopedRepository(pooled<RoleEntity>(RoleEntity)),
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
  );
};

describe('WorkspaceFlatObjectPermissionMapCacheService manager-bound computation', () => {
  it('uses all four manager reads for ordinary and explicit entries, preserving native conversion and indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-permission']).toMatchObject({
      id: 'permission',
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: null,
      canDestroyObjectRecords: false,
      applicationUniversalIdentifier: 'uid-app-A',
      roleUniversalIdentifier: 'uid-role',
      objectMetadataUniversalIdentifier: 'uid-object',
    });
    expect(local.universalIdentifierById).toEqual({
      permission: 'uid-permission',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-permission',
    ]);
    // Flat metadata conversion does not prove effective authorization.
  });

  it('rebuilds changed local permissions and owners without mutating the first snapshot', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    state.get(ObjectPermissionEntity)![0] = {
      ...state.get(ObjectPermissionEntity)![0],
      roleId: 'other-role',
      objectMetadataId: 'other-object',
      canReadObjectRecords: null,
      canUpdateObjectRecords: true,
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(first.byUniversalIdentifier['uid-permission']).toMatchObject({
      roleUniversalIdentifier: 'uid-role',
      objectMetadataUniversalIdentifier: 'uid-object',
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
    });
    expect(second.byUniversalIdentifier['uid-permission']).toMatchObject({
      roleUniversalIdentifier: 'uid-other-role',
      objectMetadataUniversalIdentifier: 'uid-other-object',
      canReadObjectRecords: null,
      canUpdateObjectRecords: true,
    });
    expect(first).not.toBe(second);
    for (const entity of entities)
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
  });

  it('keeps all four reads scoped even when deleted owners and foreign workspace rows coexist', async () => {
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
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );

    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-permission',
    ]);
    expect(local.universalIdentifierById).toEqual({
      permission: 'uid-permission',
    });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      [applicationId]: ['uid-permission'],
    });
  });

  const missingCases: [Function, string][] = [
    [ApplicationEntity, 'Application with id app-A not found'],
    [RoleEntity, 'Role with id role not found'],
    [ObjectMetadataEntity, 'ObjectMetadata with id object not found'],
  ];

  it.each(missingCases)(
    'retains native missing %s owner failure',
    async (missing, message) => {
      const state = rows();
      state.set(missing, []);
      await expect(
        service(fixture(new Map()).manager).computeFromManager(
          workspaceId,
          fixture(state).manager,
        ),
      ).rejects.toThrow(message);
    },
  );

  it('retains native duplicate universal identifier rejection', async () => {
    const state = rows();
    state.get(ObjectPermissionEntity)!.push(
      row('another', {
        universalIdentifier: 'uid-permission',
        roleId: 'other-role',
        objectMetadataId: 'other-object',
      }),
    );
    await expect(
      service(fixture(new Map()).manager).computeFromManager(
        workspaceId,
        fixture(state).manager,
      ),
    ).rejects.toThrow('flat entity to add already exists');
  });
});
