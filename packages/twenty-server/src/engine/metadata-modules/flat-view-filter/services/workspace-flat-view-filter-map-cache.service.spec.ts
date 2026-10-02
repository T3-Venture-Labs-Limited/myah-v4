import { ViewFilterOperand } from 'twenty-shared/types';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatViewFilterMapCacheService } from 'src/engine/metadata-modules/flat-view-filter/services/workspace-flat-view-filter-map-cache.service';
import { ViewFilterGroupEntity } from 'src/engine/metadata-modules/view-filter-group/entities/view-filter-group.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  ViewFilterEntity,
  ApplicationEntity,
  FieldMetadataEntity,
  ViewFilterGroupEntity,
  ViewEntity,
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
  applicationId: 'app',
  ...extras,
});
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    [FieldMetadataEntity, [row('field'), row('target')]],
    [
      ViewFilterGroupEntity,
      [row('group', { deletedAt: new Date('2024-01-01') })],
    ],
    [ViewEntity, [row('view', { deletedAt: new Date('2024-01-01') })]],
    [
      ViewFilterEntity,
      [
        row('filter', {
          fieldMetadataId: 'field',
          relationTargetFieldMetadataId: 'target',
          viewFilterGroupId: 'group',
          viewId: 'view',
          operand: ViewFilterOperand.CONTAINS,
          value: 'creator',
          positionInViewFilterGroup: 2,
          deletedAt: new Date('2024-01-01'),
        }),
        row('ungrouped', {
          fieldMetadataId: 'field',
          relationTargetFieldMetadataId: null,
          viewFilterGroupId: null,
          viewId: 'view',
          operand: ViewFilterOperand.CONTAINS,
          value: 'other',
        }),
      ],
    ],
  ]);

// Only TypeORM I/O is fake: provider, scoped wrappers, conversion and map insertion are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options.where).toEqual({ workspaceId });
      expect(options.withDeleted).toBe(true);
      expect(options.select).toEqual(
        entity === ViewFilterEntity ? undefined : ['id', 'universalIdentifier'],
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
  return new WorkspaceFlatViewFilterMapCacheService(
    scoped<ViewFilterEntity>(ViewFilterEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
    scoped<ViewFilterGroupEntity>(ViewFilterGroupEntity),
    scoped<ViewEntity>(ViewEntity),
  );
};

describe('WorkspaceFlatViewFilterMapCacheService manager-bound computation', () => {
  it('uses all five scoped/manager reads through both entry points and resolves scalar, relation and map indexes', async () => {
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
    expect(local.byUniversalIdentifier['uid-filter']).toMatchObject({
      operand: ViewFilterOperand.CONTAINS,
      value: 'creator',
      positionInViewFilterGroup: 2,
      applicationUniversalIdentifier: 'uid-app',
      fieldMetadataUniversalIdentifier: 'uid-field',
      relationTargetFieldMetadataUniversalIdentifier: 'uid-target',
      viewFilterGroupUniversalIdentifier: 'uid-group',
      viewUniversalIdentifier: 'uid-view',
    });
    expect(local.byUniversalIdentifier['uid-ungrouped']).toMatchObject({
      relationTargetFieldMetadataUniversalIdentifier: null,
      viewFilterGroupUniversalIdentifier: null,
    });
    expect(local.universalIdentifierById).toEqual({
      filter: 'uid-filter',
      ungrouped: 'uid-ungrouped',
    });
    expect(local.universalIdentifiersByApplicationId['app']).toEqual([
      'uid-filter',
      'uid-ungrouped',
    ]);
  });

  it('rebuilds group and field membership on a changed local state without mutating the earlier map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(FieldMetadataEntity)!.push(row('replacement'));
    state.get(ViewFilterGroupEntity)!.push(row('new-group'));
    state.get(ViewFilterEntity)![0] = {
      ...state.get(ViewFilterEntity)![0],
      fieldMetadataId: 'replacement',
      relationTargetFieldMetadataId: 'replacement',
      viewFilterGroupId: 'new-group',
    };
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-filter']).toMatchObject({
      fieldMetadataUniversalIdentifier: 'uid-replacement',
      relationTargetFieldMetadataUniversalIdentifier: 'uid-replacement',
      viewFilterGroupUniversalIdentifier: 'uid-new-group',
    });
    expect(first.byUniversalIdentifier['uid-filter']).toMatchObject({
      fieldMetadataUniversalIdentifier: 'uid-field',
      relationTargetFieldMetadataUniversalIdentifier: 'uid-target',
      viewFilterGroupUniversalIdentifier: 'uid-group',
    });
  });

  it('isolates foreign-workspace rows for all five queries, including deleted owners', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`foreign-${entity.name}`, {
          workspaceId: 'workspace-B',
          applicationId: 'foreign-ApplicationEntity',
          fieldMetadataId: 'foreign-FieldMetadataEntity',
          relationTargetFieldMetadataId: null,
          viewFilterGroupId: 'foreign-ViewFilterGroupEntity',
          viewId: 'foreign-ViewEntity',
        }),
      );
    }
    const local = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(local.byUniversalIdentifier)).toEqual([
      'uid-filter',
      'uid-ungrouped',
    ]);
    expect(
      local.universalIdentifierById['foreign-ViewFilterEntity'],
    ).toBeUndefined();
    expect(local.byUniversalIdentifier['uid-filter']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      viewFilterGroupUniversalIdentifier: 'uid-group',
    });
  });

  it('retains required owner and group UID errors and duplicate UID rejection', async () => {
    const state = rows();
    const provider = service(fixture(new Map()).manager);
    const manager = fixture(state).manager;
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'Application with id app not found for viewFilter filter',
    );
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(FieldMetadataEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'FieldMetadata with id field not found for viewFilter filter',
    );
    state.set(FieldMetadataEntity, rows().get(FieldMetadataEntity)!);
    state.set(ViewEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('View with id view not found for viewFilter filter');
    state.set(ViewEntity, rows().get(ViewEntity)!);
    state.set(ViewFilterGroupEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow(
      'ViewFilterGroup with id group not found for viewFilter filter',
    );
    state.set(ViewFilterGroupEntity, rows().get(ViewFilterGroupEntity)!);
    state.get(ViewFilterEntity)!.push(
      row('duplicate', {
        universalIdentifier: 'uid-filter',
        fieldMetadataId: 'field',
        viewId: 'view',
        viewFilterGroupId: null,
      }),
    );
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('already exists');
  });

  it.each(['', undefined])(
    'rejects invalid workspace %s at the scoped boundary',
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
