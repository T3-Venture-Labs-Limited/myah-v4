import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { CommandMenuItemEntity } from 'src/engine/metadata-modules/command-menu-item/entities/command-menu-item.entity';
import { WorkspaceFlatCommandMenuItemMapCacheService } from 'src/engine/metadata-modules/flat-command-menu-item/services/workspace-flat-command-menu-item-map-cache.service';
import { FrontComponentEntity } from 'src/engine/metadata-modules/front-component/entities/front-component.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PageLayoutEntity } from 'src/engine/metadata-modules/page-layout/entities/page-layout.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  CommandMenuItemEntity,
  ApplicationEntity,
  ObjectMetadataEntity,
  FrontComponentEntity,
  PageLayoutEntity,
] as const;
type Row = {
  id: string;
  workspaceId: string;
  universalIdentifier: string;
  applicationId?: string;
  deletedAt?: Date | null;
  [key: string]: unknown;
};
type Rows = Map<Function, Row[]>;
const row = (id: string, extra: Record<string, unknown> = {}): Row => ({
  id,
  workspaceId,
  universalIdentifier: `uid-${id}`,
  ...extra,
});
const item = (extra: Record<string, unknown> = {}): Row =>
  row('menu', {
    applicationId: 'app',
    label: 'Synthetic menu',
    frontComponentId: 'front',
    availabilityObjectMetadataId: 'object',
    pageLayoutId: 'layout',
    overrides: {
      availabilityObjectMetadataId: 'object',
      pageLayoutId: 'layout',
    },
    ...extra,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    [ObjectMetadataEntity, [row('object')]],
    [FrontComponentEntity, [row('front')]],
    [PageLayoutEntity, [row('layout')]],
    [CommandMenuItemEntity, [item()]],
  ]);

// Only TypeORM I/O is faked; scoped wrappers, conversion and indexes are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === CommandMenuItemEntity
          ? { where: { workspaceId }, withDeleted: true }
          : {
              where: { workspaceId },
              select: ['id', 'universalIdentifier'],
              withDeleted: true,
            },
      );
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
  const getRepository = jest.fn((entity: Function) => {
    const repository = repositories.get(entity);
    if (!repository) throw new Error(`Unexpected repository: ${entity.name}`);
    return repository;
  });
  return {
    manager: { getRepository } as unknown as EntityManager,
    calls,
    getRepository,
  };
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
  return new WorkspaceFlatCommandMenuItemMapCacheService(
    scoped<CommandMenuItemEntity>(CommandMenuItemEntity),
    Object.assign(pooled<ApplicationEntity>(ApplicationEntity), {
      manager: ordinaryManager,
    }),
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    pooled<FrontComponentEntity>(FrontComponentEntity),
    scoped<PageLayoutEntity>(PageLayoutEntity),
  );
};

describe('WorkspaceFlatCommandMenuItemMapCacheService manager-bound computation', () => {
  it('binds all five exact reads for ordinary and supplied managers, resolving relations and indexes', async () => {
    const ordinary = fixture(rows());
    const pinned = fixture(rows());
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
      expect(ordinary.getRepository).toHaveBeenCalledWith(entity);
      expect(pinned.getRepository).toHaveBeenCalledWith(entity);
    }
    expect(local.byUniversalIdentifier['uid-menu']).toMatchObject({
      id: 'menu',
      label: 'Synthetic menu',
      applicationUniversalIdentifier: 'uid-app',
      availabilityObjectMetadataUniversalIdentifier: 'uid-object',
      frontComponentUniversalIdentifier: 'uid-front',
      pageLayoutUniversalIdentifier: 'uid-layout',
      universalOverrides: {
        availabilityObjectMetadataUniversalIdentifier: 'uid-object',
        pageLayoutUniversalIdentifier: 'uid-layout',
      },
    });
    expect(local.universalIdentifierById).toEqual({ menu: 'uid-menu' });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-menu'],
    });
  });

  it('starts the four other reads while the first scoped read is held', async () => {
    let release!: (value: Row[]) => void;
    const held = new Promise<Row[]>((resolve) => {
      release = resolve;
    });
    const finds = new Map<Function, jest.Mock>(
      entities.map((entity) => [
        entity,
        jest.fn(() =>
          entity === CommandMenuItemEntity ? held : Promise.resolve([]),
        ),
      ]),
    );
    const manager = {
      getRepository: (entity: Function) => ({
        target: entity,
        find: finds.get(entity),
      }),
    } as unknown as EntityManager;
    const result = service(manager).computeFromManager(workspaceId, manager);
    for (const entity of entities.slice(1))
      expect(finds.get(entity)).toHaveBeenCalledTimes(1);
    release([]);
    await expect(result).resolves.toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('recomputes changed owner, UID and relations without mutating the first maps', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.set(ApplicationEntity, [row('new-app')]);
    state.set(ObjectMetadataEntity, [row('new-object')]);
    state.set(FrontComponentEntity, [row('new-front')]);
    state.set(PageLayoutEntity, [row('new-layout')]);
    state.set(CommandMenuItemEntity, [
      item({
        id: 'new-menu',
        universalIdentifier: 'uid-new-menu',
        applicationId: 'new-app',
        availabilityObjectMetadataId: 'new-object',
        frontComponentId: 'new-front',
        pageLayoutId: 'new-layout',
        label: 'Changed menu',
        overrides: {
          availabilityObjectMetadataId: 'new-object',
          pageLayoutId: 'new-layout',
        },
      }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-menu']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-new-menu']).toMatchObject({
      label: 'Changed menu',
      applicationUniversalIdentifier: 'uid-new-app',
      availabilityObjectMetadataUniversalIdentifier: 'uid-new-object',
      frontComponentUniversalIdentifier: 'uid-new-front',
      pageLayoutUniversalIdentifier: 'uid-new-layout',
      universalOverrides: {
        availabilityObjectMetadataUniversalIdentifier: 'uid-new-object',
        pageLayoutUniversalIdentifier: 'uid-new-layout',
      },
    });
    expect(second.universalIdentifierById).toEqual({
      'new-menu': 'uid-new-menu',
    });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      'new-app': ['uid-new-menu'],
    });
    expect(first.byUniversalIdentifier['uid-menu']).toMatchObject({
      label: 'Synthetic menu',
      applicationUniversalIdentifier: 'uid-app',
      pageLayoutUniversalIdentifier: 'uid-layout',
    });
    expect(first.universalIdentifierById).toEqual({ menu: 'uid-menu' });
    expect(first.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-menu'],
    });
  });

  it('excludes other workspaces and rejects missing owner, missing relation and duplicate UID', async () => {
    const state = rows();
    state.get(CommandMenuItemEntity)!.push(
      item({
        id: 'foreign',
        workspaceId: 'workspace-B',
        universalIdentifier: 'uid-foreign',
      }),
    );
    state
      .get(ApplicationEntity)!
      .push(row('foreign-app', { workspaceId: 'workspace-B' }));
    const manager = fixture(state).manager;
    const provider = service(manager);
    const scoped = await provider.computeFromManager(workspaceId, manager);
    expect(scoped.universalIdentifierById['foreign']).toBeUndefined();
    state.set(ApplicationEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('Application with id app not found');
    state.set(ApplicationEntity, rows().get(ApplicationEntity)!);
    state.set(FrontComponentEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('FrontComponent with id front not found');
    state.set(FrontComponentEntity, rows().get(FrontComponentEntity)!);
    state.get(CommandMenuItemEntity)!.push(item({ id: 'duplicate' }));
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('flat entity to add already exists');
  });

  it('returns fresh empty maps and rejects invalid workspace before acquiring any repository', async () => {
    const state = rows();
    state.set(CommandMenuItemEntity, []);
    const pinned = fixture(state);
    const provider = service(pinned.manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(first).toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    pinned.getRepository.mockClear();
    for (const invalid of [undefined, null, '']) {
      await expect(
        provider.computeFromManager(invalid as string, pinned.manager),
      ).rejects.toThrow();
      await expect(
        provider.computeForCache(invalid as string),
      ).rejects.toThrow();
    }
    expect(pinned.getRepository).not.toHaveBeenCalled();
  });
});
