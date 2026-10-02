import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatFieldPermissionMapCacheService } from 'src/engine/metadata-modules/flat-field-permission/services/workspace-flat-field-permission-map-cache.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { FieldPermissionEntity } from 'src/engine/metadata-modules/object-permission/field-permission/field-permission.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'app-A';
const entities = [
  FieldPermissionEntity,
  ApplicationEntity,
  RoleEntity,
  ObjectMetadataEntity,
  FieldMetadataEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  roleId?: string;
  objectMetadataId?: string;
  fieldMetadataId?: string;
  canReadFieldValue?: boolean | null;
  canUpdateFieldValue?: boolean | null;
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
    [RoleEntity, [row('role'), row('other-role')]],
    [
      ObjectMetadataEntity,
      [row('object', { deletedAt: new Date('2024-01-01') })],
    ],
    [
      FieldMetadataEntity,
      [row('field', { deletedAt: new Date('2024-01-01') }), row('other-field')],
    ],
    [
      FieldPermissionEntity,
      [
        row('permission', {
          roleId: 'role',
          objectMetadataId: 'object',
          fieldMetadataId: 'field',
          canReadFieldValue: false,
          canUpdateFieldValue: false,
          deletedAt: new Date('2024-01-01'),
        }),
      ],
    ],
  ]);

// Fake only TypeORM IO; scoped wrappers, conversion and map insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();

  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        ...(entity === FieldPermissionEntity
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

  return new WorkspaceFlatFieldPermissionMapCacheService(
    new WorkspaceScopedRepository(
      pooled<FieldPermissionEntity>(FieldPermissionEntity),
    ),
    applicationRepository,
    new WorkspaceScopedRepository(pooled<RoleEntity>(RoleEntity)),
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
  );
};

describe('WorkspaceFlatFieldPermissionMapCacheService manager-bound computation', () => {
  it('uses all five manager reads for ordinary and explicit entries, preserving denial and indexes', async () => {
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
      canReadFieldValue: false,
      canUpdateFieldValue: false,
      applicationUniversalIdentifier: 'uid-app-A',
      roleUniversalIdentifier: 'uid-role',
      objectMetadataUniversalIdentifier: 'uid-object',
      fieldMetadataUniversalIdentifier: 'uid-field',
    });
    expect(local.universalIdentifierById).toEqual({
      permission: 'uid-permission',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-permission',
    ]);
    // This is a flat metadata projection, not a test of effective authorization.
  });

  it('rebuilds changed local assignments and denial without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    state.get(FieldPermissionEntity)![0] = {
      ...state.get(FieldPermissionEntity)![0],
      roleId: 'other-role',
      fieldMetadataId: 'other-field',
      canReadFieldValue: null,
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );

    expect(first.byUniversalIdentifier['uid-permission']).toMatchObject({
      roleUniversalIdentifier: 'uid-role',
      fieldMetadataUniversalIdentifier: 'uid-field',
      canReadFieldValue: false,
    });
    expect(second.byUniversalIdentifier['uid-permission']).toMatchObject({
      roleUniversalIdentifier: 'uid-other-role',
      fieldMetadataUniversalIdentifier: 'uid-other-field',
      canReadFieldValue: null,
      canUpdateFieldValue: false,
    });
    expect(first).not.toBe(second);
    for (const entity of entities)
      expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(2);
  });

  it('keeps workspace-scoped reads isolated even when every repository has foreign rows', async () => {
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
    [FieldMetadataEntity, 'FieldMetadata with id field not found'],
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

  it('retains native duplicate universal identifier failure rather than overwriting a permission', async () => {
    const state = rows();
    state.get(FieldPermissionEntity)!.push(
      row('another', {
        universalIdentifier: 'uid-permission',
        roleId: 'role',
        objectMetadataId: 'object',
        fieldMetadataId: 'other-field',
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
