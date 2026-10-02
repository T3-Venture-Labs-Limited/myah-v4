import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { WorkspaceFlatPageLayoutMapCacheService } from 'src/engine/metadata-modules/flat-page-layout/services/workspace-flat-page-layout-map-cache.service';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PageLayoutTabEntity } from 'src/engine/metadata-modules/page-layout-tab/entities/page-layout-tab.entity';
import { PageLayoutEntity } from 'src/engine/metadata-modules/page-layout/entities/page-layout.entity';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const deletedAt = new Date('2024-01-02');
const entities = [
  PageLayoutEntity,
  PageLayoutTabEntity,
  ApplicationEntity,
  ObjectMetadataEntity,
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
const layout = (id: string, extras: Record<string, unknown> = {}): Row =>
  row(id, {
    name: id,
    type: PageLayoutType.RECORD_PAGE,
    objectMetadataId: 'object',
    defaultTabToFocusOnMobileAndSidePanelId: 'tab',
    isSystemSideEffect: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      PageLayoutEntity,
      [
        layout('layout', { deletedAt }),
        layout('second', {
          defaultTabToFocusOnMobileAndSidePanelId: null,
          objectMetadataId: null,
        }),
      ],
    ],
    [
      PageLayoutTabEntity,
      [
        row('tab', { pageLayoutId: 'layout', deletedAt }),
        row('other-tab', { pageLayoutId: 'second' }),
      ],
    ],
    [ApplicationEntity, [row('app', { deletedAt })]],
    [ObjectMetadataEntity, [row('object', { deletedAt })]],
  ]);

// The provider, scoped wrappers, regrouping, converter and index helper are real.
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
        ...(entity === PageLayoutTabEntity
          ? { select: ['id', 'universalIdentifier', 'pageLayoutId'] }
          : entity === ApplicationEntity || entity === ObjectMetadataEntity
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
  return new WorkspaceFlatPageLayoutMapCacheService(
    scoped<PageLayoutEntity>(PageLayoutEntity),
    scoped<PageLayoutTabEntity>(PageLayoutTabEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
  );
};

describe('WorkspaceFlatPageLayoutMapCacheService manager-bound computation', () => {
  it('uses the ordinary and explicit managers for four parallel scoped reads and real layout conversion', async () => {
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
    expect(local.byUniversalIdentifier['uid-layout']).toMatchObject({
      deletedAt: deletedAt.toISOString(),
      applicationUniversalIdentifier: 'uid-app',
      objectMetadataUniversalIdentifier: 'uid-object',
      defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier: 'uid-tab',
      tabIds: ['tab'],
      tabUniversalIdentifiers: ['uid-tab'],
    });
    expect(local.byUniversalIdentifier['uid-second']).toMatchObject({
      objectMetadataUniversalIdentifier: null,
      defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier: null,
      tabIds: ['other-tab'],
    });
    expect(local.universalIdentifierById).toEqual({
      layout: 'uid-layout',
      second: 'uid-second',
    });
    expect(local.universalIdentifiersByApplicationId['app']).toEqual([
      'uid-layout',
      'uid-second',
    ]);
  });

  it('starts all four reads before the first pending read resolves', async () => {
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstRead = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pinned = fixture(rows(), { entity: PageLayoutEntity, started, wait });
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

  it('recomputes reparented tabs and changed owner/object/default-tab UIDs with fresh indexes', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(PageLayoutTabEntity)![0] = row('tab', {
      pageLayoutId: 'second',
      universalIdentifier: 'uid-tab-v2',
      deletedAt,
    });
    state.get(PageLayoutEntity)![0] = layout('layout', {
      universalIdentifier: 'uid-layout-v2',
      applicationId: 'new-app',
      objectMetadataId: 'new-object',
      defaultTabToFocusOnMobileAndSidePanelId: 'other-tab',
      deletedAt,
    });
    state.get(ApplicationEntity)!.push(row('new-app'));
    state.get(ObjectMetadataEntity)!.push(row('new-object'));
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-layout']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-layout-v2']).toMatchObject({
      applicationUniversalIdentifier: 'uid-new-app',
      objectMetadataUniversalIdentifier: 'uid-new-object',
      defaultTabToFocusOnMobileAndSidePanelUniversalIdentifier: 'uid-other-tab',
      tabIds: [],
      tabUniversalIdentifiers: [],
    });
    expect(second.byUniversalIdentifier['uid-second']).toMatchObject({
      tabIds: ['tab', 'other-tab'],
      tabUniversalIdentifiers: ['uid-tab-v2', 'uid-other-tab'],
    });
    expect(second.universalIdentifierById).toEqual({
      layout: 'uid-layout-v2',
      second: 'uid-second',
    });
    expect(second.universalIdentifiersByApplicationId).toEqual({
      'new-app': ['uid-layout-v2'],
      app: ['uid-second'],
    });
    expect(first.byUniversalIdentifier['uid-layout']).toMatchObject({
      tabIds: ['tab'],
      tabUniversalIdentifiers: ['uid-tab'],
      applicationUniversalIdentifier: 'uid-app',
    });
    expect(first.universalIdentifierById.layout).toBe('uid-layout');
    expect(first.universalIdentifiersByApplicationId.app).toEqual([
      'uid-layout',
      'uid-second',
    ]);
  });

  it.each(['application', 'object', 'defaultTab'] as const)(
    'rejects missing required %s',
    async (missing) => {
      const state = rows();
      const layoutRow = state.get(PageLayoutEntity)![0];
      if (missing === 'application') layoutRow.applicationId = 'missing';
      if (missing === 'object') layoutRow.objectMetadataId = 'missing';
      if (missing === 'defaultTab')
        layoutRow.defaultTabToFocusOnMobileAndSidePanelId = 'missing';
      await expect(
        service(fixture(new Map()).manager).computeFromManager(
          workspaceId,
          fixture(state).manager,
        ),
      ).rejects.toThrow(/not found/);
    },
  );

  it('rejects duplicate layout UIDs and returns fresh empty maps', async () => {
    const state = rows();
    state.get(PageLayoutEntity)![1].universalIdentifier = 'uid-layout';
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

  it('rejects invalid workspace before acquiring any repository or reading', async () => {
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

  it('does not include rows from another workspace even if the fake contains them', async () => {
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
      'uid-layout',
      'uid-second',
    ]);
  });
});
