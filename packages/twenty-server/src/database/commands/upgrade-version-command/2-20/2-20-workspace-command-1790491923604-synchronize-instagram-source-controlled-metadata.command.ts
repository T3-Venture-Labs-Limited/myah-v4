import { isDeepStrictEqual } from 'node:util';

import { Command } from 'nest-commander';
import { type QueryRunner } from 'typeorm';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isValidUuid } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { PinnedWorkspaceMetadataSnapshotLoaderService } from 'src/database/commands/upgrade-version-command/2-20/services/pinned-workspace-metadata-snapshot-loader.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

const LEGACY_INSTAGRAM_APPLICATION_UID = '4738ebcd-6662-4ecc-a190-374fa0525951';
const OBJECTS = [
  MYAH_STANDARD_OBJECTS.myahInstagramAccount,
  MYAH_STANDARD_OBJECTS.myahSocialConversation,
  MYAH_STANDARD_OBJECTS.myahSocialMessage,
  MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft,
];
const objectUids = OBJECTS.map((object) => object.universalIdentifier);
const fieldUids = [
  ...OBJECTS.flatMap((object) =>
    Object.values(object.fields).map((field) => field.universalIdentifier),
  ),
  MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations
    .universalIdentifier,
  MYAH_STANDARD_OBJECTS.creator.fields.instagramMessageDrafts
    .universalIdentifier,
];
const indexUids = OBJECTS.flatMap((object) =>
  Object.values(object.indexes).map((index) => index.universalIdentifier),
);
const nativeNames = [
  'myahInstagramAccount',
  'myahSocialConversation',
  'myahSocialMessage',
  'myahInstagramReplyDraft',
];
const tableNames = nativeNames.flatMap((name) => [name, `_${name}`]);
const fail = (): never => {
  throw new Error(
    'Unsafe pinned 3604: Instagram graph is not wholly absent or readback differs',
  );
};

// UpgradeCommand spreads the raw -w Set into parsed options and always adds
// workspaceIds (including undefined). The common runner separately adds an
// own dataSource property. Validate both contracts without using dataSource:
// metadata and SQL must continue to use the caller's bound QueryRunner only.
const hasValidUpgradeOptions = (
  value: unknown,
  workspaceId: string,
): boolean => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false;
  // SAFETY: plain-object validation above guarantees own-key inspection; each
  // value is still unknown and is checked before it influences admission.
  const options = value as Record<string, unknown>;
  if (
    Object.keys(options).some(
      (key) =>
        ![
          'dryRun',
          'verbose',
          'workspaceId',
          'workspaceIds',
          'startFromWorkspaceId',
          'workspaceCountLimit',
        ].includes(key),
    ) ||
    (options.dryRun !== undefined && options.dryRun !== false) ||
    (options.verbose !== undefined && typeof options.verbose !== 'boolean') ||
    (options.startFromWorkspaceId !== undefined &&
      (typeof options.startFromWorkspaceId !== 'string' ||
        !isValidUuid(options.startFromWorkspaceId))) ||
    (options.workspaceCountLimit !== undefined &&
      (typeof options.workspaceCountLimit !== 'number' ||
        !Number.isSafeInteger(options.workspaceCountLimit) ||
        options.workspaceCountLimit <= 0))
  )
    return false;

  const rawIds = options.workspaceId;
  const parsedIds = options.workspaceIds;
  if (
    rawIds !== undefined &&
    (!(rawIds instanceof Set) ||
      rawIds.size === 0 ||
      [...rawIds].some((id) => typeof id !== 'string' || !isValidUuid(id)))
  )
    return false;
  if (
    parsedIds !== undefined &&
    (!Array.isArray(parsedIds) ||
      parsedIds.length === 0 ||
      parsedIds.some((id) => typeof id !== 'string' || !isValidUuid(id)) ||
      new Set(parsedIds).size !== parsedIds.length ||
      !parsedIds.includes(workspaceId))
  )
    return false;
  if (options.startFromWorkspaceId !== undefined && parsedIds !== undefined)
    return false;
  if (
    rawIds instanceof Set &&
    (options.startFromWorkspaceId !== undefined ||
      !Array.isArray(parsedIds) ||
      rawIds.size !== parsedIds.length ||
      [...rawIds].some((id) => !parsedIds.includes(id)))
  )
    return false;
  return true;
};

@RegisteredWorkspaceCommand('2.20.0', 1790491923604)
@Command({
  name: 'upgrade:2-20:synchronize-instagram-source-controlled-metadata',
  description:
    'Provision a wholly absent source-controlled Instagram graph in a pinned upgrade',
})
export class SynchronizeInstagramSourceControlledMetadataCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly synchronizeMyahStandardMetadataCommand: SynchronizeMyahStandardMetadataCommand,
    private readonly pinnedSnapshotLoader: PinnedWorkspaceMetadataSnapshotLoaderService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly metadataVersion: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(_args: RunOnWorkspaceArgs): Promise<void> {
    throw new Error('Instagram apply requires a pinned upgrade transaction');
  }

  override async runOnWorkspaceInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    queryRunner: QueryRunner,
    afterCommit: (effect: () => Promise<void> | void) => void,
  ): Promise<void> {
    if (
      !args ||
      !isValidUuid(args.workspaceId) ||
      !hasValidUpgradeOptions(args.options, args.workspaceId) ||
      !Number.isSafeInteger(args.index) ||
      !Number.isSafeInteger(args.total) ||
      args.index < 0 ||
      args.total < 1 ||
      args.index >= args.total ||
      Object.keys(args).some(
        (key) =>
          !['workspaceId', 'options', 'dataSource', 'index', 'total'].includes(
            key,
          ),
      ) ||
      !queryRunner ||
      queryRunner.isReleased ||
      !queryRunner.isTransactionActive ||
      queryRunner.manager?.queryRunner !== queryRunner ||
      typeof afterCommit !== 'function'
    )
      throw new Error(
        'Instagram apply requires an active bound pinned upgrade transaction',
      );

    const before = await this.pinnedSnapshotLoader.load(
      args.workspaceId,
      queryRunner,
    );
    const standardId =
      before.flatApplicationMaps.idByUniversalIdentifier[
        TWENTY_STANDARD_APPLICATION.universalIdentifier
      ];
    const creator =
      before.allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ];
    if (
      !standardId ||
      !creator ||
      creator.applicationId !== standardId ||
      creator.workspaceId !== args.workspaceId ||
      before.allFlatEntityMaps.flatObjectMetadataMaps.universalIdentifierById[
        creator.id
      ] !== creator.universalIdentifier
    )
      return fail();
    for (const uid of objectUids) {
      if (
        before.allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
          uid
        ]
      )
        fail();
    }

    // Direct manager-bound SQL catches duplicates invisible to the flat maps,
    // foreign owners, and even a legacy application with no currently visible objects.
    const manager = queryRunner.manager;
    const legacy = (await manager.query(
      'SELECT "id" FROM core."application" WHERE "workspaceId" = $1 AND "universalIdentifier" = $2::uuid',
      [args.workspaceId, LEGACY_INSTAGRAM_APPLICATION_UID],
    )) as { id: string }[];
    if (legacy.length) fail();
    const metadataQueries = [
      [
        'SELECT "universalIdentifier" FROM core."objectMetadata" WHERE "workspaceId" = $1 AND "universalIdentifier" = ANY($2::uuid[])',
        objectUids,
      ],
      [
        'SELECT "universalIdentifier" FROM core."fieldMetadata" WHERE "workspaceId" = $1 AND "universalIdentifier" = ANY($2::uuid[])',
        fieldUids,
      ],
      [
        'SELECT "universalIdentifier" FROM core."indexMetadata" WHERE "workspaceId" = $1 AND "universalIdentifier" = ANY($2::uuid[])',
        indexUids,
      ],
    ] as const;
    for (const [sql, uids] of metadataQueries) {
      const rows = (await manager.query(sql, [args.workspaceId, uids])) as {
        universalIdentifier: string;
      }[];
      if (rows.length) fail();
    }
    const physical = (await manager.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`,
      [before.schemaName, tableNames],
    )) as { relname: string }[];
    if (physical.length) fail();
    // Unknown metadata attached to the four desired object UIDs is rejected by
    // the complete-snapshot rebinder and the strict native pre-run guard.
    const creatorRowsBefore = (await manager.query(
      'SELECT to_jsonb(o) AS value FROM core."objectMetadata" o WHERE o."workspaceId" = $1 AND o."id" = $2::uuid',
      [args.workspaceId, creator.id],
    )) as { value: unknown }[];
    if (creatorRowsBefore.length !== 1) fail();
    const beforeVersion = (
      await manager.getRepository(WorkspaceEntity).findOneOrFail({
        select: ['metadataVersion'],
        where: { id: args.workspaceId },
        withDeleted: true,
      })
    ).metadataVersion;
    const ids =
      await this.synchronizeMyahStandardMetadataCommand.synchronizeAbsentInstagramInUpgradeTransaction(
        args,
        { queryRunner, afterCommit },
      );
    const after = await this.pinnedSnapshotLoader.load(
      args.workspaceId,
      queryRunner,
    );
    const afterVersion = (
      await manager.getRepository(WorkspaceEntity).findOneOrFail({
        select: ['metadataVersion'],
        where: { id: args.workspaceId },
        withDeleted: true,
      })
    ).metadataVersion;
    const creatorRowsAfter = (await manager.query(
      'SELECT to_jsonb(o) AS value FROM core."objectMetadata" o WHERE o."workspaceId" = $1 AND o."id" = $2::uuid',
      [args.workspaceId, creator.id],
    )) as { value: unknown }[];
    if (
      creatorRowsAfter.length !== 1 ||
      !isDeepStrictEqual(creatorRowsBefore[0].value, creatorRowsAfter[0].value)
    )
      fail();
    if (
      afterVersion !== beforeVersion + 1 ||
      after.allFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier
      ]?.id !== creator.id
    )
      fail();
    for (const [name, uids, map] of [
      [
        'objectMetadata',
        objectUids,
        after.allFlatEntityMaps.flatObjectMetadataMaps,
      ],
      [
        'fieldMetadata',
        fieldUids,
        after.allFlatEntityMaps.flatFieldMetadataMaps,
      ],
      ['index', indexUids, after.allFlatEntityMaps.flatIndexMaps],
    ] as const) {
      for (const uid of uids) {
        const entity = map.byUniversalIdentifier[uid];
        if (
          !entity ||
          entity.id !== ids[name][uid] ||
          entity.applicationId !== standardId ||
          entity.workspaceId !== args.workspaceId ||
          map.universalIdentifierById[entity.id] !== uid
        )
          fail();
      }
    }
    const installed = (await manager.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`,
      [before.schemaName, tableNames],
    )) as { relname: string }[];
    if (
      installed.length !== 4 ||
      installed.some(({ relname }) => !nativeNames.includes(relname))
    )
      fail();
    afterCommit(() => this.reconcileCommittedUpgrade(args.workspaceId));
  }

  // Recovery hook is DB-write-free and callable only after the outer receipt COMMIT.
  async reconcileCommittedUpgrade(workspaceId: string): Promise<void> {
    await this.workspaceCacheService.flush(workspaceId, [
      ...ALL_FLAT_ENTITY_MAPS_PROPERTIES,
      'flatApplicationMaps',
      'featureFlagsMap',
    ]);
    await this.metadataVersion.publishCommittedMetadataVersion(workspaceId);
  }
}
