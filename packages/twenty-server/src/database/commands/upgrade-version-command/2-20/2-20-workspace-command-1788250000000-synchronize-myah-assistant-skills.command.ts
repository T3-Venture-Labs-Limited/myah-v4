import { Command } from 'nest-commander';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
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

const MYAH_SKILL_UNIVERSAL_IDENTIFIERS: Record<string, true> = Object.fromEntries(
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
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
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
        { workspaceId },
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

    const skillsToCreate = standardMyahSkills.filter(
      (skill) =>
        !isDefined(
          existingSkillsByUniversalIdentifier[skill.universalIdentifier],
        ) && !isDefined(existingSkillsByName[skill.name]),
    );
    const skillsToUpdate = [
      ...standardMyahSkills,
      ...standardMyahBrandedExistingSkills,
    ].flatMap((standardSkill) => {
      const existingSkill =
        existingSkillsByUniversalIdentifier[standardSkill.universalIdentifier];

      if (
        !isDefined(existingSkill) ||
        !MYAH_SKILL_CONTROLLED_FIELDS.some(
          (fieldName) =>
            existingSkill[fieldName] !== standardSkill[fieldName],
        )
      ) {
        return [];
      }

      return [
        {
          ...existingSkill,
          ...Object.fromEntries(
            MYAH_SKILL_CONTROLLED_FIELDS.map((fieldName) => [
              fieldName,
              standardSkill[fieldName],
            ]),
          ),
        },
      ];
    });

    if (skillsToCreate.length === 0 && skillsToUpdate.length === 0) {
      return;
    }

    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would synchronize ${skillsToCreate.length + skillsToUpdate.length} Myah assistant skill(s) for workspace ${workspaceId}`,
      );

      return;
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          workspaceId,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          isSystemBuild: true,
          allFlatEntityOperationByMetadataName: {
            skill: {
              flatEntityToCreate: skillsToCreate,
              flatEntityToDelete: [],
              flatEntityToUpdate: skillsToUpdate,
            },
          },
        },
      );

    if (result.status === 'fail') {
      throw new Error(
        `Failed to synchronize Myah assistant skills for workspace ${workspaceId}`,
      );
    }
  }
}
