import { MODULE_METADATA } from '@nestjs/common/constants';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahAssistantSkillsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788250000000-synchronize-myah-assistant-skills.command';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';

import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { STANDARD_SKILL } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-skill.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const workspaceId = '20202020-0000-0000-0000-000000000001';
const twentyStandardApplicationId = '20202020-0000-0000-0000-000000000002';
const myahSkillNames = [
  'myah-inbox',
  'myah-creators',
  'myah-creator-lists',
  'myah-campaigns',
] as const;

const args: RunOnWorkspaceArgs = {
  workspaceId,
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const getStandardMyahSkills = () => {
  const { allFlatEntityMaps } =
    computeTwentyStandardApplicationAllFlatEntityMaps({
      now: '2026-09-03T00:00:00.000Z',
      workspaceId,
      twentyStandardApplicationId,
    });

  return myahSkillNames.flatMap((skillName) => {
    const skill =
      allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier[
        STANDARD_SKILL[skillName].universalIdentifier
      ];

    return skill ? [skill] : [];
  });
};

const createCanonicalObjectMaps = (): {
  byUniversalIdentifier: Record<
    string,
    { universalIdentifier: string; isActive: boolean }
  >;
} => ({
  byUniversalIdentifier: {
    [MYAH_STANDARD_OBJECTS.creator.universalIdentifier]: {
      universalIdentifier: MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
      isActive: true,
    },
    [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {
      universalIdentifier: MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      isActive: true,
    },
  },
});


const createSkillMaps = (skills: readonly Record<string, unknown>[]) => ({
  ...createEmptyAllFlatEntityMaps().flatSkillMaps,
  byUniversalIdentifier: Object.fromEntries(
    skills.map((skill) => [skill.universalIdentifier as string, skill]),
  ),
});

describe('SynchronizeMyahAssistantSkillsCommand', () => {
  const applicationService = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({
        twentyStandardFlatApplication: {
          id: twentyStandardApplicationId,
          universalIdentifier: '20202020-0000-0000-0000-000000000003',
        },
      }),
  };
  const Command = SynchronizeMyahAssistantSkillsCommand as unknown as new (
    ...constructorArgs: unknown[]
  ) => SynchronizeMyahAssistantSkillsCommand;

  const createCommand = ({
    flatObjectMetadataMaps = createCanonicalObjectMaps(),
    flatSkillMaps = createSkillMaps([]),
  }: {
    flatObjectMetadataMaps?: unknown;
    flatSkillMaps?: unknown;
  } = {}) => {
    const validateBuildAndRunWorkspaceMigration = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const getOrRecompute = jest.fn().mockResolvedValue({
      flatObjectMetadataMaps,
      flatSkillMaps,
    });
    const command = new Command(
      {} as WorkspaceIteratorService,
      applicationService,

      { validateBuildAndRunWorkspaceMigration },
      { getOrRecompute },
    );

    return { command, getOrRecompute, validateBuildAndRunWorkspaceMigration };
  };

  it('registers the source-controlled Myah skill rollout', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(SynchronizeMyahAssistantSkillsCommand),
    ).toMatchObject({ version: '2.20.0', timestamp: 1788250000000 });
  });
  it('registers the rollout in the active 2.20 command module', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(SynchronizeMyahAssistantSkillsCommand);
  });

  it('creates all four missing skills only when canonical Myah objects exist', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand();

    await command.runOnWorkspace(args);

    expect(validateBuildAndRunWorkspaceMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        isSystemBuild: true,
        allFlatEntityOperationByMetadataName: {
          skill: expect.objectContaining({
            flatEntityToCreate: expect.arrayContaining(
              myahSkillNames.map((name) =>
                expect.objectContaining({ name }),
              ),
            ),
            flatEntityToDelete: [],
            flatEntityToUpdate: [],
          }),
        },
      }),
    );
  });

  it.each([1, 2, 3])(
    'creates only the %i missing source-controlled skill(s)',
    async (existingSkillCount) => {
      const { command, validateBuildAndRunWorkspaceMigration } = createCommand({
        flatSkillMaps: createSkillMaps(getStandardMyahSkills().slice(0, existingSkillCount)),
      });

      await command.runOnWorkspace(args);

      const migration = validateBuildAndRunWorkspaceMigration.mock.calls[0][0];
      expect(
        migration.allFlatEntityOperationByMetadataName.skill.flatEntityToCreate,
      ).toHaveLength(4 - existingSkillCount);
      expect(
        migration.allFlatEntityOperationByMetadataName.skill.flatEntityToUpdate,
      ).toEqual([]);
    },
  );

  it('updates controlled fields of existing source-controlled Myah skills', async () => {
    const [existingSkill] = getStandardMyahSkills();
    const persistedSkill = {
      ...existingSkill,
      id: 'persisted-skill-id',
      label: 'Outdated label',
      content: 'Outdated content',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand({
      flatSkillMaps: createSkillMaps([persistedSkill]),
    });

    await command.runOnWorkspace(args);

    const updates =
      validateBuildAndRunWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName.skill.flatEntityToUpdate;
    expect(updates).toEqual([
      expect.objectContaining({
        id: persistedSkill.id,
        universalIdentifier: persistedSkill.universalIdentifier,
        name: 'myah-inbox',
        label: 'Myah Inbox',
        createdAt: persistedSkill.createdAt,
      }),
    ]);
    expect(
      validateBuildAndRunWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName.skill.flatEntityToCreate,
    ).toHaveLength(3);
  });

  it('does not mutate a non-Myah workspace', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand({
      flatObjectMetadataMaps:
        createEmptyAllFlatEntityMaps().flatObjectMetadataMaps,
    });

    await command.runOnWorkspace(args);

    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
  });

  it.each([
    MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
  ])('does not mutate when canonical Myah object %s is inactive', async (
    universalIdentifier,
  ) => {
    const objectMaps = createCanonicalObjectMaps();
    objectMaps.byUniversalIdentifier[universalIdentifier] = {
      universalIdentifier,
      isActive: false,
    };
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand({
      flatObjectMetadataMaps: objectMaps,
    });

    await command.runOnWorkspace(args);

    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('leaves user-created skills with different universal identifiers untouched', async () => {
    const userSkill = {
      ...getStandardMyahSkills()[0],
      id: 'user-skill-id',
      universalIdentifier: '20202020-1560-4001-8001-999999999999',
      name: 'my-personal-inbox-workflow',
      isCustom: true,
    };
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand({
      flatSkillMaps: createSkillMaps([userSkill]),
    });

    await command.runOnWorkspace(args);

    const migration = validateBuildAndRunWorkspaceMigration.mock.calls[0][0];
    expect(migration.allFlatEntityOperationByMetadataName.skill.flatEntityToCreate).toHaveLength(4);
    expect(migration.allFlatEntityOperationByMetadataName.skill.flatEntityToUpdate).toEqual([]);
  });

  it('leaves a user-created skill with a reserved Myah name untouched', async () => {
    const userSkill = {
      ...getStandardMyahSkills()[0],
      id: 'user-skill-id',
      universalIdentifier: '20202020-1560-4001-8001-999999999999',
      name: 'myah-inbox',
      isCustom: true,
    };
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand({
      flatSkillMaps: createSkillMaps([userSkill]),
    });
    const warning = jest
      .spyOn(command['logger'], 'warn')
      .mockImplementation(() => undefined);

    await command.runOnWorkspace(args);

    const migration = validateBuildAndRunWorkspaceMigration.mock.calls[0][0];

    expect(
      migration.allFlatEntityOperationByMetadataName.skill.flatEntityToCreate,
    ).toHaveLength(3);
    expect(
      migration.allFlatEntityOperationByMetadataName.skill.flatEntityToUpdate,
    ).toEqual([]);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping source-controlled skill "myah-inbox" because an existing skill already uses that name',
      ),
    );
  });

  it('reports dry-run operations without mutating metadata', async () => {
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand();
    const log = jest
      .spyOn(command['logger'], 'log')
      .mockImplementation(() => undefined);

    await command.runOnWorkspace({ ...args, options: { dryRun: true } });

    expect(validateBuildAndRunWorkspaceMigration).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      `[DRY RUN] Would synchronize 4 Myah assistant skill(s) for workspace ${workspaceId}`,
    );
  });

  it('refreshes the existing code-interpreter skill with Myah branding without creating it', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-09-03T00:00:00.000Z',
        workspaceId,
        twentyStandardApplicationId,
      });
    const standardCodeInterpreter =
      allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier[
        STANDARD_SKILL['code-interpreter'].universalIdentifier
      ];

    expect(standardCodeInterpreter).toBeDefined();

    const persistedCodeInterpreter = {
      ...standardCodeInterpreter,
      id: 'persisted-code-interpreter-id',
      content: '## Calling Twenty Tools from Python (MCP Bridge)',
    };
    const { command, validateBuildAndRunWorkspaceMigration } = createCommand({
      flatSkillMaps: createSkillMaps([
        ...getStandardMyahSkills(),
        persistedCodeInterpreter,
      ]),
    });

    await command.runOnWorkspace(args);

    const skillOperations =
      validateBuildAndRunWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName.skill;

    expect(skillOperations.flatEntityToCreate).toEqual([]);
    expect(skillOperations.flatEntityToUpdate).toEqual([
      expect.objectContaining({
        id: persistedCodeInterpreter.id,
        name: 'code-interpreter',
        content: expect.stringContaining(
          '## Calling Myah Tools from Python (MCP Bridge)',
        ),
      }),
    ]);
  });

  it('is a no-op on the second run after all four skills exist', async () => {
    const { command, getOrRecompute, validateBuildAndRunWorkspaceMigration } =
      createCommand();
    getOrRecompute.mockResolvedValueOnce({
      flatObjectMetadataMaps: createCanonicalObjectMaps(),
      flatSkillMaps: createSkillMaps([]),
    });
    getOrRecompute.mockResolvedValueOnce({
      flatObjectMetadataMaps: createCanonicalObjectMaps(),
      flatSkillMaps: createSkillMaps(getStandardMyahSkills()),
    });

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    expect(validateBuildAndRunWorkspaceMigration).toHaveBeenCalledTimes(1);
  });
});
