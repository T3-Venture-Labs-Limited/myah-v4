import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatNavigationMenuItemMapCacheService } from 'src/engine/metadata-modules/flat-navigation-menu-item/services/workspace-flat-navigation-menu-item-map-cache.service';
import { NavigationMenuItemEntity } from 'src/engine/metadata-modules/navigation-menu-item/entities/navigation-menu-item.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PageLayoutEntity } from 'src/engine/metadata-modules/page-layout/entities/page-layout.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const entities = [
  NavigationMenuItemEntity,
  ApplicationEntity,
  ObjectMetadataEntity,
  ViewEntity,
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
const folder = (extra: Record<string, unknown> = {}) =>
  row('folder', {
    applicationId: 'app',
    name: 'Synthetic folder',
    folderId: null,
    userWorkspaceId: 'user-A',
    ...extra,
  });
const menu = (extra: Record<string, unknown> = {}) =>
  row('menu', {
    applicationId: 'app',
    name: 'Synthetic menu',
    folderId: 'folder',
    userWorkspaceId: 'user-A',
    targetObjectMetadataId: 'object',
    viewId: 'view',
    pageLayoutId: 'layout',
    ...extra,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [ApplicationEntity, [row('app', { deletedAt: new Date('2024-01-01') })]],
    [ObjectMetadataEntity, [row('object')]],
    [ViewEntity, [row('view', { deletedAt: new Date('2024-01-01') })]],
    [PageLayoutEntity, [row('layout')]],
    [NavigationMenuItemEntity, [folder(), menu()]],
  ]);

// Only TypeORM I/O is faked; scoped wrappers, conversion and custom indexes are real.
const fixture = (state: Rows) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual(
        entity === NavigationMenuItemEntity
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
  return new WorkspaceFlatNavigationMenuItemMapCacheService(
    scoped<NavigationMenuItemEntity>(NavigationMenuItemEntity),
    Object.assign(pooled<ApplicationEntity>(ApplicationEntity), {
      manager: ordinaryManager,
    }),
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    scoped<ViewEntity>(ViewEntity),
    scoped<PageLayoutEntity>(PageLayoutEntity),
  );
};

describe('WorkspaceFlatNavigationMenuItemMapCacheService manager-bound computation', () => {
  it('binds all five exact reads for ordinary and supplied managers, resolving folder and related UIDs and indexes', async () => {
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
      applicationUniversalIdentifier: 'uid-app',
      targetObjectMetadataUniversalIdentifier: 'uid-object',
      viewUniversalIdentifier: 'uid-view',
      pageLayoutUniversalIdentifier: 'uid-layout',
      folderUniversalIdentifier: 'uid-folder',
    });
    expect(local.universalIdentifierById).toEqual({
      folder: 'uid-folder',
      menu: 'uid-menu',
    });
    expect(local.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-folder', 'uid-menu'],
    });
    expect(local.byUserWorkspaceIdAndFolderId).toMatchObject({
      'user-A': {
        folder: [local.byUniversalIdentifier['uid-menu']],
        null: [local.byUniversalIdentifier['uid-folder']],
      },
    });
  });

  it('starts the other four reads while the first scoped read is held', async () => {
    let release!: (value: Row[]) => void;
    const held = new Promise<Row[]>((resolve) => {
      release = resolve;
    });
    const finds = new Map<Function, jest.Mock>(
      entities.map((entity) => [
        entity,
        jest.fn(() =>
          entity === NavigationMenuItemEntity ? held : Promise.resolve([]),
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
      byUserWorkspaceIdAndFolderId: {},
    });
  });

  it('rebuilds owner, UID and folder indexes after a reparent without altering the first maps', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.set(ApplicationEntity, [row('new-app')]);
    state.set(ObjectMetadataEntity, [row('new-object')]);
    state.set(ViewEntity, [row('new-view')]);
    state.set(PageLayoutEntity, [row('new-layout')]);
    state.set(NavigationMenuItemEntity, [
      folder({
        id: 'new-folder',
        universalIdentifier: 'uid-new-folder',
        applicationId: 'new-app',
        userWorkspaceId: 'user-B',
      }),
      menu({
        id: 'new-menu',
        universalIdentifier: 'uid-new-menu',
        applicationId: 'new-app',
        folderId: 'new-folder',
        userWorkspaceId: 'user-B',
        targetObjectMetadataId: 'new-object',
        viewId: 'new-view',
        pageLayoutId: 'new-layout',
        name: 'Changed menu',
      }),
    ]);
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-menu']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-new-menu']).toMatchObject({
      name: 'Changed menu',
      applicationUniversalIdentifier: 'uid-new-app',
      folderUniversalIdentifier: 'uid-new-folder',
      targetObjectMetadataUniversalIdentifier: 'uid-new-object',
      viewUniversalIdentifier: 'uid-new-view',
      pageLayoutUniversalIdentifier: 'uid-new-layout',
    });
    expect(second.universalIdentifierById).toEqual({
      'new-folder': 'uid-new-folder',
      'new-menu': 'uid-new-menu',
    });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      'new-app': ['uid-new-folder', 'uid-new-menu'],
    });
    expect(second.byUserWorkspaceIdAndFolderId).toEqual({
      'user-B': {
        null: [second.byUniversalIdentifier['uid-new-folder']],
        'new-folder': [second.byUniversalIdentifier['uid-new-menu']],
      },
    });
    expect(first.byUniversalIdentifier['uid-menu']).toMatchObject({
      name: 'Synthetic menu',
      applicationUniversalIdentifier: 'uid-app',
      folderUniversalIdentifier: 'uid-folder',
    });
    expect(first.universalIdentifierById).toEqual({
      folder: 'uid-folder',
      menu: 'uid-menu',
    });
    expect(first.universalIdentifiersByApplicationId).toEqual({
      app: ['uid-folder', 'uid-menu'],
    });
    expect(first.byUserWorkspaceIdAndFolderId).toMatchObject({
      'user-A': { folder: [first.byUniversalIdentifier['uid-menu']] },
    });
  });

  it('excludes workspace B and rejects missing owner, related UID, parent UID and duplicate UID', async () => {
    const state = rows();
    state.get(NavigationMenuItemEntity)!.push(
      menu({
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
    state.set(ViewEntity, []);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('View with id view not found');
    state.set(ViewEntity, rows().get(ViewEntity)!);
    state.set(NavigationMenuItemEntity, [menu()]);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('NavigationMenuItem with id folder not found');
    state.set(NavigationMenuItemEntity, [
      folder(),
      menu(),
      menu({ id: 'duplicate' }),
    ]);
    await expect(
      provider.computeFromManager(workspaceId, manager),
    ).rejects.toThrow('flat entity to add already exists');
  });

  it('returns fresh empty maps and rejects invalid workspace before acquiring any repository', async () => {
    const state = rows();
    state.set(NavigationMenuItemEntity, []);
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
      byUserWorkspaceIdAndFolderId: {},
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
