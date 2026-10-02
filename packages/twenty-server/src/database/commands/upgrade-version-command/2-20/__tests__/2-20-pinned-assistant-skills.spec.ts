import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { enrichCreateWorkspaceMigrationActionsWithIds } from 'src/engine/workspace-manager/workspace-migration/services/utils/enrich-create-workspace-migration-action-with-ids.util';
import { WorkspaceMigrationSkillActionsBuilderService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/builders/skill/workspace-migration-skill-actions-builder.service';
import { CreateSkillActionHandlerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/action-handlers/skill/services/create-skill-action-handler.service';

import { assertPinnedAssistantSkillActions } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788250000000-synchronize-myah-assistant-skills.command';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { internalWriteApproval } from 'src/engine/workspace-manager/twenty-standard-application/utils/skill-metadata/myah-standard-skill-builders.util';
import { RefreshMyahAssistantSkillsWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789645911006-refresh-myah-assistant-skills.command';
import { RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790161829172-refresh-myah-assistant-skills-for-exact-approvals.command';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const ownerId = '20202020-0000-4000-8000-000000000002';
const withoutPhysicalId = <T extends { id: string }>(
  skill: T,
): Omit<T, 'id'> => {
  const { id: _id, ...universal } = skill;
  return universal;
};
const previousApproval =
  'Call request_approval immediately before every internal/generated write in its own step; after approval, execute exactly that one write and read back its returned state. Never authorize or describe more than one write tool call in the same approval.';

const fixture = () => {
  const generated = computeTwentyStandardApplicationAllFlatEntityMaps({
    now: '2026-09-27T00:00:00.000Z',
    workspaceId,
    twentyStandardApplicationId: ownerId,
  }).allFlatEntityMaps;
  const skills = structuredClone(generated.flatSkillMaps);
  const inbox = Object.values(skills.byUniversalIdentifier).find(
    (skill) => skill?.name === 'myah-inbox',
  )!;
  inbox.content = `${previousApproval}\nExisting customer content`;
  const standardInbox = Object.values(
    generated.flatSkillMaps.byUniversalIdentifier,
  ).find((skill) => skill?.name === 'myah-inbox')!;
  const campaign = Object.values(skills.byUniversalIdentifier).find(
    (skill) => skill?.name === 'myah-campaigns',
  )!;
  delete skills.byUniversalIdentifier[campaign.universalIdentifier];
  delete skills.universalIdentifierById[campaign.id];
  skills.universalIdentifiersByApplicationId[ownerId] =
    skills.universalIdentifiersByApplicationId[ownerId]?.filter(
      (uid) => uid !== campaign.universalIdentifier,
    );
  const snapshot = {
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
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {
          [MYAH_STANDARD_OBJECTS.creator.universalIdentifier]: {
            isActive: true,
          },
          [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {
            isActive: true,
          },
        },
      },
      flatSkillMaps: skills,
    },
    featureFlagsMap: {},
  };
  return { snapshot, inbox, campaign, standardInbox };
};

describe.each([
  RefreshMyahAssistantSkillsWorkspaceCommand,
  RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand,
])('%s pinned upgrade entry', (Command) => {
  it('refuses an unpinned write and an inactive runner without touching shared caches', async () => {
    const cache = { getOrRecompute: jest.fn() };
    const command = new Command(
      {} as never,
      {} as never,
      {} as never,
      cache as never,
      { load: jest.fn() } as never,
      {} as never,
    );
    await expect(
      command.runOnWorkspace({
        workspaceId,
        options: { dryRun: false },
      } as never),
    ).rejects.toThrow(/pinned upgrade transaction/);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { workspaceId, options: { dryRun: false } } as never,
        { isTransactionActive: false, isReleased: false } as never,
        jest.fn(),
      ),
    ).rejects.toThrow(/pinned upgrade transaction/);
    expect(cache.getOrRecompute).not.toHaveBeenCalled();
  });

  it('skips a missing skill when its name is already taken and never migrates a foreign-owned skill', async () => {
    const { snapshot, inbox, campaign, standardInbox } = fixture();
    inbox.content = standardInbox.content;
    const colliding = {
      ...campaign,
      id: '20202020-0000-4000-8000-000000000090',
      universalIdentifier: '20202020-0000-4000-8000-000000000091',
      applicationId: 'foreign-owner',
      applicationUniversalIdentifier: 'foreign-owner',
    };
    snapshot.allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier[
      colliding.universalIdentifier
    ] = colliding;
    const runner = {
      isTransactionActive: true,
      isReleased: false,
      manager: {},
    } as never;
    (runner as { manager: { queryRunner?: unknown } }).manager.queryRunner =
      runner;
    const validator = {
      validateBuildAndRunWorkspaceMigrationFromTo: jest.fn(),
    };
    const command = new Command(
      {} as never,
      {} as never,
      validator as never,
      { getOrRecompute: jest.fn() } as never,
      { load: jest.fn().mockResolvedValue(snapshot) } as never,
      {} as never,
    );
    await command.runOnWorkspaceInUpgradeTransaction(
      { workspaceId, options: { dryRun: false } } as never,
      runner,
      jest.fn(),
    );
    expect(
      validator.validateBuildAndRunWorkspaceMigrationFromTo,
    ).not.toHaveBeenCalled();
  });

  it('does not infer a completed write from a success result without persisted content', async () => {
    const { snapshot, inbox, campaign, standardInbox } = fixture();
    const runner = {
      isTransactionActive: true,
      isReleased: false,
      manager: {},
    } as never;
    (runner as { manager: { queryRunner?: unknown } }).manager.queryRunner =
      runner;
    const load = jest.fn().mockResolvedValue(snapshot);
    const validator = jest.fn(async (args) => {
      const target =
        args.fromToAllFlatEntityMaps.flatSkillMaps.to.byUniversalIdentifier[
          inbox.universalIdentifier
        ];
      const changed = target.content;
      args.assertBeforeRun({
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
        actions: [
          {
            type: 'update',
            metadataName: 'skill',
            universalIdentifier: inbox.universalIdentifier,
            flatEntity: target,
            update: { content: changed },
            diff: { content: { before: inbox.content, after: changed } },
          },
          ...(Command === RefreshMyahAssistantSkillsWorkspaceCommand
            ? [
                {
                  type: 'create',
                  metadataName: 'skill',
                  flatEntity: withoutPhysicalId(
                    args.fromToAllFlatEntityMaps.flatSkillMaps.to
                      .byUniversalIdentifier[campaign.universalIdentifier],
                  ),
                  id: args.idByUniversalIdentifierByMetadataName.skill[
                    campaign.universalIdentifier
                  ],
                },
              ]
            : []),
        ],
      });
      return { status: 'success' };
    });
    const callbacks = jest.fn();
    const command = new Command(
      {} as never,
      {} as never,
      { validateBuildAndRunWorkspaceMigrationFromTo: validator } as never,
      { flush: jest.fn() } as never,
      { load } as never,
      { publishCommittedMetadataVersion: jest.fn() } as never,
    );
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { workspaceId, options: { dryRun: false } } as never,
        runner,
        callbacks,
      ),
    ).rejects.toThrow(/write did not persist/);
    expect(standardInbox.content).not.toEqual(inbox.content);
    expect(callbacks).not.toHaveBeenCalled();
  });

  it('uses the pinned snapshot, exact subclass update semantics, native guards and persisted write before post-commit effects', async () => {
    const { snapshot, inbox, campaign, standardInbox } = fixture();
    const isExact =
      Command === RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand;
    const queryRunner = {
      isTransactionActive: true,
      isReleased: false,
      manager: {},
    } as never;
    (
      queryRunner as { manager: { queryRunner?: unknown } }
    ).manager.queryRunner = queryRunner;
    let createdCampaign = campaign;
    const load = jest
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockImplementation(async () => ({
        ...snapshot,
        allFlatEntityMaps: {
          ...snapshot.allFlatEntityMaps,
          flatSkillMaps: {
            ...snapshot.allFlatEntityMaps.flatSkillMaps,
            byUniversalIdentifier: {
              ...snapshot.allFlatEntityMaps.flatSkillMaps.byUniversalIdentifier,
              [inbox.universalIdentifier]: {
                ...inbox,
                content: isExact
                  ? inbox.content.replace(
                      previousApproval,
                      internalWriteApproval,
                    )
                  : standardInbox.content,
                ...(!isExact ? { label: standardInbox.label } : {}),
              },
              ...(!isExact
                ? { [campaign.universalIdentifier]: createdCampaign }
                : {}),
            },
          },
        },
      }));
    const validateBuildAndRunWorkspaceMigrationFromTo = jest.fn(
      async (args) => {
        const from =
          args.fromToAllFlatEntityMaps.flatSkillMaps.from.byUniversalIdentifier;
        const to =
          args.fromToAllFlatEntityMaps.flatSkillMaps.to.byUniversalIdentifier;
        expect(from[inbox.universalIdentifier]?.content).toContain(
          previousApproval,
        );
        expect(args.pinnedSnapshot).toBe(snapshot);
        expect(args.upgradeTransaction.queryRunner).toBe(queryRunner);
        const target = to[inbox.universalIdentifier];
        const fields = isExact
          ? ['content']
          : Object.keys(target).filter(
              (key) =>
                [
                  'name',
                  'label',
                  'icon',
                  'description',
                  'content',
                  'isCustom',
                  'isActive',
                ].includes(key) &&
                target[key as keyof typeof target] !==
                  inbox[key as keyof typeof inbox],
            );
        const update = Object.fromEntries(
          fields.map((key) => [key, target[key as keyof typeof target]]),
        );
        const diff = Object.fromEntries(
          fields.map((key) => [
            key,
            {
              before: inbox[key as keyof typeof inbox],
              after: target[key as keyof typeof target],
            },
          ]),
        );
        const actions: Record<string, unknown>[] = [
          {
            type: 'update',
            metadataName: 'skill',
            universalIdentifier: inbox.universalIdentifier,
            flatEntity: target,
            update,
            diff,
          },
        ];
        if (!isExact) {
          createdCampaign = to[campaign.universalIdentifier];
          expect(
            args.idByUniversalIdentifierByMetadataName.skill[
              campaign.universalIdentifier
            ],
          ).toBe(createdCampaign.id);
          actions.push({
            type: 'create',
            metadataName: 'skill',
            universalIdentifier: campaign.universalIdentifier,
            id: args.idByUniversalIdentifierByMetadataName.skill[
              campaign.universalIdentifier
            ],
            flatEntity: withoutPhysicalId(createdCampaign),
            update: {},
            diff: {},
          });
        }
        args.assertBeforeRun({
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION.universalIdentifier,
          actions,
        });
        return { status: 'success', workspaceMigration: { actions } };
      },
    );
    const cache = { getOrRecompute: jest.fn(), flush: jest.fn() };
    const version = { publishCommittedMetadataVersion: jest.fn() };
    const command = new Command(
      {} as never,
      {} as never,
      { validateBuildAndRunWorkspaceMigrationFromTo } as never,
      cache as never,
      { load } as never,
      version as never,
    );
    const effects: (() => Promise<void>)[] = [];
    await command.runOnWorkspaceInUpgradeTransaction(
      { workspaceId, options: { dryRun: false } } as never,
      queryRunner,
      (effect) => effects.push(effect as () => Promise<void>),
    );
    expect(validateBuildAndRunWorkspaceMigrationFromTo).toHaveBeenCalledTimes(
      1,
    );
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.getOrRecompute).not.toHaveBeenCalled();
    expect(cache.flush).not.toHaveBeenCalled();
    expect(effects).toHaveLength(1);
    await effects[0]();
    expect(cache.flush).toHaveBeenCalledTimes(1);
    expect(version.publishCommittedMetadataVersion).toHaveBeenCalledWith(
      workspaceId,
    );
  });
});

describe('native skill create ID boundary', () => {
  it('enriches a real universal action without flatEntity.id and transpiles the same physical ID', async () => {
    const { campaign } = fixture();
    const universal = withoutPhysicalId(campaign);
    expect('id' in universal).toBe(false);
    const builder = new WorkspaceMigrationSkillActionsBuilderService({
      validateFlatSkillCreation: jest.fn().mockReturnValue({ errors: [] }),
    } as never);
    const built = (
      builder as unknown as {
        validateFlatEntityCreation: (args: unknown) => {
          status: string;
          action: unknown;
        };
      }
    ).validateFlatEntityCreation({ flatEntityToValidate: universal });
    expect(built.status).toBe('success');
    expect(built.action).toEqual({
      type: 'create',
      metadataName: 'skill',
      flatEntity: universal,
    });
    const migration = enrichCreateWorkspaceMigrationActionsWithIds({
      workspaceMigration: {
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
        actions: [built.action],
      } as never,
      idByUniversalIdentifierByMetadataName: {
        skill: { [campaign.universalIdentifier]: campaign.id },
      },
    });
    const action = migration.actions[0];
    expect(action.type).toBe('create');
    if (action.type !== 'create' || action.metadataName !== 'skill')
      throw new Error('unexpected action');
    expect(action.id).toBe(campaign.id);
    expect('id' in action.flatEntity).toBe(false);
    const flat =
      await new CreateSkillActionHandlerService().transpileUniversalActionToFlatAction(
        {
          action,
          flatApplication: { id: ownerId } as never,
          workspaceId,
          queryRunner: {} as never,
          allFlatEntityMaps: {} as never,
        },
      );
    expect(flat.flatEntity.id).toBe(campaign.id);
    expect(flat.flatEntity.applicationId).toBe(ownerId);
    expect(flat.flatEntity.universalIdentifier).toBe(
      campaign.universalIdentifier,
    );
  });
});

describe('native assistant-skill action guard', () => {
  it('rejects a native create without the planned action ID or with a different ID', () => {
    const { campaign, snapshot } = fixture();
    const action = {
      type: 'create',
      metadataName: 'skill',
      flatEntity: withoutPhysicalId(campaign),
      id: campaign.id,
    };
    const check = (createAction: unknown) =>
      assertPinnedAssistantSkillActions({
        migration: {
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION.universalIdentifier,
          actions: [createAction],
        } as never,
        creates: [campaign],
        updates: [],
        current: snapshot.allFlatEntityMaps.flatSkillMaps as never,
        ownerId,
      });
    expect(() => check(action)).not.toThrow();
    expect(() => check({ ...action, id: undefined })).toThrow(/Unsafe pinned/);
    expect(() =>
      check({ ...action, id: '20202020-0000-4000-8000-000000000099' }),
    ).toThrow(/Unsafe pinned/);
    expect(() =>
      check({
        ...action,
        flatEntity: {
          ...action.flatEntity,
          applicationUniversalIdentifier: 'foreign',
        },
      }),
    ).toThrow(/Unsafe pinned/);
  });

  it('rejects an unrelated, wrong-owner or wrong-old-text update and a fabricated empty action list', () => {
    const { inbox, standardInbox, snapshot } = fixture();
    const target = { ...inbox, content: standardInbox.content };
    const update = { content: target.content };
    const action = {
      type: 'update',
      metadataName: 'skill',
      universalIdentifier: inbox.universalIdentifier,
      flatEntity: target,
      update,
      diff: { content: { before: inbox.content, after: target.content } },
    };
    const check = (actions: unknown[]) =>
      assertPinnedAssistantSkillActions({
        migration: {
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION.universalIdentifier,
          actions,
        } as never,
        creates: [],
        updates: [target],
        current: snapshot.allFlatEntityMaps.flatSkillMaps as never,
        ownerId,
      });
    expect(() => check([action])).not.toThrow();
    expect(() => check([])).toThrow(/Unsafe pinned/);
    expect(() =>
      check([{ ...action, metadataName: 'objectMetadata' }]),
    ).toThrow(/Unsafe pinned/);
    expect(() =>
      check([
        {
          ...action,
          flatEntity: { ...target, applicationUniversalIdentifier: 'foreign' },
        },
      ]),
    ).toThrow(/Unsafe pinned/);
    expect(() =>
      check([
        {
          ...action,
          diff: { content: { before: 'wrong', after: standardInbox.content } },
        },
      ]),
    ).toThrow(/Unsafe pinned/);
    expect(() =>
      check([{ ...action, update: { ...update, label: 'unplanned' } }]),
    ).toThrow(/Unsafe pinned/);
  });
});
