import {
  type EntityManager,
  type FindManyOptions,
  type Repository,
} from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { WorkspaceFlatPageLayoutWidgetMapCacheService } from 'src/engine/metadata-modules/flat-page-layout-widget/services/workspace-flat-page-layout-widget-map-cache.service';
import { FrontComponentEntity } from 'src/engine/metadata-modules/front-component/entities/front-component.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { PageLayoutTabEntity } from 'src/engine/metadata-modules/page-layout-tab/entities/page-layout-tab.entity';
import { PageLayoutWidgetEntity } from 'src/engine/metadata-modules/page-layout-widget/entities/page-layout-widget.entity';
import { FieldDisplayMode } from 'src/engine/metadata-modules/page-layout-widget/enums/field-display-mode.enum';
import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const workspaceId = 'workspace-A';
const deletedAt = new Date('2024-01-02');
const entities = [
  PageLayoutWidgetEntity,
  ApplicationEntity,
  PageLayoutTabEntity,
  ObjectMetadataEntity,
  FieldMetadataEntity,
  FrontComponentEntity,
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
const widget = (id: string, extras: Record<string, unknown> = {}): Row =>
  row(id, {
    pageLayoutTabId: 'tab',
    objectMetadataId: 'object',
    title: id,
    type: WidgetType.FIELD,
    configuration: {
      configurationType: WidgetConfigurationType.FIELD,
      fieldMetadataId: 'field',
      fieldDisplayMode: FieldDisplayMode.FIELD,
      viewId: 'view',
    },
    gridPosition: { row: 0, column: 0, rowSpan: 1, columnSpan: 1 },
    position: null,
    conditionalDisplay: null,
    conditionalAvailabilityExpression: null,
    overrides: { title: 'Custom title', pageLayoutTabId: 'tab' },
    isSystemSideEffect: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...extras,
  });
const rows = (): Rows =>
  new Map<Function, Row[]>([
    [
      PageLayoutWidgetEntity,
      [
        widget('widget', { deletedAt }),
        widget('front-widget', {
          type: WidgetType.FRONT_COMPONENT,
          configuration: {
            configurationType: WidgetConfigurationType.FRONT_COMPONENT,
            frontComponentId: 'front',
          },
          objectMetadataId: null,
          overrides: null,
        }),
        widget('fields-widget', {
          type: WidgetType.FIELDS,
          configuration: {
            configurationType: WidgetConfigurationType.FIELDS,
            viewId: 'view',
            newFieldDefaultVisibility: true,
          },
        }),
      ],
    ],
    [ApplicationEntity, [row('app', { deletedAt })]],
    [PageLayoutTabEntity, [row('tab', { deletedAt }), row('other-tab')]],
    [ObjectMetadataEntity, [row('object')]],
    [FieldMetadataEntity, [row('field')]],
    [FrontComponentEntity, [row('front')]],
    [ViewEntity, [row('view', { deletedAt })]],
  ]);

// Only TypeORM I/O is fake; provider, scoped wrappers, converter and indexes are real.
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
          ? {}
          : { select: ['id', 'universalIdentifier'] }),
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
  return new WorkspaceFlatPageLayoutWidgetMapCacheService(
    scoped<PageLayoutWidgetEntity>(PageLayoutWidgetEntity),
    {
      ...pooled<ApplicationEntity>(ApplicationEntity),
      manager: ordinaryManager,
    } as Repository<ApplicationEntity>,
    scoped<PageLayoutTabEntity>(PageLayoutTabEntity),
    pooled<ObjectMetadataEntity>(ObjectMetadataEntity),
    pooled<FieldMetadataEntity>(FieldMetadataEntity),
    pooled<FrontComponentEntity>(FrontComponentEntity),
    scoped<ViewEntity>(ViewEntity),
  );
};

describe('WorkspaceFlatPageLayoutWidgetMapCacheService manager-bound computation', () => {
  it('uses all seven manager reads for ordinary and explicit computation with original selections and conversion', async () => {
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
    expect(local.byUniversalIdentifier['uid-widget']).toMatchObject({
      deletedAt: deletedAt.toISOString(),
      applicationUniversalIdentifier: 'uid-app',
      pageLayoutTabUniversalIdentifier: 'uid-tab',
      objectMetadataUniversalIdentifier: 'uid-object',
      configuration: {
        configurationType: WidgetConfigurationType.FIELD,
        fieldMetadataId: 'field',
        viewId: 'view',
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.FIELD,
        fieldMetadataId: 'uid-field',
        viewId: 'uid-view',
      },
      overrides: { title: 'Custom title', pageLayoutTabId: 'tab' },
      universalOverrides: {
        title: 'Custom title',
        pageLayoutTabUniversalIdentifier: 'uid-tab',
      },
    });
    expect(local.byUniversalIdentifier['uid-front-widget']).toMatchObject({
      objectMetadataUniversalIdentifier: null,
      universalConfiguration: {
        frontComponentUniversalIdentifier: 'uid-front',
      },
      universalOverrides: null,
    });
    expect(local.byUniversalIdentifier['uid-fields-widget']).toMatchObject({
      universalConfiguration: { viewUniversalIdentifier: 'uid-view' },
    });
    expect(local.universalIdentifierById).toEqual({
      widget: 'uid-widget',
      'front-widget': 'uid-front-widget',
      'fields-widget': 'uid-fields-widget',
    });
    expect(local.universalIdentifiersByApplicationId.app).toEqual([
      'uid-widget',
      'uid-front-widget',
      'uid-fields-widget',
    ]);
  });

  it('starts all seven reads before the first scoped read resolves', async () => {
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstRead = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pinned = fixture(rows(), {
      entity: PageLayoutWidgetEntity,
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

  it('reprojects changed owner, widget, tab, object, field, front-component and view UIDs without mutating the first map', async () => {
    const state = rows();
    const pinned = fixture(state);
    const provider = service(fixture(new Map()).manager);
    const first = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    state.get(PageLayoutWidgetEntity)![0] = widget('widget', {
      universalIdentifier: 'uid-widget-v2',
      applicationId: 'new-app',
      pageLayoutTabId: 'other-tab',
      objectMetadataId: 'new-object',
      configuration: {
        configurationType: WidgetConfigurationType.FIELD,
        fieldMetadataId: 'new-field',
        fieldDisplayMode: FieldDisplayMode.FIELD,
        viewId: 'new-view',
      },
      overrides: { title: 'Next title', pageLayoutTabId: 'other-tab' },
      deletedAt,
    });
    state.get(PageLayoutWidgetEntity)![1] = widget('front-widget', {
      type: WidgetType.FRONT_COMPONENT,
      configuration: {
        configurationType: WidgetConfigurationType.FRONT_COMPONENT,
        frontComponentId: 'new-front',
      },
      objectMetadataId: null,
      overrides: null,
    });
    state.get(PageLayoutWidgetEntity)![2] = widget('fields-widget', {
      type: WidgetType.FIELDS,
      configuration: {
        configurationType: WidgetConfigurationType.FIELDS,
        viewId: 'new-view',
        newFieldDefaultVisibility: true,
      },
    });
    state.get(ApplicationEntity)!.push(row('new-app'));
    state.get(PageLayoutTabEntity)![1].universalIdentifier = 'uid-other-tab-v2';
    state.get(ObjectMetadataEntity)!.push(row('new-object'));
    state.get(FieldMetadataEntity)!.push(row('new-field'));
    state.get(FrontComponentEntity)!.push(row('new-front'));
    state.get(ViewEntity)!.push(row('new-view'));
    const second = await provider.computeFromManager(
      workspaceId,
      pinned.manager,
    );
    expect(second.byUniversalIdentifier['uid-widget']).toBeUndefined();
    expect(second.byUniversalIdentifier['uid-widget-v2']).toMatchObject({
      applicationUniversalIdentifier: 'uid-new-app',
      pageLayoutTabUniversalIdentifier: 'uid-other-tab-v2',
      objectMetadataUniversalIdentifier: 'uid-new-object',
      universalConfiguration: {
        fieldMetadataId: 'uid-new-field',
        viewId: 'uid-new-view',
      },
      universalOverrides: {
        title: 'Next title',
        pageLayoutTabUniversalIdentifier: 'uid-other-tab-v2',
      },
    });
    expect(second.byUniversalIdentifier['uid-front-widget']).toMatchObject({
      universalConfiguration: {
        frontComponentUniversalIdentifier: 'uid-new-front',
      },
    });
    expect(second.byUniversalIdentifier['uid-fields-widget']).toMatchObject({
      universalConfiguration: { viewUniversalIdentifier: 'uid-new-view' },
    });
    expect(second.universalIdentifierById.widget).toBe('uid-widget-v2');
    expect(second.universalIdentifiersByApplicationId).toEqual({
      'new-app': ['uid-widget-v2'],
      app: ['uid-front-widget', 'uid-fields-widget'],
    });
    expect(first.byUniversalIdentifier['uid-widget']).toMatchObject({
      applicationUniversalIdentifier: 'uid-app',
      pageLayoutTabUniversalIdentifier: 'uid-tab',
      objectMetadataUniversalIdentifier: 'uid-object',
      universalConfiguration: {
        fieldMetadataId: 'uid-field',
        viewId: 'uid-view',
      },
      universalOverrides: { pageLayoutTabUniversalIdentifier: 'uid-tab' },
    });
    expect(first.byUniversalIdentifier['uid-front-widget']).toMatchObject({
      universalConfiguration: {
        frontComponentUniversalIdentifier: 'uid-front',
      },
    });
    expect(first.universalIdentifierById.widget).toBe('uid-widget');
    expect(first.universalIdentifiersByApplicationId.app).toEqual([
      'uid-widget',
      'uid-front-widget',
      'uid-fields-widget',
    ]);
  });

  it('excludes workspace B from all seven reads and retains only real soft-deleted rows', async () => {
    const state = rows();
    for (const entity of entities) {
      state.get(entity)!.push(
        row(`other-${entity.name}`, {
          workspaceId: 'workspace-B',
        }),
      );
    }
    state.get(PageLayoutWidgetEntity)!.push(
      widget('other-widget', {
        workspaceId: 'workspace-B',
        applicationId: 'other-application',
      }),
    );
    const result = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(Object.keys(result.byUniversalIdentifier)).toEqual([
      'uid-widget',
      'uid-front-widget',
      'uid-fields-widget',
    ]);
    expect(result.byUniversalIdentifier['uid-widget']).toMatchObject({
      deletedAt: deletedAt.toISOString(),
      applicationUniversalIdentifier: 'uid-app',
      pageLayoutTabUniversalIdentifier: 'uid-tab',
      universalConfiguration: { viewId: 'uid-view' },
    });
  });

  it.each(['application', 'tab', 'object'] as const)(
    'preserves missing required %s relation errors',
    async (missing) => {
      const state = rows();
      const target = state.get(PageLayoutWidgetEntity)![0];
      if (missing === 'application') target.applicationId = 'missing';
      if (missing === 'tab') target.pageLayoutTabId = 'missing';
      if (missing === 'object') target.objectMetadataId = 'missing';
      await expect(
        service(fixture(new Map()).manager).computeFromManager(
          workspaceId,
          fixture(state).manager,
        ),
      ).rejects.toThrow(/not found/);
    },
  );

  it('keeps the converter’s nullable missing serialized identifier behavior', async () => {
    const state = rows();
    const target = state.get(PageLayoutWidgetEntity)![0];
    target.configuration = {
      configurationType: WidgetConfigurationType.FIELD,
      fieldMetadataId: 'missing',
      fieldDisplayMode: FieldDisplayMode.FIELD,
      viewId: 'missing',
    };
    target.overrides = { pageLayoutTabId: 'missing' };
    const result = await service(fixture(new Map()).manager).computeFromManager(
      workspaceId,
      fixture(state).manager,
    );
    expect(result.byUniversalIdentifier['uid-widget']).toMatchObject({
      universalConfiguration: { fieldMetadataId: 'missing' },
      universalOverrides: { pageLayoutTabUniversalIdentifier: null },
    });
    expect(
      result.byUniversalIdentifier['uid-widget']?.universalConfiguration,
    ).toEqual(expect.objectContaining({ viewId: undefined }));
  });

  it('rejects duplicate widget UIDs and returns fresh empty maps', async () => {
    const state = rows();
    state.get(PageLayoutWidgetEntity)![1].universalIdentifier = 'uid-widget';
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
    expect(empty).not.toBe(
      await provider.computeFromManager(
        workspaceId,
        fixture(new Map()).manager,
      ),
    );
  });

  it('rejects invalid workspace before acquiring any repository or starting direct reads', async () => {
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
});
