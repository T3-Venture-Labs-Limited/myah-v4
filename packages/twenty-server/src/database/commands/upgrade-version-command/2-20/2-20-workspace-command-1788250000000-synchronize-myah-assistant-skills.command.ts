import { isDeepStrictEqual } from 'node:util';

import { Command } from 'nest-commander';
import { type QueryRunner } from 'typeorm';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { PinnedWorkspaceMetadataSnapshotLoaderService } from 'src/database/commands/upgrade-version-command/2-20/services/pinned-workspace-metadata-snapshot-loader.service';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { ALL_FLAT_ENTITY_MAPS_PROPERTIES } from 'src/engine/metadata-modules/flat-entity/constant/all-flat-entity-maps-properties.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { type WorkspaceMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration.type';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type FlatSkill } from 'src/engine/metadata-modules/flat-skill/types/flat-skill.type';
import { STANDARD_SKILL } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-skill.constant';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const MYAH_SKILL_NAMES = [
  'myah-inbox',
  'myah-creators',
  'myah-creator-lists',
  'myah-campaigns',
] as const;

const MYAH_BRANDED_EXISTING_SKILL_NAMES = ['code-interpreter'] as const;

const MYAH_SKILL_UNIVERSAL_IDENTIFIERS: Record<string, true> =
  Object.fromEntries(
    MYAH_SKILL_NAMES.map((skillName) => [
      STANDARD_SKILL[skillName].universalIdentifier,
      true,
    ]),
  );

const MYAH_BRANDED_EXISTING_SKILL_UNIVERSAL_IDENTIFIERS: Record<string, true> =
  Object.fromEntries(
    MYAH_BRANDED_EXISTING_SKILL_NAMES.map((skillName) => [
      STANDARD_SKILL[skillName].universalIdentifier,
      true,
    ]),
  );

const MYAH_SKILL_CONTROLLED_FIELDS = [
  'name',
  'label',
  'icon',
  'description',
  'content',
  'isCustom',
  'isActive',
] as const satisfies readonly (keyof FlatSkill)[];

const collectSkills = (skills: FlatSkill[]): FlatEntityMaps<FlatSkill> =>
  skills.reduce<FlatEntityMaps<FlatSkill>>(
    (maps, flatEntity) =>
      addFlatEntityToFlatEntityMapsOrThrow({
        flatEntityMaps: maps,
        flatEntity,
      }),
    createEmptyFlatEntityMaps(),
  );

export const assertPinnedAssistantSkillActions = ({
  migration,
  creates,
  updates,
  current,
  ownerId,
}: {
  migration: WorkspaceMigration;
  creates: FlatSkill[];
  updates: FlatSkill[];
  current: FlatEntityMaps<FlatSkill>;
  ownerId: string;
}): void => {
  if (
    migration.applicationUniversalIdentifier !==
      TWENTY_STANDARD_APPLICATION.universalIdentifier ||
    migration.actions.length !== creates.length + updates.length
  )
    throw new Error('Unsafe pinned assistant skill action count or owner');
  const plannedCreates = new Map(
    creates.map((skill) => [skill.universalIdentifier, skill]),
  );
  const plannedUpdates = new Map(
    updates.map((skill) => [skill.universalIdentifier, skill]),
  );
  const seen = new Set<string>();
  for (const action of migration.actions) {
    const uid =
      action.type === 'create'
        ? action.flatEntity.universalIdentifier
        : action.universalIdentifier;
    const native = action.flatEntity as FlatSkill | undefined;
    if (
      action.metadataName !== 'skill' ||
      action.type === 'delete' ||
      seen.has(uid) ||
      !native ||
      native.universalIdentifier !== uid ||
      native.applicationUniversalIdentifier !==
        TWENTY_STANDARD_APPLICATION.universalIdentifier ||
      (native.applicationId !== undefined && native.applicationId !== ownerId)
    )
      throw new Error('Unsafe pinned assistant skill native action');
    const before = current.byUniversalIdentifier[uid];
    if (action.type === 'create') {
      const planned = plannedCreates.get(uid);
      if (
        !planned ||
        before ||
        action.id !== planned.id ||
        ('id' in native &&
          native.id !== undefined &&
          native.id !== planned.id) ||
        !isDeepStrictEqual(native.name, planned.name) ||
        !MYAH_SKILL_CONTROLLED_FIELDS.every((field) =>
          isDeepStrictEqual(native[field], planned[field]),
        )
      )
        throw new Error('Unsafe pinned assistant skill creation');
    } else {
      const planned = plannedUpdates.get(uid);
      if (
        !planned ||
        !before ||
        before.id !== planned.id ||
        before.applicationId !== ownerId ||
        before.applicationUniversalIdentifier !==
          TWENTY_STANDARD_APPLICATION.universalIdentifier ||
        (native.id !== undefined && native.id !== before.id) ||
        !Object.keys(action.update).length ||
        Object.keys(action.update).some(
          (field) =>
            !MYAH_SKILL_CONTROLLED_FIELDS.includes(
              field as (typeof MYAH_SKILL_CONTROLLED_FIELDS)[number],
            ) ||
            !isDeepStrictEqual(
              action.update[field as keyof typeof action.update],
              planned[field as keyof FlatSkill],
            ),
        ) ||
        !action.diff ||
        !isDeepStrictEqual(
          Object.keys(action.update).sort(),
          Object.keys(action.diff ?? {}).sort(),
        ) ||
        Object.entries(action.diff ?? {}).some(
          ([field, diff]) =>
            !isDeepStrictEqual(diff, {
              before: before[field as keyof FlatSkill],
              after: planned[field as keyof FlatSkill],
            }),
        ) ||
        !MYAH_SKILL_CONTROLLED_FIELDS.every((field) =>
          isDeepStrictEqual(native[field], planned[field]),
        )
      )
        throw new Error('Unsafe pinned assistant skill update');
    }
    seen.add(uid);
  }
};

@RegisteredWorkspaceCommand('2.20.0', 1788250000000)
@Command({
  name: 'upgrade:2-20:synchronize-myah-assistant-skills',
  description:
    'Synchronize source-controlled Myah assistant skills for existing workspaces',
})
export class SynchronizeMyahAssistantSkillsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly pinnedSnapshotLoader: PinnedWorkspaceMetadataSnapshotLoaderService,
    private readonly metadataVersion: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  protected readonly createMissingSkills: boolean = true;

  protected buildSkillUpdate(
    existingSkill: FlatSkill,
    standardSkill: FlatSkill,
  ): FlatSkill | undefined {
    if (
      !MYAH_SKILL_CONTROLLED_FIELDS.some(
        (fieldName) => existingSkill[fieldName] !== standardSkill[fieldName],
      )
    ) {
      return undefined;
    }

    return {
      ...existingSkill,
      ...Object.fromEntries(
        MYAH_SKILL_CONTROLLED_FIELDS.map((fieldName) => [
          fieldName,
          standardSkill[fieldName],
        ]),
      ),
    };
  }

  override async runOnWorkspaceInUpgradeTransaction(
    { workspaceId, options }: RunOnWorkspaceArgs,
    queryRunner: QueryRunner,
    afterCommit: (effect: () => Promise<void> | void) => void,
  ): Promise<void> {
    if (
      options.dryRun ||
      !queryRunner?.isTransactionActive ||
      queryRunner.isReleased ||
      queryRunner.manager?.queryRunner !== queryRunner ||
      typeof afterCommit !== 'function'
    )
      throw new Error(
        'Assistant skill refresh requires a pinned upgrade transaction',
      );
    const snapshot = await this.pinnedSnapshotLoader.load(
      workspaceId,
      queryRunner,
    );
    const ownerId =
      snapshot.flatApplicationMaps.idByUniversalIdentifier[
        TWENTY_STANDARD_APPLICATION.universalIdentifier
      ];
    if (
      !ownerId ||
      snapshot.flatApplicationMaps.byId[ownerId]?.universalIdentifier !==
        TWENTY_STANDARD_APPLICATION.universalIdentifier
    )
      throw new Error('Pinned assistant skill Standard owner missing');
    const { flatObjectMetadataMaps, flatSkillMaps } =
      snapshot.allFlatEntityMaps;
    if (
      ![
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      ].every(
        (uid) =>
          flatObjectMetadataMaps.byUniversalIdentifier[uid]?.isActive === true,
      )
    )
      return;
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: new Date().toISOString(),
        workspaceId,
        twentyStandardApplicationId: ownerId,
      });
    const standardSkills = Object.values(
      allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier,
    ).filter(
      (skill): skill is FlatSkill =>
        isDefined(skill) &&
        MYAH_SKILL_UNIVERSAL_IDENTIFIERS[skill.universalIdentifier] === true,
    );
    const branded = Object.values(
      allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier,
    ).filter(
      (skill): skill is FlatSkill =>
        isDefined(skill) &&
        MYAH_BRANDED_EXISTING_SKILL_UNIVERSAL_IDENTIFIERS[
          skill.universalIdentifier
        ] === true,
    );
    const existingByUid = flatSkillMaps.byUniversalIdentifier;
    const existingNames = new Set(
      Object.values(existingByUid)
        .filter(isDefined)
        .map((skill) => skill.name),
    );
    const creates = this.createMissingSkills
      ? standardSkills.filter(
          (skill) =>
            !existingByUid[skill.universalIdentifier] &&
            !existingNames.has(skill.name),
        )
      : [];
    const updates = [...standardSkills, ...branded].flatMap((standardSkill) => {
      const existing = existingByUid[standardSkill.universalIdentifier];
      if (!existing) return [];
      // A foreign-owned skill is never imported into Standard via a refresh.
      if (
        existing.applicationId !== ownerId ||
        existing.applicationUniversalIdentifier !==
          TWENTY_STANDARD_APPLICATION.universalIdentifier
      )
        throw new Error('Pinned assistant skill source owner mismatch');
      const updated = this.buildSkillUpdate(existing, standardSkill);
      return updated ? [updated] : [];
    });
    if (!creates.length && !updates.length) return;
    const from = collectSkills(
      updates.map((skill) =>
        structuredClone(existingByUid[skill.universalIdentifier]!),
      ),
    );
    const to = collectSkills(
      [...creates, ...updates].map((skill) => structuredClone(skill)),
    );
    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo(
        {
          workspaceId,
          buildOptions: {
            applicationUniversalIdentifier:
              TWENTY_STANDARD_APPLICATION.universalIdentifier,
            isSystemBuild: true,
          },
          fromToAllFlatEntityMaps: { flatSkillMaps: { from, to } },
          idByUniversalIdentifierByMetadataName: {
            skill: Object.fromEntries(
              creates.map((skill) => [skill.universalIdentifier, skill.id]),
            ),
          },
          dependencyAllFlatEntityMaps: structuredClone(
            snapshot.allFlatEntityMaps,
          ),
          additionalCacheDataMaps: {
            featureFlagsMap: snapshot.featureFlagsMap,
          },
          pinnedSnapshot: snapshot,
          upgradeTransaction: { queryRunner, afterCommit },
          assertBeforeRun: (migration) =>
            assertPinnedAssistantSkillActions({
              migration,
              creates,
              updates,
              current: flatSkillMaps,
              ownerId,
            }),
        },
      );
    if (result.status === 'fail')
      throw new Error('Pinned assistant skill native validation failed');
    // A receipt cannot stand in for an omitted write, including a builder that returns no actions.
    const persisted = (
      await this.pinnedSnapshotLoader.load(workspaceId, queryRunner)
    ).allFlatEntityMaps.flatSkillMaps;
    for (const skill of [...creates, ...updates]) {
      const row = persisted.byUniversalIdentifier[skill.universalIdentifier];
      if (
        !row ||
        row.id !== skill.id ||
        row.applicationId !== ownerId ||
        !MYAH_SKILL_CONTROLLED_FIELDS.every((field) =>
          isDeepStrictEqual(row[field], skill[field]),
        )
      )
        throw new Error('Pinned assistant skill write did not persist');
    }
    afterCommit(async () => {
      await this.workspaceCacheService.flush(workspaceId, [
        ...ALL_FLAT_ENTITY_MAPS_PROPERTIES,
        'flatApplicationMaps',
        'featureFlagsMap',
      ]);
      await this.metadataVersion.publishCommittedMetadataVersion(workspaceId);
    });
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!options.dryRun)
      throw new Error(
        'Assistant skill refresh requires a pinned upgrade transaction',
      );
    const { flatObjectMetadataMaps, flatSkillMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatSkillMaps',
      ]);

    if (
      ![
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      ].every(
        (universalIdentifier) =>
          flatObjectMetadataMaps.byUniversalIdentifier[universalIdentifier]
            ?.isActive === true,
      )
    ) {
      return;
    }

    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        {
          workspaceId,
        },
      );
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: new Date().toISOString(),
        workspaceId,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });
    const standardMyahSkills = Object.values(
      allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier,
    ).filter(
      (skill): skill is FlatSkill =>
        isDefined(skill) &&
        MYAH_SKILL_UNIVERSAL_IDENTIFIERS[skill.universalIdentifier] === true,
    );
    const standardMyahBrandedExistingSkills = Object.values(
      allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier,
    ).filter(
      (skill): skill is FlatSkill =>
        isDefined(skill) &&
        MYAH_BRANDED_EXISTING_SKILL_UNIVERSAL_IDENTIFIERS[
          skill.universalIdentifier
        ] === true,
    );
    const existingSkillsByUniversalIdentifier =
      flatSkillMaps.byUniversalIdentifier;
    const existingSkillsByName = Object.fromEntries(
      Object.values(existingSkillsByUniversalIdentifier).flatMap((skill) =>
        isDefined(skill) ? [[skill.name, skill]] : [],
      ),
    );
    const conflictingSkillNames = standardMyahSkills.flatMap((skill) =>
      !isDefined(
        existingSkillsByUniversalIdentifier[skill.universalIdentifier],
      ) && isDefined(existingSkillsByName[skill.name])
        ? [skill.name]
        : [],
    );

    for (const skillName of conflictingSkillNames) {
      this.logger.warn(
        `Skipping source-controlled skill "${skillName}" because an existing skill already uses that name in workspace ${workspaceId}`,
      );
    }

    const skillsToCreate = this.createMissingSkills
      ? standardMyahSkills.filter(
          (skill) =>
            !isDefined(
              existingSkillsByUniversalIdentifier[skill.universalIdentifier],
            ) && !isDefined(existingSkillsByName[skill.name]),
        )
      : [];
    const skillsToUpdate = [
      ...standardMyahSkills,
      ...standardMyahBrandedExistingSkills,
    ].flatMap((standardSkill) => {
      const existingSkill =
        existingSkillsByUniversalIdentifier[standardSkill.universalIdentifier];
      const updatedSkill = isDefined(existingSkill)
        ? this.buildSkillUpdate(existingSkill, standardSkill)
        : undefined;

      return isDefined(updatedSkill) ? [updatedSkill] : [];
    });

    if (skillsToCreate.length === 0 && skillsToUpdate.length === 0) {
      return;
    }

    this.logger.log(
      `[DRY RUN] Would synchronize ${skillsToCreate.length + skillsToUpdate.length} Myah assistant skill(s) for workspace ${workspaceId}`,
    );
  }
}
