import { MODULE_METADATA } from '@nestjs/common/constants';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahAssistantSkillsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788250000000-synchronize-myah-assistant-skills.command';
import { RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790161829172-refresh-myah-assistant-skills-for-exact-approvals.command';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { type FlatSkill } from 'src/engine/metadata-modules/flat-skill/types/flat-skill.type';
import { STANDARD_SKILL } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-skill.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const ownerId = '20202020-0000-4000-8000-000000000002';
const args: RunOnWorkspaceArgs = {
  workspaceId,
  options: { dryRun: false },
  index: 0,
  total: 1,
};
const names = [
  'myah-inbox',
  'myah-creators',
  'myah-creator-lists',
  'myah-campaigns',
] as const;
const standard = () =>
  computeTwentyStandardApplicationAllFlatEntityMaps({
    now: '2026-09-03T00:00:00.000Z',
    workspaceId,
    twentyStandardApplicationId: ownerId,
  }).allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier;
const skills = () =>
  names.map((name) => standard()[STANDARD_SKILL[name].universalIdentifier]!);
const skillMaps = (rows: FlatSkill[]) => ({
  ...createEmptyAllFlatEntityMaps().flatSkillMaps,
  byUniversalIdentifier: Object.fromEntries(
    rows.map((row) => [row.universalIdentifier, row]),
  ),
});
const objectMaps = () => ({
  byUniversalIdentifier: {
    [MYAH_STANDARD_OBJECTS.creator.universalIdentifier]: { isActive: true },
    [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: { isActive: true },
  },
});
const fields = [
  'name',
  'label',
  'icon',
  'description',
  'content',
  'isCustom',
  'isActive',
] as const;

const createCommand = ({
  initial = [],
  objects = objectMaps(),
  CommandClass = SynchronizeMyahAssistantSkillsCommand,
}: {
  initial?: FlatSkill[];
  objects?: { byUniversalIdentifier: Record<string, { isActive: boolean }> };
  CommandClass?: typeof SynchronizeMyahAssistantSkillsCommand;
} = {}) => {
  let persisted = skillMaps(initial);
  const runner = {
    isTransactionActive: true,
    isReleased: false,
    manager: {},
  } as never;
  (runner as { manager: { queryRunner?: unknown } }).manager.queryRunner =
    runner;
  const snapshot = () => ({
    workspaceId,
    flatApplicationMaps: {
      idByUniversalIdentifier: {
        [TWENTY_STANDARD_APPLICATION.universalIdentifier]: ownerId,
      },
      byId: {
        [ownerId]: {
          universalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
        },
      },
    },
    allFlatEntityMaps: {
      flatObjectMetadataMaps: objects,
      flatSkillMaps: persisted,
    },
    featureFlagsMap: {},
  });
  const load = jest.fn().mockImplementation(async () => snapshot());
  const validateBuildAndRunWorkspaceMigrationFromTo = jest.fn(async (plan) => {
    const from = plan.fromToAllFlatEntityMaps.flatSkillMaps.from
      .byUniversalIdentifier as Record<string, FlatSkill>;
    const to = plan.fromToAllFlatEntityMaps.flatSkillMaps.to
      .byUniversalIdentifier as Record<string, FlatSkill>;
    const actions = Object.values(to).map((row) => {
      const old = from[row.universalIdentifier];
      if (!old) {
        const { id: _id, ...universal } = row;
        return {
          type: 'create',
          metadataName: 'skill',
          flatEntity: universal,
          id: plan.idByUniversalIdentifierByMetadataName.skill[
            row.universalIdentifier
          ],
        };
      }
      const changed = fields.filter((field) => old[field] !== row[field]);
      return {
        type: 'update',
        metadataName: 'skill',
        universalIdentifier: row.universalIdentifier,
        flatEntity: row,
        update: Object.fromEntries(changed.map((field) => [field, row[field]])),
        diff: Object.fromEntries(
          changed.map((field) => [
            field,
            { before: old[field], after: row[field] },
          ]),
        ),
      };
    });
    plan.assertBeforeRun({
      applicationUniversalIdentifier:
        TWENTY_STANDARD_APPLICATION.universalIdentifier,
      actions,
    });
    persisted = skillMaps([
      ...Object.values(persisted.byUniversalIdentifier),
      ...Object.values(to),
    ]);
    return { status: 'success', workspaceMigration: { actions } };
  });
  const getOrRecompute = jest
    .fn()
    .mockImplementation(async () => ({
      flatObjectMetadataMaps: objects,
      flatSkillMaps: persisted,
    }));
  const Command = CommandClass as unknown as new (
    ...constructorArgs: unknown[]
  ) => SynchronizeMyahAssistantSkillsCommand;
  const command = new Command(
    {} as WorkspaceIteratorService,
    {
      findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
        .fn()
        .mockResolvedValue({
          twentyStandardFlatApplication: {
            id: ownerId,
            universalIdentifier:
              TWENTY_STANDARD_APPLICATION.universalIdentifier,
          },
        }),
    },
    { validateBuildAndRunWorkspaceMigrationFromTo },
    { getOrRecompute, flush: jest.fn() },
    { load },
    { publishCommittedMetadataVersion: jest.fn() },
  );
  const run = () =>
    command.runOnWorkspaceInUpgradeTransaction(args, runner, jest.fn());
  return {
    command,
    run,
    load,
    getOrRecompute,
    validateBuildAndRunWorkspaceMigrationFromTo,
  };
};

const planFor = (mock: jest.Mock) => mock.mock.calls[0][0];
const rowsTo = (mock: jest.Mock): FlatSkill[] =>
  Object.values(
    planFor(mock).fromToAllFlatEntityMaps.flatSkillMaps.to
      .byUniversalIdentifier,
  );
const rowsFrom = (mock: jest.Mock): FlatSkill[] =>
  Object.values(
    planFor(mock).fromToAllFlatEntityMaps.flatSkillMaps.from
      .byUniversalIdentifier,
  );

describe('SynchronizeMyahAssistantSkillsCommand pinned rollout', () => {
  it('registers the rollout in its durable command and module', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahAssistantSkillsCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1788250000000 });
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        V2_20_UpgradeVersionCommandModule,
      ),
    ).toContain(SynchronizeMyahAssistantSkillsCommand);
  });

  it('creates all four missing skills only when canonical objects exist, with mapped native physical IDs', async () => {
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand();
    await run();
    expect(
      rowsTo(validate)
        .map((row) => row.name)
        .sort(),
    ).toEqual([...names].sort());
    expect(rowsFrom(validate)).toHaveLength(0);
    const plan = planFor(validate);
    expect(plan.buildOptions).toEqual({
      applicationUniversalIdentifier:
        TWENTY_STANDARD_APPLICATION.universalIdentifier,
      isSystemBuild: true,
    });
    for (const row of rowsTo(validate))
      expect(
        plan.idByUniversalIdentifierByMetadataName.skill[
          row.universalIdentifier
        ],
      ).toBe(row.id);
  });

  it.each([1, 2, 3])('creates only %i missing skills', async (count) => {
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ initial: skills().slice(0, count) });
    await run();
    expect(rowsTo(validate)).toHaveLength(4 - count);
    expect(rowsFrom(validate)).toHaveLength(0);
  });

  it('updates only controlled fields while preserving physical ID and createdAt', async () => {
    const existing = {
      ...skills()[0],
      id: 'persisted-skill-id',
      label: 'Outdated label',
      content: 'Outdated content',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ initial: [existing] });
    await run();
    expect(rowsFrom(validate)).toEqual([
      expect.objectContaining({ id: existing.id, content: existing.content }),
    ]);
    expect(rowsTo(validate)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: existing.id,
          name: 'myah-inbox',
          label: 'Myah Inbox',
          createdAt: existing.createdAt,
        }),
      ]),
    );
    expect(rowsTo(validate)).toHaveLength(4);
  });

  it('does not mutate a non-Myah workspace', async () => {
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ objects: { byUniversalIdentifier: {} } });
    await run();
    expect(validate).not.toHaveBeenCalled();
  });

  it.each([
    MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
  ])('does not mutate when canonical object %s is inactive', async (uid) => {
    const objects = objectMaps();
    objects.byUniversalIdentifier[uid].isActive = false;
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ objects });
    await run();
    expect(validate).not.toHaveBeenCalled();
  });

  it('leaves unrelated custom skills untouched', async () => {
    const custom = {
      ...skills()[0],
      universalIdentifier: '20202020-1560-4001-8001-999999999999',
      name: 'my-personal-inbox-workflow',
      isCustom: true,
    };
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ initial: [custom] });
    await run();
    expect(rowsTo(validate)).toHaveLength(4);
    expect(rowsFrom(validate)).toHaveLength(0);
  });

  it('respects reserved-name conflicts without changing the user-created skill', async () => {
    const custom = {
      ...skills()[0],
      universalIdentifier: '20202020-1560-4001-8001-999999999999',
      name: 'myah-inbox',
      isCustom: true,
    };
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ initial: [custom] });
    await run();
    expect(rowsTo(validate)).toHaveLength(3);
    expect(rowsTo(validate).some((row) => row.name === 'myah-inbox')).toBe(
      false,
    );
    expect(rowsFrom(validate)).toHaveLength(0);
  });

  it('preserves read-only CLI dry-run count', async () => {
    const {
      command,
      getOrRecompute,
      validateBuildAndRunWorkspaceMigrationFromTo: validate,
    } = createCommand();
    const log = jest
      .spyOn(command['logger'], 'log')
      .mockImplementation(() => undefined);
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(getOrRecompute).toHaveBeenCalledTimes(1);
    expect(validate).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      `[DRY RUN] Would synchronize 4 Myah assistant skill(s) for workspace ${workspaceId}`,
    );
  });

  it('updates branded code-interpreter only when it already exists', async () => {
    const interpreter =
      standard()[STANDARD_SKILL['code-interpreter'].universalIdentifier]!;
    const existing = {
      ...interpreter,
      id: 'persisted-code-interpreter-id',
      content: '## Calling Twenty Tools from Python (MCP Bridge)',
    };
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ initial: [...skills(), existing] });
    await run();
    expect(rowsFrom(validate)).toEqual([
      expect.objectContaining({ id: existing.id, content: existing.content }),
    ]);
    expect(rowsTo(validate)).toEqual([
      expect.objectContaining({
        id: existing.id,
        name: 'code-interpreter',
        content: expect.stringContaining(
          '## Calling Myah Tools from Python (MCP Bridge)',
        ),
      }),
    ]);
  });

  it('replaces only old approval text and preserves drifted content/metadata without creating missing skills', async () => {
    const old =
      'Call request_approval immediately before every internal/generated write in its own step; after approval, execute exactly that one write and read back its returned state. Never authorize or describe more than one write tool call in the same approval.';
    const updated =
      "Call request_approval immediately before every internal/generated write in its own step, with toolName and the exact proposedArguments (learn the write tool's schema first); after approval, execute exactly that one write with the identical arguments and read back its returned state. If the approved write is refused, do not retry with changes; propose it again for a new approval. Never authorize or describe more than one write tool call in the same approval.";
    const [first, second] = skills();
    const drift = {
      ...first,
      id: 'persisted-id',
      label: 'Custom label',
      description: 'Custom description',
      content: `${first.content.split(updated).join(old)}\nCustom send instructions`,
    };
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({
        initial: [drift, second],
        CommandClass:
          RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand,
      });
    await run();
    expect(rowsTo(validate)).toEqual([
      { ...drift, content: drift.content.split(old).join(updated) },
    ]);
    expect(rowsFrom(validate)).toEqual([drift]);
    expect(
      planFor(validate).idByUniversalIdentifierByMetadataName.skill,
    ).toEqual({});
  });

  it('does not rewrite instructions lacking the previous wording', async () => {
    const existing = {
      ...skills()[0],
      label: 'Custom label',
      content: 'Deliberately customized instructions without old wording',
    };
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({
        initial: [existing],
        CommandClass:
          RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand,
      });
    await run();
    expect(validate).not.toHaveBeenCalled();
  });

  it('is a no-op on a second pinned invocation after the four skills exist', async () => {
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand();
    await run();
    await run();
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign ownership for an existing canonical skill before native writes', async () => {
    const foreign = {
      ...skills()[0],
      applicationId: 'foreign-owner',
      applicationUniversalIdentifier: 'foreign-owner',
      content: 'old',
    };
    const { run, validateBuildAndRunWorkspaceMigrationFromTo: validate } =
      createCommand({ initial: [foreign] });
    await expect(run()).rejects.toThrow(/source owner mismatch/);
    expect(validate).not.toHaveBeenCalled();
  });

  it('rejects success when a native create persisted under the wrong physical ID', async () => {
    const {
      command,
      load,
      validateBuildAndRunWorkspaceMigrationFromTo: validate,
    } = createCommand();
    // First load is the pinned source; subsequent loads model a native write with a different ID.
    const first = await load(workspaceId);
    load
      .mockReset()
      .mockResolvedValueOnce(first)
      .mockImplementation(async () => ({
        ...first,
        allFlatEntityMaps: {
          ...first.allFlatEntityMaps,
          flatSkillMaps: skillMaps(
            rowsTo(validate).map((row) => ({
              ...row,
              id: '20202020-0000-4000-8000-000000000099',
            })),
          ),
        },
      }));
    const runner = {
      isTransactionActive: true,
      isReleased: false,
      manager: {},
    } as never;
    (runner as { manager: { queryRunner?: unknown } }).manager.queryRunner =
      runner;
    const afterCommit = jest.fn();
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
    ).rejects.toThrow(/write did not persist/);
    expect(afterCommit).not.toHaveBeenCalled();
  });
});
