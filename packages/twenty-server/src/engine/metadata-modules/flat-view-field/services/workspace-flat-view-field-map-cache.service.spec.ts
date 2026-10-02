import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatViewFieldMapCacheService } from 'src/engine/metadata-modules/flat-view-field/services/workspace-flat-view-field-map-cache.service';
import { ViewFieldGroupEntity } from 'src/engine/metadata-modules/view-field-group/entities/view-field-group.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const applicationId = 'app';
const entities = [
  ViewFieldEntity,
  ApplicationEntity,
  FieldMetadataEntity,
  ViewEntity,
  ViewFieldGroupEntity,
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
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      ApplicationEntity,
      [row(applicationId, { deletedAt: new Date('2024-01-01') })],
    ],
    [
      FieldMetadataEntity,
      [row('field', { deletedAt: new Date('2024-01-01') })],
    ],
    [ViewEntity, [row('view', { deletedAt: new Date('2024-01-01') })]],
    [
      ViewFieldGroupEntity,
      [row('group', { deletedAt: new Date('2024-01-01') })],
    ],
    [
      ViewFieldEntity,
      [
        row('view-field', {
          fieldMetadataId: 'field',
          viewId: 'view',
          viewFieldGroupId: 'group',
          overrides: { viewFieldGroupId: 'group', isVisible: false, size: 170 },
          deletedAt: new Date('2024-01-01'),
        }),
        row('ungrouped', {
          fieldMetadataId: 'field',
          viewId: 'view',
          viewFieldGroupId: null,
          overrides: null,
        }),
      ],
    ],
  ]);

// Only repository I/O is fake: scoped wrappers, provider, converter and map insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(true);
      expect(options.select).toEqual(
        entity === ViewFieldEntity ? undefined : ['id', 'universalIdentifier'],
      );
      expect(options.relations).toBeUndefined();
      return (state.get(entity) ?? []).filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (options.withDeleted || !item.deletedAt),
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
  return new WorkspaceFlatViewFieldMapCacheService(
    scoped<ViewFieldEntity>(ViewFieldEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
    scoped<ViewEntity>(ViewEntity),
    scoped<ViewFieldGroupEntity>(ViewFieldGroupEntity),
  );
};

describe('WorkspaceFlatViewFieldMapCacheService manager-bound computation', () => {
  it('uses all five exact manager reads in both entry points and resolves group UID, serialized overrides and indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-view-field']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      fieldMetadataUniversalIdentifier: 'uid-field',
      viewUniversalIdentifier: 'uid-view',
      viewFieldGroupUniversalIdentifier: 'uid-group',
      universalOverrides: {
        viewFieldGroupUniversalIdentifier: 'uid-group',
        isVisible: false,
        size: 170,
      },
    });
    expect(local.byUniversalIdentifier['uid-ungrouped']).toMatchObject({
      viewFieldGroupUniversalIdentifier: null,
      universalOverrides: null,
    });
    expect(local.universalIdentifierById).toEqual({
      'view-field': 'uid-view-field',
      ungrouped: 'uid-ungrouped',
    });
    expect(local.universalIdentifiersByApplicationId[applicationId]).toEqual([
      'uid-view-field',
      'uid-ungrouped',
    ]);
  });

  it('sees a changed manager-local group, field and overrides snapshot without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(FieldMetadataEntity)!.push(row('replacement'));
    state.get(ViewFieldGroupEntity)!.push(row('new-group'));
    state.get(ViewFieldEntity)![0] = {
      ...state.get(ViewFieldEntity)![0],
      fieldMetadataId: 'replacement',
      viewFieldGroupId: 'new-group',
      overrides: {
        viewFieldGroupId: 'new-group',
        isVisible: true,
        position: 3,
      },
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-view-field']).toMatchObject({
      fieldMetadataUniversalIdentifier: 'uid-replacement',
      viewFieldGroupUniversalIdentifier: 'uid-new-group',
      universalOverrides: {
        viewFieldGroupUniversalIdentifier: 'uid-new-group',
        isVisible: true,
        position: 3,
      },
    });
    expect(first.byUniversalIdentifier['uid-view-field']).toMatchObject({
      fieldMetadataUniversalIdentifier: 'uid-field',
      viewFieldGroupUniversalIdentifier: 'uid-group',
      universalOverrides: {
        viewFieldGroupUniversalIdentifier: 'uid-group',
        isVisible: false,
        size: 170,
      },
    });
  });

  it('excludes foreign-workspace rows in every read, including deleted owners', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          fieldMetadataId: 'foreign-FieldMetadataEntity',
          viewId: 'foreign-ViewEntity',
          viewFieldGroupId: 'foreign-ViewFieldGroupEntity',
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-view-field',
      'uid-ungrouped',
    ]);
    expect(
      local.universalIdentifierById['foreign-ViewFieldEntity'],
    ).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-view-field']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewFieldGroupUniversalIdentifier: 'uid-group',
    });
  });

  it('retains native missing owner/group UID and duplicate UID failures', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for viewField view-field',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(FieldMetadataEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'FieldMetadata with id field not found for viewField view-field',
    );
    state.set(FieldMetadataEntity, rows().get(FieldMetadataEntity)!);
    state.set(ViewEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('View with id view not found for viewField view-field');
    state.set(ViewEntity, rows().get(ViewEntity)!);
    state.set(ViewFieldGroupEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'ViewFieldGroup with id group not found for viewField view-field',
    );
    state.set(ViewFieldGroupEntity, rows().get(ViewFieldGroupEntity)!);
    state.get(ViewFieldEntity)![0].overrides = {
      viewFieldGroupId: 'missing-group',
      isVisible: false,
    };
    expect(
      (await provider.computeFromManager(workspaceId, manager))
        .byUniversalIdentifier['uid-view-field'],
    ).toMatchObject({
      universalOverrides: {
        viewFieldGroupUniversalIdentifier: null,
        isVisible: false,
      },
    });
    state.get(ViewFieldEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-view-field',
        viewId: 'view',
        fieldMetadataId: 'field',
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'rejects invalid workspace %s before scoped reads',
    async (invalidId) => {
      const manager = {
        getRepository: (entity: Function) => ({
          target: entity,
          find: () => Promise.resolve([]),
        }),
      } as unknown as EntityManager;
      await expect(
        service(manager).computeFromManager(invalidId as string, manager),
      ).rejects.toThrow(
        'WorkspaceScopedRepository: workspaceId must be a non-empty string.',
      );
    },
  );
});
