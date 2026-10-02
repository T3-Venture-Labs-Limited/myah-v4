import { Command } from 'nest-commander';
import type { QueryRunner } from 'typeorm';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { PinnedWorkspaceMetadataSnapshotLoaderService } from 'src/database/commands/upgrade-version-command/2-20/services/pinned-workspace-metadata-snapshot-loader.service';
import {
  assertStandardBrandBrainRetirementNativeActions,
  assertStandardBrandBrainRetirementPersisted,
  buildStandardBrandBrainRetirementPlan,
  LEGACY_BRAND_BRAIN_APPLICATION_UID,
} from 'src/database/commands/upgrade-version-command/2-20/services/retire-legacy-brand-brain-owner.service';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { MetadataEventEmitter } from 'src/engine/subscriptions/metadata-event/metadata-event-emitter';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';
import { type UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { type SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

export const RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS = new Set<string>(
  [
    MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
    MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
    MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
  ],
);

// Historical IDs are recognition anchors only; they are never used as delete selectors.
export const RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS = {
  navigationMenuItem: new Set(['43f7a291-b0a4-481d-a5e4-b557e1a8f65d']),
  pageLayout: new Set(['c8e159f8-1815-4138-9203-c29f59703386']),
  pageLayoutTab: new Set([
    '221532a5-ac54-4a46-ae75-88e095f4633f',
    '74e295f0-ea2e-4c47-b1b4-6d9a77f8ebc9',
    '14a3d605-51dc-4197-99b6-1f8415316ac1',
  ]),
  pageLayoutWidget: new Set([
    'ca066d67-d7a5-4951-9674-8a25d5710387',
    '10aef0fb-a7dd-49d2-b818-5f167ba29091',
    '8c7fb069-9866-4333-895b-5e5ad5d2d835',
  ]),
} as const;

// Do not use the shared flat maps here: the ordered receipt and this proof must
// observe the same uncommitted PostgreSQL transaction, including deleted rows.
const REQUIRED_PHYSICAL_TABLES = [
  'application',
  'objectMetadata',
  'fieldMetadata',
  'indexMetadata',
  'searchFieldMetadata',
  'role',
  'roleTarget',
  'objectPermission',
  'fieldPermission',
  'view',
  'viewField',
  'viewFilter',
  'viewSort',
  'viewGroup',
  'navigationMenuItem',
  'pageLayout',
  'pageLayoutTab',
  'pageLayoutWidget',
] as const;
const LEGACY_BRAND_BRAIN_ROLE_UID = '8563f1a9-4e02-408a-a5d7-45f68779023a';
// The historical object definitions also pin field/index/view and view-child
// UIDs. An orphan soft-deleted dependency still makes the workspace nonempty.
const collectHistoricalUids = (value: unknown): string[] => {
  if (typeof value === 'string')
    return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
      ? [value]
      : [];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(collectHistoricalUids);
};
const RETIRED_IDENTIFIERS = [
  ...collectHistoricalUids(MYAH_STANDARD_OBJECTS.brandBrainPage),
  ...collectHistoricalUids(MYAH_STANDARD_OBJECTS.brandBrainLink),
  ...collectHistoricalUids(MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal),
  LEGACY_BRAND_BRAIN_APPLICATION_UID,
  LEGACY_BRAND_BRAIN_ROLE_UID,
  ...RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS,
  ...Object.values(
    RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
  ).flatMap((identifiers) => [...identifiers]),
];

const reject = (reason: string): never => {
  throw new Error(`Unsafe Brand Brain presentation: ${reason}`);
};

const readVerifiedPhysicalCatalog = async (runner: QueryRunner) => {
  const catalog = (await runner.query(
    `SELECT c.relname AS table_name, array_agg(a.attname::text ORDER BY a.attname)::text[] AS columns
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'core' AND c.relkind IN ('r', 'p')
     GROUP BY c.relname`,
  )) as { table_name: unknown; columns: unknown }[];
  if (
    !Array.isArray(catalog) ||
    catalog.some(
      ({ table_name, columns }) =>
        typeof table_name !== 'string' ||
        !Array.isArray(columns) ||
        columns.length === 0 ||
        columns.some((column) => typeof column !== 'string'),
    )
  )
    reject('unexpected catalog columns');
  const byTable = new Map(
    catalog.map(({ table_name, columns }) => [
      table_name as string,
      new Set(columns as string[]),
    ]),
  );
  for (const table of REQUIRED_PHYSICAL_TABLES) {
    const columns = byTable.get(table);
    if (
      !columns ||
      ![
        'id',
        'workspaceId',
        'universalIdentifier',
        ...(table === 'application' ? [] : ['applicationId']),
      ].every((name) => columns.has(name))
    )
      reject(`incomplete physical metadata table ${table}`);
  }
  const applicationColumns = byTable.get('application');
  if (
    !applicationColumns?.has('deletedAt') ||
    !applicationColumns.has('name') ||
    !byTable.get('objectMetadata')?.has('nameSingular') ||
    !byTable.get('objectMetadata')?.has('namePlural')
  )
    reject('unknown application/object schema version');
  return byTable;
};

const pair = <T extends SyncableFlatEntity & { deletedAt: string | null }>(
  rows: T[],
  retiredAt: string,
) => {
  const collect = (values: T[]): FlatEntityMaps<T> =>
    values.reduce(
      (maps, flatEntity) =>
        addFlatEntityToFlatEntityMapsOrThrow({
          flatEntityMaps: maps,
          flatEntity,
        }),
      createEmptyFlatEntityMaps(),
    );
  return {
    from: collect(rows),
    to: collect(
      rows.map((row) => ({ ...row, deletedAt: row.deletedAt ?? retiredAt })),
    ),
  };
};

@RegisteredWorkspaceCommand('2.20.0', 1790000000410)
@Command({
  name: 'upgrade:2-20:retire-brand-brain-metadata',
  description: 'Preflight recoverable Brand Brain presentation retirement',
})
export class RetireBrandBrainMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly standardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly validator: WorkspaceMigrationValidateBuildAndRunService,
    private readonly pinnedSnapshotLoader: PinnedWorkspaceMetadataSnapshotLoaderService,
    private readonly migrationRunner: WorkspaceMigrationRunnerService,
    private readonly metadataEventEmitter: MetadataEventEmitter,
    private readonly metadataVersion: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  // The outer runner writes the completed receipt and commits on this same runner.
  override async runOnWorkspaceInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    runner: QueryRunner,
    afterCommit?: UpgradeWorkspaceTransaction['afterCommit'],
  ): Promise<void> {
    if (args.options.dryRun || !runner.isTransactionActive || runner.isReleased)
      reject('pinned active upgrade transaction required');

    const [workspace] = (await runner.query(
      'SELECT "databaseSchema" FROM "core"."workspace" WHERE "id" = $1',
      [args.workspaceId],
    )) as { databaseSchema: string | null }[];
    if (
      !workspace ||
      typeof workspace.databaseSchema !== 'string' ||
      workspace.databaseSchema !== getWorkspaceSchemaName(args.workspaceId)
    )
      reject('unknown workspace schema');

    const [schema] = (await runner.query(
      'SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS "exists"',
      [workspace.databaseSchema],
    )) as { exists: boolean }[];
    if (schema?.exists !== true) reject('workspace schema absent');

    // Both the active-graph and verified-empty branches require known physical
    // metadata columns before attempting an owner transition.
    const byTable = await readVerifiedPhysicalCatalog(runner);
    // Orphan physical record tables are not a verified-empty installation.
    const physicalObjects = (await runner.query(
      `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
       AND lower(c.relname) IN ('brandbrainpage', 'brandbrainlink', 'brandbrainupdateproposal')`,
      [workspace.databaseSchema],
    )) as { relname: string }[];
    if (physicalObjects.length) {
      const commit =
        afterCommit ?? reject('missing committed-upgrade callback');
      const snapshot = await this.pinnedSnapshotLoader.load(
        args.workspaceId,
        runner,
      );
      // The pinned loader includes all custom indexes; the planner only reads
      // the ordinary UID-indexed flat-map view.
      const maps = snapshot.allFlatEntityMaps as unknown as AllFlatEntityMaps;
      const applicationId =
        snapshot.flatApplicationMaps.idByUniversalIdentifier[
          TWENTY_STANDARD_APPLICATION.universalIdentifier
        ] ?? reject('missing Standard owner');
      const installed = [
        ...RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS,
      ].map((uid) => maps.flatObjectMetadataMaps.byUniversalIdentifier[uid]);
      if (installed.some((row) => row?.applicationId === applicationId)) {
        if (
          snapshot.flatApplicationMaps.idByUniversalIdentifier[
            LEGACY_BRAND_BRAIN_APPLICATION_UID
          ] ||
          installed.some((row) => !row || row.applicationId !== applicationId)
        )
          reject('mixed owner or incomplete Standard graph');
        const plan =
          buildStandardBrandBrainRetirementPlan({
            applications: snapshot.flatApplicationMaps,
            workspaceDefaultRoleId: snapshot.workspace.defaultRoleId,
            maps,
            additionalCacheDataMaps: {
              featureFlagsMap: snapshot.featureFlagsMap,
            },
            retiredAt: new Date(),
            workspaceId: args.workspaceId,
          }) ?? reject('missing Standard retirement graph');
        const transaction: UpgradeWorkspaceTransaction = {
          queryRunner: runner,
          afterCommit: commit,
        };
        const result =
          await this.validator.validateBuildAndRunWorkspaceMigrationFromTo({
            ...plan,
            dryRun: true,
            upgradeTransaction: transaction,
            pinnedSnapshot: snapshot,
          });
        const migration =
          result.status === 'success'
            ? result.workspaceMigration
            : reject('native Standard retirement validation failed');
        const { roleId, makeNonEditable } =
          assertStandardBrandBrainRetirementNativeActions({
            plan,
            migration,
            standardApplicationId: applicationId,
          });
        // Lock and verify the exact Standard-owned role before any native write.
        // isEditable is non-comparable: the native runner always strips it.
        const lockedRoles = (await runner.query(
          `SELECT "id", "applicationId", "isEditable" FROM "core"."role"
           WHERE "workspaceId" = $1 AND "universalIdentifier" = $2 FOR UPDATE`,
          [args.workspaceId, LEGACY_BRAND_BRAIN_ROLE_UID],
        )) as { id: string; applicationId: string; isEditable: boolean }[];
        const lockedRole = lockedRoles[0];
        if (
          lockedRoles.length !== 1 ||
          lockedRole.id !== roleId ||
          lockedRole.applicationId !== applicationId ||
          lockedRole.isEditable !== makeNonEditable
        )
          reject(
            'Standard role pinned identity, owner or editability mismatch',
          );
        const { metadataEvents, hasSchemaMetadataChanged } =
          await this.migrationRunner.run({
            workspaceId: args.workspaceId,
            workspaceMigration: migration,
            upgradeTransaction: transaction,
            pinnedSnapshot: snapshot,
          });
        if (makeNonEditable) {
          // Exception approved for this pinned, owner/ID/old-value-checked row
          // only. The native action still handles every comparable role field.
          // TypeORM's PostgresQueryRunner returns [rows, rowCount] for UPDATE.
          const [changed, affected] = (await runner.query(
            `UPDATE "core"."role" SET "isEditable" = false, "updatedAt" = NOW()
             WHERE "workspaceId" = $1 AND "id" = $2 AND "applicationId" = $3
               AND "universalIdentifier" = $4 AND "isEditable" = true
             RETURNING "id"`,
            [
              args.workspaceId,
              roleId,
              applicationId,
              LEGACY_BRAND_BRAIN_ROLE_UID,
            ],
          )) as [{ id: string }[], number];
          if (
            affected !== 1 ||
            changed.length !== 1 ||
            changed[0].id !== roleId
          )
            reject('Standard role pinned editability write mismatch');
          if (!hasSchemaMetadataChanged)
            await this.metadataVersion.incrementMetadataVersion(
              args.workspaceId,
              transaction,
            );
        }
        // Re-read inside this transaction: the receipt must not commit for a
        // partially applied or differently owned result.
        const persisted = await this.pinnedSnapshotLoader.load(
          args.workspaceId,
          runner,
        );
        assertStandardBrandBrainRetirementPersisted({
          before: maps,
          after: persisted.allFlatEntityMaps as unknown as AllFlatEntityMaps,
          plan,
        });
        commit(() => this.reconcileCommittedUpgrade(args.workspaceId));
        commit(() =>
          this.metadataEventEmitter.emitMetadataEventsAsync({
            workspaceId: args.workspaceId,
            metadataEvents,
          }),
        );
        return;
      }
      reject('retired physical record table remains');
    }

    // Inventory every workspace-scoped application-owned/UID metadata table,
    // not only the current flattened-map keys. Quoting is safe: these names
    // are physical PostgreSQL catalog identifiers, not caller input.
    const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
    const ids = RETIRED_IDENTIFIERS;
    for (const [table, columns] of byTable) {
      if (
        !columns.has('workspaceId') ||
        (!columns.has('applicationId') && !columns.has('universalIdentifier'))
      )
        continue;
      const parameters: unknown[] = [args.workspaceId];
      const predicates: string[] = [];
      if (columns.has('universalIdentifier')) {
        parameters.push(ids);
        predicates.push(
          `t."universalIdentifier"::text = ANY($${parameters.length}::text[])`,
        );
      }
      if (columns.has('applicationId')) {
        parameters.push(LEGACY_BRAND_BRAIN_APPLICATION_UID);
        predicates.push(`t."applicationId"::text = $${parameters.length}`);
      }
      predicates.push(
        ...(table === 'application'
          ? ['lower(t."name") = \'brand brain\'']
          : []),
        ...(table === 'objectMetadata'
          ? [
              `lower(t."nameSingular") IN ('brandbrainpage', 'brandbrainlink', 'brandbrainupdateproposal')`,
              `lower(t."namePlural") IN ('brandbrainpages', 'brandbrainlinks', 'brandbrainupdateproposals')`,
            ]
          : []),
        // Physical references can survive when the referenced owner/object row
        // has been removed. Match identifiers in JSON/config and soft-deleted rows.
        // Includes arbitrary JSON/text dependency references and deleted rows;
        // never infer emptiness from just a universalIdentifier lookup.
        `EXISTS (SELECT 1 FROM unnest($${parameters.length + 1}::text[]) uid WHERE to_jsonb(t)::text ILIKE '%' || uid || '%')`,
      );
      parameters.push(ids);
      // Table comes from pg_catalog; quote escapes its identifier. All values are bound.
      const inventoryProbe = `SELECT t."id" FROM "core".${quote(table)} t WHERE t."workspaceId" = $1
         AND (${predicates.join(' OR ')}) LIMIT 1`;
      const found = (await runner.query(inventoryProbe, parameters)) as {
        id: string;
      }[];
      if (found.length)
        reject(`retired owner, object, presentation or reference in ${table}`);
    }
    afterCommit?.(() => this.reconcileCommittedUpgrade(args.workspaceId));
  }

  // A completed receipt proves PostgreSQL committed, not that Redis callbacks ran.
  // Repeat safely on every locked resume, including a zero-action retirement.
  async reconcileCommittedUpgrade(workspaceId: string): Promise<void> {
    await this.workspaceCacheService.flush(workspaceId, [
      ...ALL_FLAT_ENTITY_MAPS_PROPERTIES,
      'flatApplicationMaps',
      'featureFlagsMap',
    ]);
    await this.metadataVersion.publishCommittedMetadataVersion(workspaceId);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    // Neither owner has an approved apply/cache-proof path. Check before any metadata write.
    if (args.options.dryRun !== true)
      reject('read-only until separately approved apply exists');
    if (
      !(await this.standardMetadataCommand.workspaceSchemaExists(
        args.workspaceId,
      ))
    )
      return;

    const { twentyStandardFlatApplication: standardApp } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId: args.workspaceId },
      );
    const cached = await this.workspaceCacheService.getOrRecompute(
      args.workspaceId,
      [
        'flatApplicationMaps',
        'flatObjectMetadataMaps',
        'flatViewMaps',
        'flatPageLayoutMaps',
        'flatPageLayoutTabMaps',
        'flatPageLayoutWidgetMaps',
        'featureFlagsMap',
      ],
    );
    const apps = cached.flatApplicationMaps;
    const oldAppId =
      apps.idByUniversalIdentifier[LEGACY_BRAND_BRAIN_APPLICATION_UID];
    const oldApp = oldAppId && apps.byId[oldAppId];
    if (
      oldAppId &&
      (!oldApp ||
        oldApp.universalIdentifier !== LEGACY_BRAND_BRAIN_APPLICATION_UID)
    )
      reject('unknown old application owner');
    const objects = Object.values(
      cached.flatObjectMetadataMaps.byUniversalIdentifier,
    ).filter(
      (object) =>
        object &&
        RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS.has(
          object.universalIdentifier,
        ),
    );
    if (
      objects.some(
        (object) => object!.applicationId !== (oldAppId ?? standardApp.id),
      )
    )
      reject('mixed or unknown object owner');
    if (oldApp) {
      // 2001 already runs both the old-owner and standard-owner original native validators.
      await this.standardMetadataCommand.synchronizeWorkspace(args);
      return;
    }
    if (objects.length === 0) return;

    const objectIds = new Set(objects.map((object) => object!.id));
    const allLayouts = Object.values(
      cached.flatPageLayoutMaps.byUniversalIdentifier,
    ).filter((row) => row !== undefined);
    const allTabs = Object.values(
      cached.flatPageLayoutTabMaps.byUniversalIdentifier,
    ).filter((row) => row !== undefined);
    const allWidgets = Object.values(
      cached.flatPageLayoutWidgetMaps.byUniversalIdentifier,
    ).filter((row) => row !== undefined);
    const layouts = allLayouts.filter(
      (row) => row.objectMetadataId && objectIds.has(row.objectMetadataId),
    );
    if (!layouts.length) return;
    const layoutIds = new Set(layouts.map((row) => row.id));
    const tabs = allTabs.filter((row) => layoutIds.has(row.pageLayoutId));
    const tabIds = new Set(tabs.map((row) => row.id));
    const widgets = allWidgets.filter((row) => tabIds.has(row.pageLayoutTabId));
    if (
      [...layouts, ...tabs, ...widgets].some(
        (row) => row.applicationId !== standardApp.id,
      )
    )
      reject('shared or foreign presentation owner');
    const overrideTab = (widget: (typeof allWidgets)[number]) =>
      widget.overrides && typeof widget.overrides === 'object'
        ? (widget.overrides as { pageLayoutTabId?: string }).pageLayoutTabId
        : undefined;
    if (
      allWidgets.some((widget) => {
        const override = overrideTab(widget);
        return (
          (tabIds.has(widget.pageLayoutTabId) &&
            override &&
            !tabIds.has(override)) ||
          (!tabIds.has(widget.pageLayoutTabId) &&
            override &&
            tabIds.has(override))
        );
      })
    )
      reject('shared widget override ancestry');
    if (
      widgets.some(
        (widget) =>
          widget.objectMetadataId && !objectIds.has(widget.objectMetadataId),
      ) ||
      allWidgets.some(
        (widget) =>
          !tabIds.has(widget.pageLayoutTabId) &&
          widget.objectMetadataId &&
          objectIds.has(widget.objectMetadataId),
      )
    )
      reject('shared retained-object widget');
    if (
      allLayouts.some(
        (layout) =>
          !layoutIds.has(layout.id) &&
          layout.defaultTabToFocusOnMobileAndSidePanelId &&
          tabIds.has(layout.defaultTabToFocusOnMobileAndSidePanelId),
      )
    )
      reject('shared default tab');
    const views = Object.values(
      cached.flatViewMaps.byUniversalIdentifier,
    ).filter((view) => view && objectIds.has(view.objectMetadataId));
    const viewIds = new Set(views.map((view) => view!.id));
    const viewUids = new Set(views.map((view) => view!.universalIdentifier));
    const references = (widget: (typeof allWidgets)[number]) => {
      const config = widget.universalConfiguration;
      if (!config || typeof config !== 'object') return [];
      const { viewId, viewUniversalIdentifier } = config as {
        viewId?: string;
        viewUniversalIdentifier?: string;
      };
      return [viewId, viewUniversalIdentifier].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );
    };
    if (
      widgets.some((widget) =>
        references(widget).some((id) => !viewIds.has(id) && !viewUids.has(id)),
      ) ||
      allWidgets.some(
        (widget) =>
          !tabIds.has(widget.pageLayoutTabId) &&
          references(widget).some((id) => viewIds.has(id) || viewUids.has(id)),
      )
    )
      reject('shared view dependency');

    const retiredAt = new Date().toISOString();
    const fromToAllFlatEntityMaps = {
      flatPageLayoutMaps: pair(layouts, retiredAt),
      flatPageLayoutTabMaps: pair(tabs, retiredAt),
      flatPageLayoutWidgetMaps: pair(widgets, retiredAt),
    };
    const result =
      await this.validator.validateBuildAndRunWorkspaceMigrationFromTo({
        workspaceId: args.workspaceId,
        buildOptions: {
          applicationUniversalIdentifier: standardApp.universalIdentifier,
          inferDeletionFromMissingEntities: {},
          isSystemBuild: true,
        },
        fromToAllFlatEntityMaps,
        dependencyAllFlatEntityMaps: cached,
        additionalCacheDataMaps: { featureFlagsMap: cached.featureFlagsMap },
        dryRun: true,
      });
    const allowed = new Map<
      string,
      { applicationId: string; before: string | null; after: string | null }
    >();
    for (const [from, to] of [
      [
        layouts,
        fromToAllFlatEntityMaps.flatPageLayoutMaps.to.byUniversalIdentifier,
      ],
      [
        tabs,
        fromToAllFlatEntityMaps.flatPageLayoutTabMaps.to.byUniversalIdentifier,
      ],
      [
        widgets,
        fromToAllFlatEntityMaps.flatPageLayoutWidgetMaps.to
          .byUniversalIdentifier,
      ],
    ] as const) {
      for (const row of from)
        allowed.set(row.universalIdentifier, {
          applicationId: row.applicationId,
          before: row.deletedAt,
          after: to[row.universalIdentifier]?.deletedAt ?? null,
        });
    }
    const expectedUpdates = new Set(
      [...layouts, ...tabs, ...widgets]
        .filter((row) => row.deletedAt === null)
        .map((row) => row.universalIdentifier),
    );
    const observedUpdates = new Set(
      result.status === 'success'
        ? result.workspaceMigration.actions.map((action) =>
            action.type === 'update' ? action.universalIdentifier : '',
          )
        : [],
    );
    if (
      result.status !== 'success' ||
      observedUpdates.size !== expectedUpdates.size ||
      result.workspaceMigration?.applicationUniversalIdentifier !==
        standardApp.universalIdentifier ||
      !Array.isArray(result.workspaceMigration.actions) ||
      result.workspaceMigration.actions.length !== expectedUpdates.size ||
      result.workspaceMigration.actions.some((action) => {
        if (
          action.type !== 'update' ||
          !['pageLayout', 'pageLayoutTab', 'pageLayoutWidget'].includes(
            action.metadataName,
          )
        )
          return true;
        const selected = allowed.get(action.universalIdentifier);
        const updates = Object.entries(action.update);
        return (
          !selected ||
          !expectedUpdates.has(action.universalIdentifier) ||
          selected.applicationId !== standardApp.id ||
          updates.length !== 1 ||
          updates[0][0] !== 'deletedAt' ||
          updates[0][1] !== selected.after ||
          (selected.before !== null && updates[0][1] !== selected.before)
        );
      })
    )
      reject('native plan includes an unrelated or non-soft-update action');
  }
}
