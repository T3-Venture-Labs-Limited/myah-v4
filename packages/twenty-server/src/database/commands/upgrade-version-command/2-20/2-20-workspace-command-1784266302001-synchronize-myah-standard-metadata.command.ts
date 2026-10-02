import { createHash } from 'node:crypto';

import { isNonEmptyString } from '@sniptt/guards';
import { Command } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { In, type DataSource, type QueryRunner } from 'typeorm';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';
import { PinnedWorkspaceMetadataSnapshotLoaderService } from 'src/database/commands/upgrade-version-command/2-20/services/pinned-workspace-metadata-snapshot-loader.service';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

import { buildFromToAllUniversalFlatEntityMaps } from 'src/engine/core-modules/application/application-manifest/utils/build-from-to-all-universal-flat-entity-maps.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import type { SyncableFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-from.type';
import type { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import type { FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';

import { getSubFlatEntityMapsByUniversalIdentifiersOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/get-sub-flat-entity-maps-by-universal-identifiers-or-throw.util';
import { pruneDanglingForeignKeyAggregatorsInAllFlatEntityMapsThroughMutation } from 'src/engine/metadata-modules/flat-entity/utils/prune-dangling-foreign-key-aggregators-in-all-flat-entity-maps-through-mutation.util';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { ALL_METADATA_ENTITY_BY_METADATA_NAME } from 'src/engine/metadata-modules/flat-entity/constant/all-metadata-entity-by-metadata-name.constant';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { PageLayoutType } from 'src/engine/metadata-modules/page-layout/enums/page-layout-type.enum';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import type { TwentyStandardAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/types/twenty-standard-all-flat-entity-maps.type';
import { getReplacedTwentyCrmMetadataUniversalIdentifiers } from 'src/engine/workspace-manager/twenty-standard-application/utils/remove-replaced-twenty-crm-metadata.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import type {
  AdditionalCacheDataMaps,
  WorkspaceCacheKeyName,
} from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import {
  RetireLegacyBrandBrainOwnerService,
  LEGACY_BRAND_BRAIN_APPLICATION_UID,
} from 'src/database/commands/upgrade-version-command/2-20/services/retire-legacy-brand-brain-owner.service';
import { projectLegacyBrandBrainStandardTarget } from 'src/engine/workspace-manager/twenty-standard-application/utils/project-legacy-brand-brain-standard-target.util';
import { OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';

const MYAH_ROLE_UNIVERSAL_IDENTIFIERS = new Set<string>([
  STANDARD_ROLE.brandBrainAdmin.universalIdentifier,
  STANDARD_ROLE.creatorOpsDefault.universalIdentifier,
]);

const LEGACY_MYAH_APPLICATION_UNIVERSAL_IDENTIFIERS = [
  '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991',
  '72f2fd16-880c-4c63-852f-dbf63f51c152',
] as const;

type UniversalMetadataEntity = {
  universalIdentifier: string;
  applicationId?: string;
  objectMetadataUniversalIdentifier?: string | null;
  relationTargetObjectMetadataUniversalIdentifier?: string | null;
  relationTargetFieldMetadataUniversalIdentifier?: string | null;
  fieldMetadataUniversalIdentifier?: string | null;
  viewUniversalIdentifier?: string | null;
  pageLayoutUniversalIdentifier?: string | null;
  pageLayoutTabUniversalIdentifier?: string | null;
  targetObjectMetadataUniversalIdentifier?: string | null;
  universalFlatIndexFieldMetadatas?: {
    fieldMetadataUniversalIdentifier: string;
  }[];
  roleUniversalIdentifier?: string | null;
  universalConfiguration?: {
    viewUniversalIdentifier?: string | null;
    viewId?: string | null;
  };
};

const getUniversalMetadataEntities = (
  byUniversalIdentifier: unknown,
): UniversalMetadataEntity[] =>
  Object.values(
    byUniversalIdentifier as Partial<Record<string, UniversalMetadataEntity>>,
  ).filter(isDefined);

const toUniversalIdentifiers = (entities: readonly UniversalMetadataEntity[]) =>
  new Set(entities.map(({ universalIdentifier }) => universalIdentifier));

type SyncableFlatEntityMaps = FlatEntityMaps<SyncableFlatEntity>;
type TwentyStandardMetadataName =
  (typeof TWENTY_STANDARD_ALL_METADATA_NAME)[number];

const withoutCacheDerivedFieldMetadataProperties = <
  T extends FlatEntityMaps<FlatFieldMetadata>,
>(
  flatFieldMetadataMaps: T,
): T => {
  const sanitizedFlatFieldMetadataMaps = structuredClone(flatFieldMetadataMaps);

  for (const flatFieldMetadata of Object.values(
    sanitizedFlatFieldMetadataMaps.byUniversalIdentifier,
  ).filter(isDefined)) {
    Reflect.deleteProperty(flatFieldMetadata, 'isUnique');
  }

  return sanitizedFlatFieldMetadataMaps;
};

type FlatEntityMapsWithIndexes = {
  byUniversalIdentifier: Record<
    string,
    (SyncableFlatEntity & { [key: string]: unknown }) | undefined
  >;
  universalIdentifierById: Record<string, string | undefined>;
  universalIdentifiersByApplicationId: Record<string, string[] | undefined>;
};

const rebuildFlatEntityMapIndexes = (
  flatEntityMaps: FlatEntityMapsWithIndexes,
) => {
  flatEntityMaps.universalIdentifierById = {};
  flatEntityMaps.universalIdentifiersByApplicationId = {};

  for (const entity of Object.values(
    flatEntityMaps.byUniversalIdentifier,
  ).filter(isDefined)) {
    flatEntityMaps.universalIdentifierById[entity.id] =
      entity.universalIdentifier;
    if (isDefined(entity.applicationId)) {
      (flatEntityMaps.universalIdentifiersByApplicationId[
        entity.applicationId
      ] ??= []).push(entity.universalIdentifier);
    }
  }
};

const overlayExistingRetirementClosure = ({
  fromAllFlatEntityMaps,
  fromMyahFlatEntityMaps,
  toAllFlatEntityMaps,
  idByUniversalIdentifierByMetadataName,
  standardApplicationId,
}: {
  fromAllFlatEntityMaps: TwentyStandardAllFlatEntityMaps;
  fromMyahFlatEntityMaps: TwentyStandardAllFlatEntityMaps;
  toAllFlatEntityMaps: TwentyStandardAllFlatEntityMaps;
  idByUniversalIdentifierByMetadataName: Record<string, Record<string, string>>;
  standardApplicationId: string;
}) => {
  const retained = getReplacedTwentyCrmMetadataUniversalIdentifiers(
    fromAllFlatEntityMaps,
  );
  // SAFETY: all flat metadata maps have the same three index maps; only layout-specific fields are read below.
  const sourceLayoutMaps =
    fromAllFlatEntityMaps.flatPageLayoutMaps as unknown as FlatEntityMapsWithIndexes;
  // SAFETY: all flat metadata maps have the same three index maps; only tab-specific fields are read below.
  const sourceTabMaps =
    fromAllFlatEntityMaps.flatPageLayoutTabMaps as unknown as FlatEntityMapsWithIndexes;
  // SAFETY: all flat metadata maps have the same three index maps; only widget-specific fields are read below.
  const sourceWidgetMaps =
    fromAllFlatEntityMaps.flatPageLayoutWidgetMaps as unknown as FlatEntityMapsWithIndexes;
  const dashboardLayoutIds = new Set(
    Object.values(sourceLayoutMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter((layout) => layout.applicationId === standardApplicationId && layout.type === PageLayoutType.DASHBOARD)
      .map((layout) => layout.id),
  );
  const dashboardTabIds = new Set(
    Object.values(sourceTabMaps.byUniversalIdentifier)
      .filter(isDefined)
      .filter((tab) => tab.applicationId === standardApplicationId)
      .filter((tab) => {
        const overrideLayoutId =
          tab.overrides && typeof tab.overrides === 'object'
            ? (tab.overrides as { pageLayoutId?: string }).pageLayoutId
            : undefined;

        return dashboardLayoutIds.has(String(tab.pageLayoutId)) ||
          (isDefined(overrideLayoutId) && dashboardLayoutIds.has(overrideLayoutId));
      })
      .map((tab) => tab.id),
  );

  retained.pageLayout ??= new Set();
  retained.pageLayoutTab ??= new Set();
  retained.pageLayoutWidget ??= new Set();
  for (const layout of Object.values(
    sourceLayoutMaps.byUniversalIdentifier,
  ).filter(isDefined)) {
    if (dashboardLayoutIds.has(layout.id))
      retained.pageLayout.add(layout.universalIdentifier);
  }
  for (const tab of Object.values(sourceTabMaps.byUniversalIdentifier).filter(
    isDefined,
  )) {
    if (dashboardTabIds.has(tab.id))
      retained.pageLayoutTab.add(tab.universalIdentifier);
  }
  for (const widget of Object.values(
    sourceWidgetMaps.byUniversalIdentifier,
  ).filter(isDefined)) {
    if (widget.applicationId !== standardApplicationId) continue;
    const overrideTabId =
      widget.overrides && typeof widget.overrides === 'object'
        ? // SAFETY: widget overrides are JSON; this reads its documented optional destination only.
          (widget.overrides as { pageLayoutTabId?: string }).pageLayoutTabId
        : undefined;
    if (
      dashboardTabIds.has(String(widget.pageLayoutTabId)) ||
      (isDefined(overrideTabId) && dashboardTabIds.has(overrideTabId))
    ) {
      retained.pageLayoutWidget.add(widget.universalIdentifier);
    }
  }

  for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
    const retainedUniversalIdentifiers = retained[metadataName];
    if (!isDefined(retainedUniversalIdentifiers)) continue;
    const key = getMetadataFlatEntityMapsKey(metadataName);
    // SAFETY: metadata-name-derived map keys index the flat-map record by construction.
    const source = (
      fromMyahFlatEntityMaps as unknown as Record<
        string,
        FlatEntityMapsWithIndexes
      >
    )[key];
    // SAFETY: metadata-name-derived map keys index the flat-map record by construction.
    const target = (
      toAllFlatEntityMaps as unknown as Record<
        string,
        FlatEntityMapsWithIndexes
      >
    )[key];
    // SAFETY: metadata-name-derived keys address the same indexed flat maps in the complete snapshot.
    const completeSource = (
      fromAllFlatEntityMaps as unknown as Record<string, FlatEntityMapsWithIndexes>
    )[key];
    for (const universalIdentifier of retainedUniversalIdentifiers) {
      let existingEntity = source.byUniversalIdentifier[universalIdentifier];
      // The selected migration source excludes arbitrary historical UIDs. Include
      // only standard-owned Dashboard closure rows in both sides of the plan.
      if (!isDefined(existingEntity) &&
        ['pageLayout', 'pageLayoutTab', 'pageLayoutWidget'].includes(metadataName)) {
        const historicalEntity = completeSource.byUniversalIdentifier[universalIdentifier];
        if (historicalEntity?.applicationId === standardApplicationId) {
          source.byUniversalIdentifier[universalIdentifier] = historicalEntity;
          existingEntity = historicalEntity;
        }
      }
      if (isDefined(existingEntity))
        target.byUniversalIdentifier[universalIdentifier] = existingEntity;
    }
    rebuildFlatEntityMapIndexes(source);
    rebuildFlatEntityMapIndexes(target);
    idByUniversalIdentifierByMetadataName[metadataName] = Object.fromEntries(
      Object.values(target.byUniversalIdentifier)
        .filter(isDefined)
        .map((entity) => [entity.universalIdentifier, entity.id]),
    );
  }
};

const CREATOR_PERMISSION_KEYS = [
  'canReadObjectRecords',
  'canUpdateObjectRecords',
  'canSoftDeleteObjectRecords',
  'canDestroyObjectRecords',
] as const;
const ROLE_OBJECT_DEFAULT_KEYS = [
  'canReadAllObjectRecords',
  'canUpdateAllObjectRecords',
  'canSoftDeleteAllObjectRecords',
  'canDestroyAllObjectRecords',
] as const;

// This import is metadata maintenance, not an authorization migration. Inspect the
// final projection before either the completeness skip or the migration runner.
const assertCreatorImportPermissionsUnchanged = (
  current: TwentyStandardAllFlatEntityMaps,
  projected: TwentyStandardAllFlatEntityMaps,
  workspaceId: string,
  applicationId: string,
  applicationUniversalIdentifier: string,
) => {
  const roleUid = STANDARD_ROLE.creatorOpsDefault.universalIdentifier;
  const objectUid = MYAH_STANDARD_OBJECTS.creator.universalIdentifier;
  const currentRole = current.flatRoleMaps.byUniversalIdentifier[roleUid];
  const currentObject =
    current.flatObjectMetadataMaps.byUniversalIdentifier[objectUid];
  const projectedRole = projected.flatRoleMaps.byUniversalIdentifier[roleUid];
  const projectedObject =
    projected.flatObjectMetadataMaps.byUniversalIdentifier[objectUid];
  const permissions = Object.values(
    projected.flatObjectPermissionMaps.byUniversalIdentifier,
  ).filter(isDefined);
  const desiredPermissions = permissions.filter(
    (permission) =>
      permission.roleUniversalIdentifier === roleUid &&
      permission.objectMetadataUniversalIdentifier === objectUid,
  );
  const [desired] = desiredPermissions;
  const fail = (): never => {
    throw new Error(
      'Unsafe Creator import: object permission or role defaults would drift',
    );
  };
  const owned = (entity: {
    workspaceId: string;
    applicationId: string;
    applicationUniversalIdentifier: string;
  }) =>
    entity.workspaceId === workspaceId &&
    entity.applicationId === applicationId &&
    entity.applicationUniversalIdentifier === applicationUniversalIdentifier;

  if (!desired || !projectedRole || !projectedObject) {
    throw new Error(
      'Unsafe Creator import: object permission or role defaults would drift',
    );
  }
  if (
    desiredPermissions.length !== 1 ||
    !owned(desired) ||
    !owned(projectedRole) ||
    !owned(projectedObject) ||
    projectedRole.universalIdentifier !== roleUid ||
    projectedObject.universalIdentifier !== objectUid ||
    desired.roleId !== projectedRole.id ||
    desired.objectMetadataId !== projectedObject.id ||
    (currentRole === undefined) !== (currentObject === undefined)
  )
    fail();

  if (currentRole && currentObject) {
    if (
      !owned(currentRole) ||
      !owned(currentObject) ||
      currentRole.universalIdentifier !== roleUid ||
      currentObject.universalIdentifier !== objectUid ||
      current.flatRoleMaps.universalIdentifierById[currentRole.id] !==
        roleUid ||
      current.flatObjectMetadataMaps.universalIdentifierById[
        currentObject.id
      ] !== objectUid ||
      currentObject.isSystem !== false ||
      projectedObject.isSystem !== currentObject.isSystem ||
      ROLE_OBJECT_DEFAULT_KEYS.some(
        (key) => currentRole[key] !== projectedRole[key],
      )
    )
      fail();
  }

  const existingPermissions = Object.values(
    current.flatObjectPermissionMaps.byUniversalIdentifier,
  ).filter(isDefined);
  if (
    existingPermissions.some(
      (permission) =>
        (!currentRole && permission.roleUniversalIdentifier === roleUid) ||
        (!currentObject &&
          permission.objectMetadataUniversalIdentifier === objectUid),
    )
  )
    fail();
  for (const permission of existingPermissions) {
    if (
      permission.universalIdentifier !== desired.universalIdentifier &&
      !(
        permission.roleUniversalIdentifier === roleUid &&
        permission.objectMetadataUniversalIdentifier === objectUid
      ) &&
      !(
        currentRole &&
        currentObject &&
        permission.roleId === currentRole.id &&
        permission.objectMetadataId === currentObject.id
      )
    )
      continue;

    if (
      permission.universalIdentifier !== desired.universalIdentifier ||
      permission.roleUniversalIdentifier !== roleUid ||
      permission.objectMetadataUniversalIdentifier !== objectUid ||
      !currentRole ||
      !currentObject ||
      !owned(permission) ||
      permission.roleId !== currentRole.id ||
      permission.objectMetadataId !== currentObject.id ||
      current.flatRoleMaps.universalIdentifierById[permission.roleId] !==
        roleUid ||
      current.flatObjectMetadataMaps.universalIdentifierById[
        permission.objectMetadataId
      ] !== objectUid
    )
      fail();
  }
  const matching = existingPermissions.filter(
    (permission) =>
      permission.universalIdentifier === desired.universalIdentifier,
  );
  if (matching.length > 1) fail();
  const existing = matching[0];
  if (existing) {
    if (
      CREATOR_PERMISSION_KEYS.some(
        (key) =>
          existing[key] === undefined ||
          desired[key] === undefined ||
          existing[key] !== desired[key],
      )
    )
      fail();
  } else if (currentRole && currentObject) {
    // With no override the existing role default is the effective permission.
    if (
      CREATOR_PERMISSION_KEYS.some(
        (key, index) =>
          desired[key] === undefined ||
          (desired[key] ?? projectedRole[ROLE_OBJECT_DEFAULT_KEYS[index]]) !==
            currentRole[ROLE_OBJECT_DEFAULT_KEYS[index]],
      )
    )
      fail();
  }
};

const LEGACY_INSTAGRAM_TABLES = [
  {
    objectUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier,
    sourceTableName: '_myahInstagramAccount',
    targetTableName: 'myahInstagramAccount',
    uniqueIndexColumns: [
      ['connectedAccountId'],
      ['igUserId'],
      ['unipileAccountId'],
    ],
  },
  {
    objectUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.myahSocialConversation.universalIdentifier,
    sourceTableName: '_myahSocialConversation',
    targetTableName: 'myahSocialConversation',
    uniqueIndexColumns: [
      ['provider', 'instagramAccountId', 'providerConversationId'],
    ],
  },
  {
    objectUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.myahSocialMessage.universalIdentifier,
    sourceTableName: '_myahSocialMessage',
    targetTableName: 'myahSocialMessage',
    uniqueIndexColumns: [
      ['provider', 'conversationId', 'providerMessageId'],
    ],
  },
  {
    objectUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft.universalIdentifier,
    sourceTableName: '_myahInstagramReplyDraft',
    targetTableName: 'myahInstagramReplyDraft',
    uniqueIndexColumns: [],
  },
] as const;

const physicalUniqueIndexName = (tableName: string, columns: readonly string[]) => {
  const hash = createHash('sha256');

  [tableName, ...columns, '"deletedAt" IS NULL'].forEach((part) => hash.update(part));

  return `IDX_UNIQUE_${hash.digest('hex').slice(0, 27)}`;
};

const LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS = new Set<string>(
  LEGACY_INSTAGRAM_TABLES.map(
    ({ objectUniversalIdentifier }) => objectUniversalIdentifier,
  ),
);

export type SynchronizeMyahStandardMetadataOptions = {
  preserveCreatorImportPermissions?: true;
  targetObjectUniversalIdentifiers?: ReadonlySet<string>;
  additionalAvailableObjectUniversalIdentifiers?: ReadonlySet<string>;
  migrateLegacyMyahApplication?: boolean;
  /** Enables the dormant, non-CRM-replacement adoption path for the former Instagram SDK. */
  legacyInstagramApplicationUniversalIdentifier?: string;
  explicitObsoleteUniversalIdentifiersByMetadataName?: Partial<
    Record<TwentyStandardMetadataName, ReadonlySet<string>>
  >;
};

@RegisteredWorkspaceCommand('2.20.0', 1784266302001)
@Command({
  name: 'upgrade:2-20:synchronize-myah-standard-metadata',
  description:
    'Synchronize source-controlled Myah standard metadata for existing workspaces',
})
export class SynchronizeMyahStandardMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly retireLegacyBrandBrainOwnerService: RetireLegacyBrandBrainOwnerService,
    private readonly pinnedSnapshotLoader: PinnedWorkspaceMetadataSnapshotLoaderService,
    private readonly metadataVersion: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  private async preflightLegacyInstagramTables({
    workspaceId,
    legacyInstagramApplicationId,
    expectedUniversalIdentifiersByMetadataName,
  }: {
    workspaceId: string;
    legacyInstagramApplicationId: string;
    expectedUniversalIdentifiersByMetadataName: Partial<
      Record<TwentyStandardMetadataName, ReadonlySet<string>>
    >;
  }): Promise<{
    databaseSchema: string;
    sourceRowCountByTableName: ReadonlyMap<string, number>;
  }> {
    const workspace = await this.coreDataSource
      .getRepository(WorkspaceEntity)
      .findOne({ select: ['databaseSchema'], where: { id: workspaceId } });

    if (!isNonEmptyString(workspace?.databaseSchema)) {
      throw new Error(
        `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: no database schema is configured`,
      );
    }

    const queryRunner = this.coreDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      const databaseSchema = workspace.databaseSchema;
      const sourceTableNames = LEGACY_INSTAGRAM_TABLES.map(
        ({ sourceTableName }) => sourceTableName,
      );
      const targetTableNames = LEGACY_INSTAGRAM_TABLES.map(
        ({ targetTableName }) => targetTableName,
      );
      const existingSourceTables = await this.getExistingTables(
        queryRunner,
        databaseSchema,
        sourceTableNames,
      );
      const existingTargetTables = await this.getExistingTables(
        queryRunner,
        databaseSchema,
        targetTableNames,
      );

      if (existingSourceTables.size !== sourceTableNames.length) {
        throw new Error(
          `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: the legacy table set is incomplete`,
        );
      }

      if (existingTargetTables.size !== 0) {
        throw new Error(
          `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: native target tables already exist`,
        );
      }

      const sourceRowCountByTableName = new Map<string, number>();
      for (const sourceTableName of sourceTableNames) {
        sourceRowCountByTableName.set(
          sourceTableName,
          await this.getTableRowCount(
            queryRunner,
            databaseSchema,
            sourceTableName,
          ),
        );
      }

      for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
        const expectedUniversalIdentifiers =
          expectedUniversalIdentifiersByMetadataName[metadataName] ??
          new Set<string>();

        if (expectedUniversalIdentifiers.size === 0) {
          continue;
        }

        const entity = ALL_METADATA_ENTITY_BY_METADATA_NAME[metadataName];
        const matchingMetadataCount = await queryRunner.manager.count(entity, {
          where: {
            workspaceId,
            applicationId: legacyInstagramApplicationId,
            universalIdentifier: In([...expectedUniversalIdentifiers]),
          },
        });

        if (matchingMetadataCount !== expectedUniversalIdentifiers.size) {
          throw new Error(
            `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: legacy graph ownership is incomplete`,
          );
        }
      }

      return { databaseSchema, sourceRowCountByTableName };
    } finally {
      await queryRunner.release();
    }
  }

  private async getExistingTables(
    queryRunner: QueryRunner,
    databaseSchema: string,
    tableNames: readonly string[],
  ): Promise<Set<string>> {
    // SAFETY: this SELECT returns only the declared table_name column.
    const rows = (await queryRunner.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = ANY($2::text[])`,
      [databaseSchema, tableNames],
    )) as { table_name: string }[];

    return new Set(rows.map(({ table_name }) => table_name));
  }

  private async getTableRowCount(
    queryRunner: QueryRunner,
    databaseSchema: string,
    tableName: string,
  ): Promise<number> {
    // SAFETY: this aggregate SELECT aliases its sole count column as text.
    // pi-lens-ignore: no-sql-in-code, sql-injection, property_identifier -- schema and table identifiers are escaped before interpolation.
    const rows = (await queryRunner.query(
      `SELECT count(*)::text AS count
         FROM ${escapeIdentifier(databaseSchema)}.${escapeIdentifier(tableName)}`,
    )) as { count: string }[];
    const count = Number(rows[0]?.count);

    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Unable to count legacy Instagram table ${tableName}`);
    }

    return count;
  }

  private async renameLegacyInstagramPhysicalNames(
    queryRunner: QueryRunner,
    databaseSchema: string,
  ): Promise<void> {
    const schema = escapeIdentifier(databaseSchema);
    const sourceTables = LEGACY_INSTAGRAM_TABLES.map(({ sourceTableName }) => sourceTableName);
    const expectedIndexes = LEGACY_INSTAGRAM_TABLES.flatMap(
      ({ sourceTableName, targetTableName, uniqueIndexColumns }) =>
        uniqueIndexColumns.map((columns) => ({
          sourceTableName,
          columns,
          legacyName: physicalUniqueIndexName(sourceTableName, columns),
          nativeName: physicalUniqueIndexName(targetTableName, columns),
        })),
    );
    const expectedIndexNames = new Set(
      expectedIndexes.flatMap(({ legacyName, nativeName }) => [legacyName, nativeName]),
    );
    const enums = (await queryRunner.query(
      `SELECT c.relname AS table_name, a.attname AS column_name, t.typname AS type_name
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_type t ON t.oid = a.atttypid
        WHERE n.nspname = $1 AND c.relname = ANY($2::text[])
          AND t.typtype = 'e' AND a.attnum > 0 AND NOT a.attisdropped`,
      [databaseSchema, sourceTables],
    )) as { table_name: string; column_name: string; type_name: string }[];

    if (enums.length !== 18) {
      throw new Error('Cannot adopt legacy Instagram metadata: legacy enum type set is incomplete');
    }

    const enumRenames = enums.map(({ table_name, column_name, type_name }) => {
      const targetTable = LEGACY_INSTAGRAM_TABLES.find(
        ({ sourceTableName }) => sourceTableName === table_name,
      );
      const legacyName = `${table_name}_${column_name}_enum`;

      if (!targetTable || type_name !== legacyName) {
        throw new Error('Cannot adopt legacy Instagram metadata: unexpected legacy enum type');
      }

      return { legacyName, nativeName: `${targetTable.targetTableName}_${column_name}_enum` };
    });
    const existingNativeTypes = (await queryRunner.query(
      `SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1 AND t.typname = ANY($2::text[])`,
      [databaseSchema, enumRenames.map(({ nativeName }) => nativeName)],
    )) as { typname: string }[];

    if (existingNativeTypes.length > 0) {
      throw new Error('Cannot adopt legacy Instagram metadata: native enum type name already exists');
    }

    const indexes = (await queryRunner.query(
      `SELECT i.relname AS index_name, i.relkind, c.relname AS table_name,
              ix.indisunique AS is_unique, pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
              to_json(array_agg(a.attname ORDER BY x.n) FILTER (WHERE a.attname IS NOT NULL)) AS columns
         FROM pg_class i JOIN pg_namespace n ON n.oid = i.relnamespace
         LEFT JOIN pg_index ix ON ix.indexrelid = i.oid
         LEFT JOIN pg_class c ON c.oid = ix.indrelid
         LEFT JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n) ON true
         LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = x.attnum
        WHERE n.nspname = $1
          AND (i.relname = ANY($2::text[])
            OR (c.relname = ANY($3::text[]) AND ix.indisunique AND ix.indpred IS NOT NULL))
        GROUP BY i.relname, i.relkind, c.relname, ix.indisunique, ix.indpred, ix.indrelid`,
      [databaseSchema, [...expectedIndexNames], sourceTables],
    )) as {
      index_name: string;
      relkind: string;
      table_name: string | null;
      is_unique: boolean | null;
      predicate: string | null;
      columns: string[] | null;
    }[];
    const byName = new Map(indexes.map((index) => [index.index_name, index]));

    if (indexes.some(({ index_name }) => !expectedIndexNames.has(index_name))) {
      throw new Error('Cannot adopt legacy Instagram metadata: unexpected physical unique index');
    }

    for (const { sourceTableName, columns, legacyName, nativeName } of expectedIndexes) {
      const legacy = byName.get(legacyName);
      const native = byName.get(nativeName);
      const matches = (index: (typeof indexes)[number] | undefined) =>
        index?.relkind === 'i' && index.table_name === sourceTableName &&
        index.is_unique === true && index.predicate === '("deletedAt" IS NULL)' &&
        JSON.stringify(index.columns) === JSON.stringify(columns);

      if (!matches(legacy) || (native !== undefined && !matches(native))) {
        throw new Error('Cannot adopt legacy Instagram metadata: physical unique index collision or missing legacy index');
      }
    }

    for (const { legacyName, nativeName } of expectedIndexes) {
      if (byName.has(nativeName)) {
        // A standard-sync-created native twin already exists on this same table.
        // pi-lens-ignore: no-sql-in-code, sql-injection, property_identifier -- preflight checked exact catalog names in this transaction.
        await queryRunner.query(`DROP INDEX ${schema}.${escapeIdentifier(legacyName)}`);
      } else {
        // pi-lens-ignore: no-sql-in-code, sql-injection, property_identifier -- deterministic names and escaped schema.
        await queryRunner.query(
          `ALTER INDEX ${schema}.${escapeIdentifier(legacyName)} RENAME TO ${escapeIdentifier(nativeName)}`,
        );
      }
    }
    for (const { legacyName, nativeName } of enumRenames) {
      // pi-lens-ignore: no-sql-in-code, sql-injection, property_identifier -- catalog-verified type on an allowlisted source table.
      await queryRunner.query(
        `ALTER TYPE ${schema}.${escapeIdentifier(legacyName)} RENAME TO ${escapeIdentifier(nativeName)}`,
      );
    }
  }

  private async transferLegacyInstagramGraph({
    workspaceId,
    legacyInstagramApplicationId,
    twentyStandardApplicationId,
    databaseSchema,
    sourceRowCountByTableName,
    expectedUniversalIdentifiersByMetadataName,
  }: {
    workspaceId: string;
    legacyInstagramApplicationId: string;
    twentyStandardApplicationId: string;
    databaseSchema: string;
    sourceRowCountByTableName: ReadonlyMap<string, number>;
    expectedUniversalIdentifiersByMetadataName: Partial<
      Record<TwentyStandardMetadataName, ReadonlySet<string>>
    >;
  }): Promise<void> {
    const queryRunner = this.coreDataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await this.renameLegacyInstagramPhysicalNames(queryRunner, databaseSchema);

      for (const { sourceTableName, targetTableName } of LEGACY_INSTAGRAM_TABLES) {
        // pi-lens-ignore: no-sql-in-code, sql-injection, property_identifier -- fixed table identifiers and escaped schema cannot be parameterized in PostgreSQL.
        await queryRunner.query(
          `ALTER TABLE ${escapeIdentifier(databaseSchema)}.${escapeIdentifier(sourceTableName)} RENAME TO ${escapeIdentifier(targetTableName)}`,
        );
      }

      for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
        const expectedUniversalIdentifiers =
          expectedUniversalIdentifiersByMetadataName[metadataName] ??
          new Set<string>();

        if (expectedUniversalIdentifiers.size === 0) {
          continue;
        }

        await queryRunner.manager.update(
          ALL_METADATA_ENTITY_BY_METADATA_NAME[metadataName],
          {
            workspaceId,
            applicationId: legacyInstagramApplicationId,
            universalIdentifier: In([...expectedUniversalIdentifiers]),
          },
          { applicationId: twentyStandardApplicationId },
        );

        const standardOwnedCount = await queryRunner.manager.count(
          ALL_METADATA_ENTITY_BY_METADATA_NAME[metadataName],
          {
            where: {
              workspaceId,
              applicationId: twentyStandardApplicationId,
              universalIdentifier: In([...expectedUniversalIdentifiers]),
            },
          },
        );

        if (standardOwnedCount !== expectedUniversalIdentifiers.size) {
          throw new Error(
            `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: graph ownership changed during transfer`,
          );
        }
      }

      const sourceTableNames = LEGACY_INSTAGRAM_TABLES.map(
        ({ sourceTableName }) => sourceTableName,
      );
      const targetTableNames = LEGACY_INSTAGRAM_TABLES.map(
        ({ targetTableName }) => targetTableName,
      );
      const [remainingSourceTables, targetTables] = await Promise.all([
        this.getExistingTables(queryRunner, databaseSchema, sourceTableNames),
        this.getExistingTables(queryRunner, databaseSchema, targetTableNames),
      ]);

      if (
        remainingSourceTables.size !== 0 ||
        targetTables.size !== targetTableNames.length
      ) {
        throw new Error(
          `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: table rename verification failed`,
        );
      }

      for (const { sourceTableName, targetTableName } of LEGACY_INSTAGRAM_TABLES) {
        const sourceRowCount = sourceRowCountByTableName.get(sourceTableName);
        const targetRowCount = await this.getTableRowCount(
          queryRunner,
          databaseSchema,
          targetTableName,
        );

        if (sourceRowCount === undefined || targetRowCount !== sourceRowCount) {
          throw new Error(
            `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: record count verification failed`,
          );
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async reconcileCommittedUpgrade(workspaceId: string): Promise<void> {
    await this.workspaceCacheService.flush(workspaceId, [
      ...ALL_FLAT_ENTITY_MAPS_PROPERTIES, 'flatApplicationMaps', 'featureFlagsMap',
    ]);
    await this.metadataVersion.publishCommittedMetadataVersion(workspaceId);
  }

  async workspaceSchemaExists(workspaceId: string): Promise<boolean> {
    const workspace = await this.coreDataSource
      .getRepository(WorkspaceEntity)
      .findOne({
        select: ['databaseSchema'],
        where: { id: workspaceId },
        withDeleted: true,
      });

    if (!isNonEmptyString(workspace?.databaseSchema)) {
      this.logger.log(
        `Skipping Myah standard metadata synchronization for workspace ${workspaceId}: no database schema is configured`,
      );

      return false;
    }

    const queryRunner = this.coreDataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      const schemaExists = await queryRunner.hasSchema(
        workspace.databaseSchema,
      );

      if (!schemaExists) {
        this.logger.log(
          `Skipping Myah standard metadata synchronization for workspace ${workspaceId}: schema ${workspace.databaseSchema} does not exist`,
        );
      }

      return schemaExists;
    } finally {
      await queryRunner.release();
    }
  }

  override runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    return this.synchronizeWorkspace(args);
  }

  override async runOnWorkspaceInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    queryRunner: QueryRunner,
    afterCommit: (effect: () => Promise<void> | void) => void,
  ): Promise<void> {
    if (
      args.options.dryRun === true ||
      !queryRunner?.isTransactionActive ||
      queryRunner.isReleased ||
      queryRunner.manager?.queryRunner !== queryRunner ||
      typeof afterCommit !== 'function'
    )
      throw new Error('Standard synchronization requires a pinned upgrade transaction');

    await this.synchronizeWorkspaceInternal(args, {}, { queryRunner, afterCommit });
    afterCommit(() => this.reconcileCommittedUpgrade(args.workspaceId));
  }

  async synchronizeWorkspace(
    args: RunOnWorkspaceArgs,
    syncOptions: SynchronizeMyahStandardMetadataOptions = {},
  ): Promise<void> {
    return this.synchronizeWorkspaceInternal(args, syncOptions);
  }

  // Explicit dormant entry: the ordinary CLI/marked dry-run never selects this path.
  async synchronizeCreatorImportInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    syncOptions: SynchronizeMyahStandardMetadataOptions,
    transaction: UpgradeWorkspaceTransaction,
  ): Promise<void> {
    const runner = transaction?.queryRunner;
    if (
      args.options.dryRun === true ||
      !runner ||
      runner.isReleased ||
      !runner.isTransactionActive ||
      runner.manager?.queryRunner !== runner ||
      typeof transaction.afterCommit !== 'function'
    )
      throw new Error(
        'Pinned Creator synchronization requires an active upgrade transaction',
      );
    if (
      !syncOptions.preserveCreatorImportPermissions ||
      syncOptions.migrateLegacyMyahApplication !== false ||
      Object.keys(syncOptions).some(
        (key) =>
          ![
            'preserveCreatorImportPermissions',
            'migrateLegacyMyahApplication',
            'targetObjectUniversalIdentifiers',
            'explicitObsoleteUniversalIdentifiersByMetadataName',
          ].includes(key),
      )
    )
      throw new Error(
        'Pinned Creator synchronization requires bounded Creator options',
      );
    return this.synchronizeWorkspaceInternal(args, syncOptions, transaction);
  }

  private async synchronizeWorkspaceInternal(
    { workspaceId, options }: RunOnWorkspaceArgs,
    syncOptions: SynchronizeMyahStandardMetadataOptions,
    transaction?: UpgradeWorkspaceTransaction,
  ): Promise<void> {
    if (syncOptions.preserveCreatorImportPermissions) {
      const targets = syncOptions.targetObjectUniversalIdentifiers;
      const obsolete =
        syncOptions.explicitObsoleteUniversalIdentifiersByMetadataName;
      if (
        targets?.size !== 1 ||
        !targets.has(MYAH_STANDARD_OBJECTS.creator.universalIdentifier) ||
        syncOptions.migrateLegacyMyahApplication !== false ||
        Object.entries(obsolete ?? {}).some(
          ([name, identifiers]) =>
            name !== 'viewField' ||
            identifiers === undefined ||
            [...identifiers].some(
              (identifier) =>
                !OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.has(
                  identifier,
                ),
            ),
        )
      ) {
        throw new Error('Unsafe Creator import permission guard options');
      }
    }
    // The loader validates UUID, exact manager binding, owners and schema before
    // any pooled owner/cache lookup. Each invocation creates a fresh full snapshot.
    const pinnedSnapshot = transaction
      ? await this.pinnedSnapshotLoader.load(
          workspaceId,
          transaction.queryRunner,
        )
      : undefined;
    if (!pinnedSnapshot && !(await this.workspaceSchemaExists(workspaceId))) {
      return;
    }

    // Pinned upgrades read the version through their runner later; never use
    // a pooled metadata read or publish a version before their receipt commits.
    const metadataVersionBeforeSynchronization = transaction
      ? undefined
      : (
          await this.coreDataSource.getRepository(WorkspaceEntity).findOneOrFail({
            select: ['metadataVersion'],
            where: { id: workspaceId },
          })
        ).metadataVersion;
    const pinnedStandardApplicationId =
      pinnedSnapshot?.flatApplicationMaps.idByUniversalIdentifier[
        TWENTY_STANDARD_APPLICATION.universalIdentifier
      ];
    const twentyStandardFlatApplication = pinnedSnapshot
      ? pinnedStandardApplicationId === undefined
        ? undefined
        : pinnedSnapshot.flatApplicationMaps.byId[pinnedStandardApplicationId]
      : (
          await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
            { workspaceId },
          )
        ).twentyStandardFlatApplication;
    if (!twentyStandardFlatApplication)
      throw new Error('Pinned standard application missing');
    if (transaction && syncOptions.legacyInstagramApplicationUniversalIdentifier !== undefined)
      throw new Error('Legacy Instagram adoption requires its separately guarded native command');
    const legacyInstagramApplication =
      syncOptions.legacyInstagramApplicationUniversalIdentifier === undefined
        ? undefined
        : await this.applicationService.findByUniversalIdentifier({
            universalIdentifier:
              syncOptions.legacyInstagramApplicationUniversalIdentifier,
            workspaceId,
          });
    if (syncOptions.legacyInstagramApplicationUniversalIdentifier !== undefined) {
      const queryRunner = this.coreDataSource.createQueryRunner();

      try {
        await queryRunner.connect();
        const unexpectedOwners = (await queryRunner.query(
          `SELECT "applicationId" FROM core."objectMetadata"
            WHERE "workspaceId" = $1 AND "universalIdentifier" = ANY($2::uuid[])
              AND "applicationId" IS DISTINCT FROM $3
              AND ($4::uuid IS NULL OR "applicationId" IS DISTINCT FROM $4)`,
          [
            workspaceId,
            [...LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS],
            twentyStandardFlatApplication.id,
            legacyInstagramApplication?.id ?? null,
          ],
        )) as { applicationId: string }[];

        if (unexpectedOwners.length > 0) {
          throw new Error(
            `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: object ownership is ambiguous or incomplete`,
          );
        }
      } finally {
        await queryRunner.release();
      }
    }

    const legacyMyahApplications = (
      await Promise.all(
        LEGACY_MYAH_APPLICATION_UNIVERSAL_IDENTIFIERS.map(
          async (universalIdentifier) =>
            pinnedSnapshot
              ? transaction!.queryRunner.manager
                  .getRepository(ApplicationEntity)
                  .findOne({
                    where: { workspaceId, universalIdentifier },
                  })
              : this.applicationService.findByUniversalIdentifier({
                  universalIdentifier,
                  workspaceId,
                }),
        ),
      )
    ).filter(isDefined);
    if (pinnedSnapshot && legacyMyahApplications.length > 0) {
      throw new Error(
        'Pinned Creator synchronization refuses active legacy application owners',
      );
    }
    const legacyMyahApplicationIds = legacyMyahApplications.map(({ id }) => id);
    const hasLegacyMyahApplication = legacyMyahApplicationIds.length > 0;
    const shouldMigrateLegacyMyahApplication =
      hasLegacyMyahApplication &&
      syncOptions.migrateLegacyMyahApplication !== false;
    const metadataCacheKeys = [
      ...Object.keys(ALL_METADATA_ENTITY_BY_METADATA_NAME).map(
        getMetadataFlatEntityMapsKey,
      ),
      'flatApplicationMaps',
      'featureFlagsMap',
    ] as WorkspaceCacheKeyName[];
    const cachedMetadata = pinnedSnapshot
      ? {
          ...pinnedSnapshot.allFlatEntityMaps,
          flatApplicationMaps: pinnedSnapshot.flatApplicationMaps,
          featureFlagsMap: pinnedSnapshot.featureFlagsMap,
        }
      : await this.workspaceCacheService.getOrRecompute(
          workspaceId,
          metadataCacheKeys,
        );
    const featureFlagsMap =
      cachedMetadata.featureFlagsMap as AdditionalCacheDataMaps['featureFlagsMap'];
    // Instagram adoption has its own owner preflight and touches only its four
    // explicitly selected objects; the unrelated Brand Brain owner must not
    // turn that later migration into a Brand Brain apply.
    const isBoundedInstagramSynchronization =
      syncOptions.legacyInstagramApplicationUniversalIdentifier !== undefined &&
      syncOptions.migrateLegacyMyahApplication === false &&
      syncOptions.targetObjectUniversalIdentifiers?.size ===
        LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.size &&
      [...LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS].every((identifier) =>
        syncOptions.targetObjectUniversalIdentifiers?.has(identifier),
      );
    const recognizedOldApp = isBoundedInstagramSynchronization
      ? undefined
      : legacyMyahApplications.find(
          (application) =>
            application.universalIdentifier === LEGACY_BRAND_BRAIN_APPLICATION_UID,
        );
    if (
      !isBoundedInstagramSynchronization &&
      hasLegacyMyahApplication &&
      (!recognizedOldApp || legacyMyahApplications.length !== 1)
    ) {
      throw new Error(
        'Unsafe legacy Brand Brain synchronization: unrecognized or mixed application owners',
      );
    }
    if (recognizedOldApp) {
      if (options.dryRun !== true) {
        throw new Error(
          'Legacy Brand Brain synchronization is read-only until independently reviewed native plans authorize apply',
        );
      }
      const cachedAppId =
        cachedMetadata.flatApplicationMaps.idByUniversalIdentifier[
          LEGACY_BRAND_BRAIN_APPLICATION_UID
        ];
      if (
        cachedAppId !== recognizedOldApp.id ||
        cachedMetadata.flatApplicationMaps.byId[cachedAppId]
          ?.universalIdentifier !== LEGACY_BRAND_BRAIN_APPLICATION_UID
      ) {
        throw new Error(
          'Unsafe legacy Brand Brain synchronization: application owner mismatch',
        );
      }
      const workspace = await this.coreDataSource
        .getRepository(WorkspaceEntity)
        .findOne({
          select: ['defaultRoleId'],
          where: { id: workspaceId },
          withDeleted: true,
        });
      if (!workspace)
        throw new Error(
          'Unsafe legacy Brand Brain synchronization: workspace not found',
        );
      await this.retireLegacyBrandBrainOwnerService.preflight({
        workspaceId,
        applications: cachedMetadata.flatApplicationMaps,
        workspaceDefaultRoleId: workspace.defaultRoleId,
        maps: cachedMetadata,
        additionalCacheDataMaps: { featureFlagsMap },
        retiredAt: new Date(),
      });
    }
    // SAFETY: requested cache keys are the complete Twenty standard flat-map set.
    const fromAllFlatEntityMaps = (pinnedSnapshot?.allFlatEntityMaps ??
      cachedMetadata) as TwentyStandardAllFlatEntityMaps;
    if (
      !recognizedOldApp &&
      !isBoundedInstagramSynchronization &&
      Object.values(
        fromAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .some(
          (object) =>
            [
              MYAH_STANDARD_OBJECTS.brandBrainPage,
              MYAH_STANDARD_OBJECTS.brandBrainLink,
              MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal,
            ].some(
              (known) =>
                known.universalIdentifier === object.universalIdentifier,
            ) && object.applicationId !== twentyStandardFlatApplication.id,
        )
    ) {
      throw new Error(
        'Unsafe legacy Brand Brain synchronization: known graph has no recognized owner',
      );
    }
    const {
      allFlatEntityMaps: standardAllFlatEntityMaps,
      idByUniversalIdentifierByMetadataName,
    } = computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId,
      twentyStandardApplicationId: twentyStandardFlatApplication.id,
      removeReplacedTwentyCrmMetadata: shouldMigrateLegacyMyahApplication,
    });

    const objectUniversalIdentifiers =
      syncOptions.targetObjectUniversalIdentifiers ??
      new Set<string>(
        Object.values(MYAH_STANDARD_OBJECTS).map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
      );
    const currentObjectUniversalIdentifiers = new Set(
      Object.keys(
        fromAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
      ),
    );
    const additionalAvailableObjectUniversalIdentifiers =
      syncOptions.additionalAvailableObjectUniversalIdentifiers ?? new Set();
    const standardFields = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    );
    const isObjectAvailable = (universalIdentifier: string): boolean =>
      objectUniversalIdentifiers.has(universalIdentifier) ||
      currentObjectUniversalIdentifiers.has(universalIdentifier);
    const hasAvailableFieldEndpoints = (
      field: (typeof standardFields)[number],
    ): boolean => {
      const objectUniversalIdentifier =
        field.objectMetadataUniversalIdentifier ?? '';
      const relationTargetObjectUniversalIdentifier =
        field.relationTargetObjectMetadataUniversalIdentifier;

      return (
        isObjectAvailable(objectUniversalIdentifier) &&
        (!isDefined(relationTargetObjectUniversalIdentifier) ||
          isObjectAvailable(relationTargetObjectUniversalIdentifier))
      );
    };
    const shouldIncludeField = (
      field: (typeof standardFields)[number],
    ): boolean => {
      const objectUniversalIdentifier =
        field.objectMetadataUniversalIdentifier ?? '';
      const relationTargetObjectUniversalIdentifier =
        field.relationTargetObjectMetadataUniversalIdentifier;

      if (syncOptions.targetObjectUniversalIdentifiers !== undefined) {
        return (
          objectUniversalIdentifiers.has(objectUniversalIdentifier) &&
          (!isDefined(relationTargetObjectUniversalIdentifier) ||
            objectUniversalIdentifiers.has(
              relationTargetObjectUniversalIdentifier,
            ) ||
            (additionalAvailableObjectUniversalIdentifiers.has(
              relationTargetObjectUniversalIdentifier,
            ) &&
              currentObjectUniversalIdentifiers.has(
                relationTargetObjectUniversalIdentifier,
              )))
        );
      }

      const hasMyahEndpoint =
        objectUniversalIdentifiers.has(objectUniversalIdentifier) ||
        (isDefined(relationTargetObjectUniversalIdentifier) &&
          objectUniversalIdentifiers.has(
            relationTargetObjectUniversalIdentifier,
          ));

      return hasMyahEndpoint && hasAvailableFieldEndpoints(field);
    };
    const fieldUniversalIdentifiers = toUniversalIdentifiers(
      standardFields.filter(shouldIncludeField),
    );
    const standardIndexes = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
    );
    const indexUniversalIdentifiers = toUniversalIdentifiers(
      standardIndexes.filter((index) =>
        syncOptions.targetObjectUniversalIdentifiers === undefined
          ? objectUniversalIdentifiers.has(
              index.objectMetadataUniversalIdentifier ?? '',
            ) ||
            index.universalFlatIndexFieldMetadatas?.some((indexField) =>
              fieldUniversalIdentifiers.has(
                indexField.fieldMetadataUniversalIdentifier,
              ),
            ) === true
          : objectUniversalIdentifiers.has(
              index.objectMetadataUniversalIdentifier ?? '',
            ) &&
            index.universalFlatIndexFieldMetadatas?.every((indexField) =>
              fieldUniversalIdentifiers.has(
                indexField.fieldMetadataUniversalIdentifier,
              ),
            ) === true,
      ),
    );
    const expectedLegacyInstagramFieldUniversalIdentifiers =
      toUniversalIdentifiers(
        standardFields.filter(
          (field) =>
            LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.has(
              field.objectMetadataUniversalIdentifier ?? '',
            ) ||
            LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.has(
              field.relationTargetObjectMetadataUniversalIdentifier ?? '',
            ),
        ),
      );
    const expectedLegacyInstagramIndexUniversalIdentifiers =
      toUniversalIdentifiers(
        standardIndexes.filter(
          (index) =>
            LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.has(
              index.objectMetadataUniversalIdentifier ?? '',
            ) ||
            index.universalFlatIndexFieldMetadatas?.some((indexField) =>
              expectedLegacyInstagramFieldUniversalIdentifiers.has(
                indexField.fieldMetadataUniversalIdentifier,
              ),
            ) === true,
        ),
      );
    const expectedLegacyInstagramUniversalIdentifiersByMetadataName = {
      objectMetadata: LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS,
      fieldMetadata: expectedLegacyInstagramFieldUniversalIdentifiers,
      index: expectedLegacyInstagramIndexUniversalIdentifiers,
    } satisfies Partial<
      Record<TwentyStandardMetadataName, ReadonlySet<string>>
    >;
    // The historical carrier expressed these identities as field-level
    // uniqueness. Explicit index metadata is a target-graph requirement,
    // created by the non-destructive standard synchronization below.
    const expectedHistoricalLegacyInstagramUniversalIdentifiersByMetadataName = {
      objectMetadata: LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS,
      fieldMetadata: expectedLegacyInstagramFieldUniversalIdentifiers,
    } satisfies Partial<
      Record<TwentyStandardMetadataName, ReadonlySet<string>>
    >;
    const currentLegacyInstagramObjectUniversalIdentifiers =
      toUniversalIdentifiers(
        getUniversalMetadataEntities(
          fromAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
        ).filter(
          (object) =>
            LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.has(
              object.universalIdentifier,
            ) &&
            object.applicationId === legacyInstagramApplication?.id,
        ),
      );
    const hasAnyLegacyInstagramObject =
      currentLegacyInstagramObjectUniversalIdentifiers.size > 0;
    const hasAdoptableLegacyInstagramGraph =
      isDefined(legacyInstagramApplication) &&
      currentLegacyInstagramObjectUniversalIdentifiers.size ===
        LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.size;

    if (
      hasAnyLegacyInstagramObject &&
      !hasAdoptableLegacyInstagramGraph
    ) {
      throw new Error(
        `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: object ownership is ambiguous or incomplete`,
      );
    }

    if (hasAdoptableLegacyInstagramGraph) {
      const unexpectedLegacyInstagramField = getUniversalMetadataEntities(
        fromAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
      ).find(
        (field) =>
          field.applicationId === legacyInstagramApplication.id &&
          (LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.has(
            field.objectMetadataUniversalIdentifier ?? '',
          ) ||
            LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.has(
              field.relationTargetObjectMetadataUniversalIdentifier ?? '',
            )) &&
          !expectedLegacyInstagramFieldUniversalIdentifiers.has(
            field.universalIdentifier,
          ),
      );
      const unexpectedLegacyInstagramIndex = getUniversalMetadataEntities(
        fromAllFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
      ).find(
        (index) =>
          index.applicationId === legacyInstagramApplication.id &&
          (LEGACY_INSTAGRAM_OBJECT_UNIVERSAL_IDENTIFIERS.has(
            index.objectMetadataUniversalIdentifier ?? '',
          ) ||
            index.universalFlatIndexFieldMetadatas?.some((indexField) =>
              expectedLegacyInstagramFieldUniversalIdentifiers.has(
                indexField.fieldMetadataUniversalIdentifier,
              ),
            ) === true) &&
          !expectedLegacyInstagramIndexUniversalIdentifiers.has(
            index.universalIdentifier,
          ),
      );

      if (
        unexpectedLegacyInstagramField !== undefined ||
        unexpectedLegacyInstagramIndex !== undefined
      ) {
        throw new Error(
          `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: unexpected legacy graph metadata remains`,
        );
      }

      for (const [metadataName, expectedUniversalIdentifiers] of Object.entries(
        expectedHistoricalLegacyInstagramUniversalIdentifiersByMetadataName,
      ) as Array<[TwentyStandardMetadataName, ReadonlySet<string>]>) {
        const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
        // SAFETY: metadata-name-derived keys address the complete cached flat-map set.
        const currentFlatEntityMaps = (
          fromAllFlatEntityMaps as unknown as Record<
            string,
            SyncableFlatEntityMaps
          >
        )[flatEntityMapsKey];
        const ownedCount = Object.values(
          currentFlatEntityMaps.byUniversalIdentifier,
        ).filter(
          (entity) =>
            entity !== undefined &&
            expectedUniversalIdentifiers.has(entity.universalIdentifier) &&
            entity.applicationId === legacyInstagramApplication.id,
        ).length;

        if (ownedCount !== expectedUniversalIdentifiers.size) {
          throw new Error(
            `Cannot adopt legacy Instagram metadata for workspace ${workspaceId}: ${metadataName} graph ownership is incomplete`,
          );
        }
      }
    }
    const standardViewFields = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatViewFieldMaps.byUniversalIdentifier,
    );
    const standardViews = getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatViewMaps.byUniversalIdentifier,
    );
    const viewUniversalIdentifiers = toUniversalIdentifiers(
      standardViews.filter((view) =>
        syncOptions.targetObjectUniversalIdentifiers === undefined
          ? objectUniversalIdentifiers.has(
              view.objectMetadataUniversalIdentifier ?? '',
            ) ||
            standardViewFields.some(
              (viewField) =>
                viewField.viewUniversalIdentifier ===
                  view.universalIdentifier &&
                fieldUniversalIdentifiers.has(
                  viewField.fieldMetadataUniversalIdentifier ?? '',
                ),
            )
          : objectUniversalIdentifiers.has(
              view.objectMetadataUniversalIdentifier ?? '',
            ) &&
            standardViewFields
              .filter(
                (viewField) =>
                  viewField.viewUniversalIdentifier ===
                  view.universalIdentifier,
              )
              .every((viewField) =>
                fieldUniversalIdentifiers.has(
                  viewField.fieldMetadataUniversalIdentifier ?? '',
                ),
              ),
      ),
    );
    const pageLayoutUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatPageLayoutMaps.byUniversalIdentifier,
      ).filter((pageLayout) =>
        objectUniversalIdentifiers.has(
          pageLayout.objectMetadataUniversalIdentifier ?? '',
        ),
      ),
    );
    const pageLayoutTabUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatPageLayoutTabMaps.byUniversalIdentifier,
      ).filter((pageLayoutTab) =>
        pageLayoutUniversalIdentifiers.has(
          pageLayoutTab.pageLayoutUniversalIdentifier ?? '',
        ),
      ),
    );
    const pageLayoutWidgetUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatPageLayoutWidgetMaps
          .byUniversalIdentifier,
      ).filter((pageLayoutWidget) =>
        pageLayoutTabUniversalIdentifiers.has(
          pageLayoutWidget.pageLayoutTabUniversalIdentifier ?? '',
        ),
      ),
    );
    for (const pageLayoutWidget of getUniversalMetadataEntities(
      standardAllFlatEntityMaps.flatPageLayoutWidgetMaps.byUniversalIdentifier,
    )) {
      if (
        !pageLayoutWidgetUniversalIdentifiers.has(
          pageLayoutWidget.universalIdentifier,
        )
      ) {
        continue;
      }

      const viewUniversalIdentifier =
        pageLayoutWidget.universalConfiguration?.viewUniversalIdentifier ??
        pageLayoutWidget.universalConfiguration?.viewId;

      if (isDefined(viewUniversalIdentifier)) {
        viewUniversalIdentifiers.add(viewUniversalIdentifier);
      }
    }
    for (const viewField of standardViewFields) {
      const fieldMetadataUniversalIdentifier =
        viewField.fieldMetadataUniversalIdentifier;

      const field = isDefined(fieldMetadataUniversalIdentifier)
        ? standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
            fieldMetadataUniversalIdentifier
          ]
        : undefined;

      if (
        viewUniversalIdentifiers.has(viewField.viewUniversalIdentifier ?? '') &&
        isDefined(field) &&
        (syncOptions.targetObjectUniversalIdentifiers !== undefined ||
          hasAvailableFieldEndpoints(field))
      ) {
        fieldUniversalIdentifiers.add(field.universalIdentifier);
      }
    }

    for (const field of standardFields) {
      if (
        !fieldUniversalIdentifiers.has(field.universalIdentifier) ||
        !isDefined(field.relationTargetFieldMetadataUniversalIdentifier)
      ) {
        continue;
      }

      const relationTargetField =
        standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
          field.relationTargetFieldMetadataUniversalIdentifier
        ];

      if (
        isDefined(relationTargetField) &&
        (syncOptions.targetObjectUniversalIdentifiers !== undefined ||
          hasAvailableFieldEndpoints(relationTargetField))
      ) {
        fieldUniversalIdentifiers.add(relationTargetField.universalIdentifier);
      }
    }
    const objectUniversalIdentifiersToSynchronize = new Set(
      objectUniversalIdentifiers,
    );

    for (const field of standardFields) {
      if (!fieldUniversalIdentifiers.has(field.universalIdentifier)) {
        continue;
      }

      if (isDefined(field.objectMetadataUniversalIdentifier)) {
        objectUniversalIdentifiersToSynchronize.add(
          field.objectMetadataUniversalIdentifier,
        );
      }

      if (isDefined(field.relationTargetObjectMetadataUniversalIdentifier)) {
        objectUniversalIdentifiersToSynchronize.add(
          field.relationTargetObjectMetadataUniversalIdentifier,
        );
      }
    }

    const viewFilterUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatViewFilterMaps.byUniversalIdentifier,
      ).filter((viewFilter) =>
        viewUniversalIdentifiers.has(viewFilter.viewUniversalIdentifier ?? ''),
      ),
    );
    const viewFieldUniversalIdentifiers = toUniversalIdentifiers(
      standardViewFields.filter(
        (viewField) =>
          viewUniversalIdentifiers.has(
            viewField.viewUniversalIdentifier ?? '',
          ) &&
          (syncOptions.targetObjectUniversalIdentifiers !== undefined ||
            (isDefined(viewField.fieldMetadataUniversalIdentifier) &&
              fieldUniversalIdentifiers.has(
                viewField.fieldMetadataUniversalIdentifier,
              ))),
      ),
    );
    const navigationMenuItemUniversalIdentifiers = toUniversalIdentifiers(
      getUniversalMetadataEntities(
        standardAllFlatEntityMaps.flatNavigationMenuItemMaps
          .byUniversalIdentifier,
      ).filter(
        (navigationMenuItem) =>
          objectUniversalIdentifiers.has(
            navigationMenuItem.targetObjectMetadataUniversalIdentifier ?? '',
          ) ||
          viewUniversalIdentifiers.has(
            navigationMenuItem.viewUniversalIdentifier ?? '',
          ),
      ),
    );

    const toAllFlatEntityMaps = createEmptyAllFlatEntityMaps();
    // SAFETY: metadata-name-derived keys address the complete standard map collection.
    const standardFlatEntityMapsByKey =
      standardAllFlatEntityMaps as unknown as Record<
        string,
        SyncableFlatEntityMaps
      >;
    // SAFETY: metadata-name-derived keys address the complete empty map collection.
    const toFlatEntityMapsByKey = toAllFlatEntityMaps as unknown as Record<
      string,
      SyncableFlatEntityMaps
    >;
    const selectMetadata = (
      metadataName: (typeof TWENTY_STANDARD_ALL_METADATA_NAME)[number],
      universalIdentifiers: ReadonlySet<string>,
    ) => {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);

      toFlatEntityMapsByKey[flatEntityMapsKey] =
        getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
          flatEntityMaps: standardFlatEntityMapsByKey[flatEntityMapsKey],
          universalIdentifiers,
        });
    };

    selectMetadata('objectMetadata', objectUniversalIdentifiersToSynchronize);
    selectMetadata('fieldMetadata', fieldUniversalIdentifiers);
    selectMetadata('index', indexUniversalIdentifiers);
    selectMetadata('view', viewUniversalIdentifiers);
    selectMetadata('viewFilter', viewFilterUniversalIdentifiers);
    selectMetadata('viewField', viewFieldUniversalIdentifiers);
    selectMetadata(
      'role',
      syncOptions.targetObjectUniversalIdentifiers === undefined
        ? MYAH_ROLE_UNIVERSAL_IDENTIFIERS
        : new Set(
            [
              ...getUniversalMetadataEntities(
                standardAllFlatEntityMaps.flatObjectPermissionMaps
                  .byUniversalIdentifier,
              ).filter((objectPermission) =>
                objectUniversalIdentifiers.has(
                  objectPermission.objectMetadataUniversalIdentifier ?? '',
                ),
              ),
              ...getUniversalMetadataEntities(
                standardAllFlatEntityMaps.flatFieldPermissionMaps
                  .byUniversalIdentifier,
              ).filter((fieldPermission) =>
                syncOptions.targetObjectUniversalIdentifiers === undefined
                  ? objectUniversalIdentifiers.has(
                      fieldPermission.objectMetadataUniversalIdentifier ?? '',
                    ) ||
                    fieldUniversalIdentifiers.has(
                      fieldPermission.fieldMetadataUniversalIdentifier ?? '',
                    )
                  : objectUniversalIdentifiers.has(
                      fieldPermission.objectMetadataUniversalIdentifier ?? '',
                    ) &&
                    fieldUniversalIdentifiers.has(
                      fieldPermission.fieldMetadataUniversalIdentifier ?? '',
                    ),
              ),
            ]
              .map((permission) => permission.roleUniversalIdentifier)
              .filter(isDefined),
          ),
    );
    selectMetadata(
      'objectPermission',
      toUniversalIdentifiers(
        getUniversalMetadataEntities(
          standardAllFlatEntityMaps.flatObjectPermissionMaps
            .byUniversalIdentifier,
        ).filter((objectPermission) =>
          objectUniversalIdentifiers.has(
            objectPermission.objectMetadataUniversalIdentifier ?? '',
          ),
        ),
      ),
    );
    selectMetadata(
      'fieldPermission',
      toUniversalIdentifiers(
        getUniversalMetadataEntities(
          standardAllFlatEntityMaps.flatFieldPermissionMaps
            .byUniversalIdentifier,
        ).filter((fieldPermission) =>
          syncOptions.targetObjectUniversalIdentifiers === undefined
            ? objectUniversalIdentifiers.has(
                fieldPermission.objectMetadataUniversalIdentifier ?? '',
              ) ||
              fieldUniversalIdentifiers.has(
                fieldPermission.fieldMetadataUniversalIdentifier ?? '',
              )
            : objectUniversalIdentifiers.has(
                fieldPermission.objectMetadataUniversalIdentifier ?? '',
              ) &&
              fieldUniversalIdentifiers.has(
                fieldPermission.fieldMetadataUniversalIdentifier ?? '',
              ),
        ),
      ),
    );
    selectMetadata('pageLayout', pageLayoutUniversalIdentifiers);
    selectMetadata('pageLayoutTab', pageLayoutTabUniversalIdentifiers);
    selectMetadata('pageLayoutWidget', pageLayoutWidgetUniversalIdentifiers);
    {
      selectMetadata(
        'navigationMenuItem',
        navigationMenuItemUniversalIdentifiers,
      );
      for (const universalIdentifier of objectUniversalIdentifiersToSynchronize) {
        if (objectUniversalIdentifiers.has(universalIdentifier)) {
          continue;
        }

        const currentObject =
          fromAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
            universalIdentifier
          ];

        if (isDefined(currentObject)) {
          toAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
            universalIdentifier
          ] = { ...currentObject };
        }
      }

      pruneDanglingForeignKeyAggregatorsInAllFlatEntityMapsThroughMutation({
        allFlatEntityMapsToMutate: toAllFlatEntityMaps,
      });
    }
    const hasExplicitObsoleteUniversalIdentifiers =
      TWENTY_STANDARD_ALL_METADATA_NAME.some(
        (metadataName) =>
          (syncOptions.explicitObsoleteUniversalIdentifiersByMetadataName?.[
            metadataName
          ]?.size ?? 0) > 0,
      );
    const hasCompleteNativeMyahGraph = TWENTY_STANDARD_ALL_METADATA_NAME.every(
      (metadataName) => {
        const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
        const desiredUniversalIdentifiers = Object.keys(
          toFlatEntityMapsByKey[flatEntityMapsKey].byUniversalIdentifier,
        );
        // SAFETY: metadata-name-derived keys address the complete cached map collection.
        const currentFlatEntityMaps = (
          fromAllFlatEntityMaps as unknown as Record<
            string,
            SyncableFlatEntityMaps
          >
        )[flatEntityMapsKey];

        return desiredUniversalIdentifiers.every(
          (universalIdentifier) =>
            currentFlatEntityMaps.byUniversalIdentifier[universalIdentifier] !==
            undefined,
        );
      },
    );

    const hasInstalledBrandBrainGraph =
      Object.values(
        fromAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .some((object) =>
          [
            MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier,
            MYAH_STANDARD_OBJECTS.brandBrainLink.universalIdentifier,
            MYAH_STANDARD_OBJECTS.brandBrainUpdateProposal.universalIdentifier,
          ].some((uid) => uid === object.universalIdentifier),
        ) ||
      isDefined(
        fromAllFlatEntityMaps.flatRoleMaps.byUniversalIdentifier[
          STANDARD_ROLE.brandBrainAdmin.universalIdentifier
        ],
      ) ||
      Object.values(
        fromAllFlatEntityMaps.flatObjectPermissionMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .some(
          (permission) =>
            permission.roleUniversalIdentifier ===
            STANDARD_ROLE.brandBrainAdmin.universalIdentifier,
        );

    if (
      !hasLegacyMyahApplication &&
      !hasAdoptableLegacyInstagramGraph &&
      !hasInstalledBrandBrainGraph &&
      hasCompleteNativeMyahGraph &&
      !hasExplicitObsoleteUniversalIdentifiers &&
      !syncOptions.preserveCreatorImportPermissions
    ) {
      this.logger.log(
        `Skipping Myah standard metadata synchronization for workspace ${workspaceId}: native metadata graph is already complete`,
      );

      return;
    }
    const legacyInstagramAdoptionPreflight =
      hasAdoptableLegacyInstagramGraph && !options.dryRun
        ? await this.preflightLegacyInstagramTables({
            workspaceId,
            legacyInstagramApplicationId: legacyInstagramApplication.id,
            expectedUniversalIdentifiersByMetadataName:
              expectedHistoricalLegacyInstagramUniversalIdentifiersByMetadataName,
          })
        : undefined;
    const legacyObsoleteUniversalIdentifiersByMetadataName =
      shouldMigrateLegacyMyahApplication
        ? getReplacedTwentyCrmMetadataUniversalIdentifiers(
            fromAllFlatEntityMaps as TwentyStandardAllFlatEntityMaps,
          )
        : {};

    const fromMyahFlatEntityMaps = createEmptyAllFlatEntityMaps();
    const dependencyAllFlatEntityMaps = createEmptyAllFlatEntityMaps();
    for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
      const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
      // SAFETY: metadata-name-derived keys address corresponding target flat maps.
      const toFlatEntityMaps = toAllFlatEntityMaps[
        flatEntityMapsKey
      ] as unknown as SyncableFlatEntityMaps;
      // SAFETY: metadata-name-derived keys address corresponding cached flat maps.
      const fromFlatEntityMaps = fromAllFlatEntityMaps[
        flatEntityMapsKey
      ] as unknown as SyncableFlatEntityMaps;
      // SAFETY: metadata-name-derived keys address corresponding dependency flat maps.
      (
        dependencyAllFlatEntityMaps as unknown as Record<
          string,
          SyncableFlatEntityMaps
        >
      )[flatEntityMapsKey] = structuredClone(fromFlatEntityMaps);
      const universalIdentifiers = new Set([
        ...Object.keys(toFlatEntityMaps.byUniversalIdentifier),
        ...(legacyObsoleteUniversalIdentifiersByMetadataName[metadataName] ??
          []),
        ...(syncOptions.explicitObsoleteUniversalIdentifiersByMetadataName?.[
          metadataName
        ] ?? []),
      ]);

      const fromFlatEntitySubMaps =
        getSubFlatEntityMapsByUniversalIdentifiersOrThrow({
          flatEntityMaps: fromFlatEntityMaps,
          universalIdentifiers,
        });

      // SAFETY: metadata-name-derived keys address corresponding selected-source flat maps.
      (
        fromMyahFlatEntityMaps as unknown as Record<
          string,
          SyncableFlatEntityMaps
        >
      )[flatEntityMapsKey] = fromFlatEntitySubMaps;
    }

    overlayExistingRetirementClosure({
      fromAllFlatEntityMaps: pinnedSnapshot
        ? structuredClone(fromAllFlatEntityMaps)
        : fromAllFlatEntityMaps,
      fromMyahFlatEntityMaps:
        fromMyahFlatEntityMaps as TwentyStandardAllFlatEntityMaps,
      toAllFlatEntityMaps,
      idByUniversalIdentifierByMetadataName,
      standardApplicationId: twentyStandardFlatApplication.id,
    });

    // The same projection preserves an already-installed Standard-owned Brand
    // Brain graph. It never provisions one when no known graph is installed.
    if (
      recognizedOldApp ||
      (syncOptions.targetObjectUniversalIdentifiers === undefined &&
        hasInstalledBrandBrainGraph)
    ) {
      // The standard owner was resolved above even if a caller requested a
      // narrower cache shape. The projection still checks every selected row's
      // installed owner; it never trusts a synthesized legacy application.
      const applications = cachedMetadata.flatApplicationMaps ?? {
        byId: { [twentyStandardFlatApplication.id]: twentyStandardFlatApplication },
        idByUniversalIdentifier: {
          [twentyStandardFlatApplication.universalIdentifier]:
            twentyStandardFlatApplication.id,
        },
      };
      projectLegacyBrandBrainStandardTarget({
        existing: fromAllFlatEntityMaps,
        source: fromMyahFlatEntityMaps as TwentyStandardAllFlatEntityMaps,
        target: toAllFlatEntityMaps,
        applications,
      });
      for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
        const key = getMetadataFlatEntityMapsKey(metadataName);
        idByUniversalIdentifierByMetadataName[metadataName] =
          Object.fromEntries(
            Object.values(toAllFlatEntityMaps[key].byUniversalIdentifier)
              .filter(isDefined)
              .map((entity) => [entity.universalIdentifier, entity.id]),
          );
      }
    }

    fromMyahFlatEntityMaps.flatFieldMetadataMaps =
      withoutCacheDerivedFieldMetadataProperties(
        fromMyahFlatEntityMaps.flatFieldMetadataMaps,
      );
    toAllFlatEntityMaps.flatFieldMetadataMaps =
      withoutCacheDerivedFieldMetadataProperties(
        toAllFlatEntityMaps.flatFieldMetadataMaps,
      );

    if (syncOptions.preserveCreatorImportPermissions) {
      if (recognizedOldApp) {
        throw new Error('Unsafe Creator import: legacy application owner');
      }
      assertCreatorImportPermissionsUnchanged(
        fromAllFlatEntityMaps,
        toAllFlatEntityMaps,
        workspaceId,
        twentyStandardFlatApplication.id,
        twentyStandardFlatApplication.universalIdentifier,
      );
      if (
        !hasLegacyMyahApplication &&
        hasCompleteNativeMyahGraph &&
        !hasExplicitObsoleteUniversalIdentifiers
      ) {
        this.logger.log(
          `Skipping Myah standard metadata synchronization for workspace ${workspaceId}: native metadata graph is already complete`,
        );
        return;
      }
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo(
        {
          workspaceId,
          buildOptions: {
            applicationUniversalIdentifier:
              twentyStandardFlatApplication.universalIdentifier,
            inferDeletionFromMissingEntities: true,
            isSystemBuild: true,
          },
          fromToAllFlatEntityMaps: buildFromToAllUniversalFlatEntityMaps({
            fromAllFlatEntityMaps: pinnedSnapshot
              ? structuredClone(fromMyahFlatEntityMaps)
              : fromMyahFlatEntityMaps,
            toAllUniversalFlatEntityMaps: toAllFlatEntityMaps,
          }),
          dependencyAllFlatEntityMaps,
          additionalCacheDataMaps: { featureFlagsMap },
          idByUniversalIdentifierByMetadataName,
          dryRun: recognizedOldApp ? true : options.dryRun,
          upgradeTransaction: transaction,
          pinnedSnapshot,
        },
      );

    if (result.status === 'fail') {
      this.logger.error(
        `Failed to synchronize Myah standard metadata for workspace ${workspaceId}`,
      );
      throw new Error(
        `Failed to synchronize Myah standard metadata for workspace ${workspaceId}`,
      );
    }

    if (recognizedOldApp) {
      const actions = result.workspaceMigration?.actions;
      if (
        result.workspaceMigration?.applicationUniversalIdentifier !==
          twentyStandardFlatApplication.universalIdentifier ||
        !Array.isArray(actions) ||
        actions.some((action) => {
          if (action.type === 'delete') return true;
          if (
            action.type === 'create' &&
            'roleUniversalIdentifier' in action.flatEntity &&
            action.flatEntity.roleUniversalIdentifier ===
              '8563f1a9-4e02-408a-a5d7-45f68779023a'
          )
            return true;
          const key = getMetadataFlatEntityMapsKey(action.metadataName);
          // SAFETY: all metadata-name-derived flat maps share the byUniversalIdentifier index.
          const uid =
            action.type === 'create'
              ? action.flatEntity.universalIdentifier
              : action.universalIdentifier;
          if (
            action.type === 'create' &&
            action.metadataName === 'role' &&
            uid === '8563f1a9-4e02-408a-a5d7-45f68779023a'
          )
            return true;
          // SAFETY: metadata-name keys resolve to the matching cached flat-map index.
          const existing = (
            fromAllFlatEntityMaps as unknown as Record<
              string,
              SyncableFlatEntityMaps
            >
          )[key]?.byUniversalIdentifier[uid];
          return (
            existing !== undefined &&
            (action.type === 'create' ||
              existing.applicationId !== twentyStandardFlatApplication.id)
          );
        })
      ) {
        throw new Error(
          'Unsafe legacy Brand Brain standard plan: foreign-owner or unrelated deletion action',
        );
      }
      return;
    }

    // Pinned 2001 leaves cache/version publication to its committed receipt.
    if (options.dryRun || transaction) return;
    if (metadataVersionBeforeSynchronization === undefined)
      throw new Error('Missing standard metadata version before synchronization');

    if (
      legacyInstagramAdoptionPreflight !== undefined &&
      isDefined(legacyInstagramApplication)
    ) {
      await this.transferLegacyInstagramGraph({
        workspaceId,
        legacyInstagramApplicationId: legacyInstagramApplication.id,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
        databaseSchema: legacyInstagramAdoptionPreflight.databaseSchema,
        sourceRowCountByTableName:
          legacyInstagramAdoptionPreflight.sourceRowCountByTableName,
        expectedUniversalIdentifiersByMetadataName:
          expectedLegacyInstagramUniversalIdentifiersByMetadataName,
      });
      await this.workspaceCacheService.flush(
        workspaceId,
        TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
      );
      const metadataVersionAfterStandardSynchronization = (
        await this.coreDataSource.getRepository(WorkspaceEntity).findOneOrFail({
          select: ['metadataVersion'],
          where: { id: workspaceId },
        })
      ).metadataVersion;
      if (
        metadataVersionAfterStandardSynchronization ===
        metadataVersionBeforeSynchronization
      ) {
        await this.metadataVersion.incrementMetadataVersion(
          workspaceId,
        );
      }

      return;
    }

    if (!shouldMigrateLegacyMyahApplication) {
      await this.workspaceCacheService.flush(
        workspaceId,
        TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
      );
      const metadataVersionAfterFirstTimeSynchronization = (
        await this.coreDataSource.getRepository(WorkspaceEntity).findOneOrFail({
          select: ['metadataVersion'],
          where: { id: workspaceId },
        })
      ).metadataVersion;

      if (
        metadataVersionAfterFirstTimeSynchronization ===
        metadataVersionBeforeSynchronization
      ) {
        await this.metadataVersion.incrementMetadataVersion(
          workspaceId,
        );
      }

      return;
    }

    const queryRunner = this.coreDataSource.createQueryRunner();

    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      for (const metadataName of TWENTY_STANDARD_ALL_METADATA_NAME) {
        const flatEntityMapsKey = getMetadataFlatEntityMapsKey(metadataName);
        const targetUniversalIdentifiers = Object.keys(
          (
            /* SAFETY: each standard metadata name maps to its corresponding flat-map key. */
            toAllFlatEntityMaps as unknown as Record<
              string,
              SyncableFlatEntityMaps
            >
          )[flatEntityMapsKey].byUniversalIdentifier,
        );

        if (targetUniversalIdentifiers.length === 0) {
          continue;
        }

        await queryRunner.manager.update(
          ALL_METADATA_ENTITY_BY_METADATA_NAME[metadataName],
          {
            workspaceId,
            applicationId: In(legacyMyahApplicationIds),
            universalIdentifier: In(targetUniversalIdentifiers),
          },
          { applicationId: twentyStandardFlatApplication.id },
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.workspaceCacheService.flush(
      workspaceId,
      TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
    );
    await this.metadataVersion.incrementMetadataVersion(
      workspaceId,
    );
  }
}
