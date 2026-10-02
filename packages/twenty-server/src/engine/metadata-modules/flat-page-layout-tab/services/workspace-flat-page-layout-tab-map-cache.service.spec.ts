import { PageLayoutTabLayoutMode } from 'twenty-shared/types';
import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatPageLayoutTabMapCacheService } from 'src/engine/metadata-modules/flat-page-layout-tab/services/workspace-flat-page-layout-tab-map-cache.service';
import { PageLayoutTabEntity } from 'src/engine/metadata-modules/page-layout-tab/entities/page-layout-tab.entity';
import { PageLayoutWidgetEntity } from 'src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity';
import { PageLayoutEntity } from 'src/engine/metadata-modules/page-layout/entities/page-layout.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const deletedAt = new Date('2024-01-02');
const entities = [
  PageLayoutTabEntity,
  PageLayoutWidgetEntity,
  ApplicationEntity,
  PageLayoutEntity,
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
const tab = (id: string, extras: Record<string, unknown> = {}): Row =>
  row(id, {
    title: id,
    pageLayoutId: 'layout',
    position: 2,
    isActive: true,
    isSystemSideEffect: false,
    icon: null,
    layoutMode: PageLayoutTabLayoutMode.GRID,
    overrides: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      PageLayoutTabEntity,
      [
        tab('tab', { deletedAt, overrides: { title: 'custom' } }),
        tab('second'),
      ],
    ],
    [
      PageLayoutWidgetEntity,
      [
        row('widget', { pageLayoutTabId: 'tab', deletedAt }),
        row('other-widget', { pageLayoutTabId: 'second' }),
      ],
    ],
    [ApplicationEntity, [row('app', { deletedAt })]],
    [PageLayoutEntity, [row('layout', { deletedAt })]],
  ]);

// Only manager repository I/O is fake; wrappers, provider, converter and indexes are real.
const fixture = (
  state: Rows,
  pending?: { entity: Function; started: () => void; wait: Promise<void> },
) => {
  const calls = new Map<Function, jest.Mock>();
  const repositories = new Map<Function, Repository<never>>();
  const getRepository = jest.fn((entity: Function) => {
    const repository = repositories.get(entity);
    if (!repository) throw new Error(`Unexpected repository: ${entity.name}`);
    return repository;
  });
  for (const entity of entities) {
    const find = jest.fn(async (options: FindManyOptions<Row>) => {
      expect(options).toEqual({
        where: { workspaceId },
        withDeleted: true,
        ...(entity === PageLayoutWidgetEntity
          ? { select: ['id', 'universalIdentifier', 'pageLayoutTabId'] }
          : entity === ApplicationEntity || entity === PageLayoutEntity
            ? { select: ['id', 'universalIdentifier'] }
            : {}),
      });
      if (pending?.entity === entity) {
        pending.started();
        await pending.wait;
      }
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
  return new WorkspaceFlatPageLayoutTabMapCacheService(
    scoped<PageLayoutTabEntity>(PageLayoutTabEntity),
    scoped<PageLayoutWidgetEntity>(PageLayoutWidgetEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    scoped<PageLayoutEntity>(PageLayoutEntity),
  );
};

describe('WorkspaceFlatPageLayoutTabMapCacheService manager-bound computation', () => {
  it('binds all four ordinary and explicit reads and resolves real tab, widget, owner, layout and indexes', async () => {
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
      expect(pinned.getRepository).toHaveBeenCalledWith(entity);
    }
    expect(local.byUniversalIdentifier['uid-tab']).toMatchObject({
      deletedAt: deletedAt.toISOString(),
      applicationUniversalIdentifier: 'uid-app',
      pageLayoutUniversalIdentifier: 'uid-layout',
      widgetIds: ['widget'],
      widgetUniversalIdentifiers: ['uid-widget'],
      overrides: { title: 'custom' },
    });
    expect(local.byUniversalIdentifier['uid-second']).toMatchObject({
      widgetIds: ['other-widget'],
      widgetUniversalIdentifiers: ['uid-other-widget'],
      overrides: null,
    });
    expect(local.universalIdentifierById).toEqual({
      tab: 'uid-tab',
      second: 'uid-second',
    });
    expect(local.universalIdentifiersByApplicationId.app).toEqual([
      'uid-tab',
      'uid-second',
    ]);
  });

  it('launches all four reads while the first scoped read is still pending', async () => {
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstRead = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pinned = fixture(rows(), {
      entity: PageLayoutTabEntity,
      started,
      wait,
    });
    const computation = service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      pinned.manager,
    );
    await firstRead;
    try {
      for (const entity of entities)
        expect(pinned.calls.get(entity)).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    await computation;
  });

  it('recomputes widget reparenting and changed owner/layout UIDs without altering the first result', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(PageLayoutWidgetEntity)![0] = row('widget', {
      pageLayoutTabId: 'second',
      universalIdentifier: 'uid-widget-v2',
      deletedAt,
    });
    state.get(PageLayoutTabEntity)![0] = tab('tab', {
      universalIdentifier: 'uid-tab-v2',
      pageLayoutId: 'new-layout',
      applicationId: 'new-app',
      deletedAt,
    });
    state.get(ApplicationEntity)!.push(row('new-app'));
    state.get(PageLayoutEntity)!.push(row('new-layout'));
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-tab']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-tab-v2']).toMatchObject({
      pageLayoutUniversalIdentifier: 'uid-new-layout',
      applicationUniversalIdentifier: 'uid-new-app',
      widgetIds: [],
      widgetUniversalIdentifiers: [],
    });
    expect(second.byUniversalIdentifier['uid-second']).toMatchObject({
      widgetIds: ['widget', 'other-widget'],
      widgetUniversalIdentifiers: ['uid-widget-v2', 'uid-other-widget'],
    });
    expect(second.universalIdentifierById).toEqual({
      tab: 'uid-tab-v2',
      second: 'uid-second',
    });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      'new-app': ['uid-tab-v2'],
      app: ['uid-second'],
    });
    expect(first.byUniversalIdentifier['uid-tab']).toMatchObject({
      widgetIds: ['widget'],
      widgetUniversalIdentifiers: ['uid-widget'],
      pageLayoutUniversalIdentifier: 'uid-layout',
      applicationUniversalIdentifier: 'uid-app',
    });
    expect(first.universalIdentifierById.tab).toBe('uid-tab');
    expect(first.universalIdentifiersByApplicationId.app).toEqual([
      'uid-tab',
      'uid-second',
    ]);
  });

  it.each(['application', 'layout'] as const)(
    'rejects missing required %s',
    async (missing) => {
      const state = rows();
      if (missing === 'application')
        state.get(PageLayoutTabEntity)![0].applicationId = 'missing';
      else state.get(PageLayoutTabEntity)![0].pageLayoutId = 'missing';
      await expect(
        service(fixture(new Map()).manager).computeFromManager(
          workspaceId,
          fixture(state).manager,
        ),
      ).rejects.toThrow(/not found/);
    },
  );

  it('rejects duplicate tab UIDs and creates fresh empty maps', async () => {
    const state = rows();
    state.get(PageLayoutTabEntity)![1].universalIdentifier = 'uid-tab';
    const provider = service(fixture(new Map()).manager);
    await expect(
      provider.computeFromManager(workspaceId, fixture(state).manager),
    ).rejects.toThrow(/already exists/);
    const empty = await provider.computeFromManager(
      workspaceId,
      fixture(new Map()).manager,
    );
    expect(empty).toEqual({
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    });
  });

  it('rejects invalid workspace before any repository acquisition or direct read', async () => {
    const pinned = fixture(rows());
    const provider = service(pinned.manager);
    for (const invalid of [undefined, null, '']) {
      await expect(
        provider.computeFromManager(invalid as string, pinned.manager),
      ).rejects.toThrow(/workspaceId/);
      await expect(provider.computeForCache(invalid as string)).rejects.toThrow(
        /workspaceId/,
      );
    }
    expect(pinned.getRepository).not.toHaveBeenCalled();
    for (const entity of entities)
      expect(pinned.calls.get(entity)).not.toHaveBeenCalled();
  });

  it('excludes workspace B rows even when manager contains both scopes', async () => {
    const state = rows();
    for (const entity of entities)
      state
        .get(entity)!
        .push(row(`foreign-${entity.name}`, { workspaceId: 'workspace-B' }));
    const maps = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(maps.byUniversalIdentifier)).toEqual([
      'uid-tab',
      'uid-second',
    ]);
  });
});
