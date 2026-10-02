import { MODULE_METADATA } from '@nestjs/common/constants';
import { DiscoveryService } from '@nestjs/core';

import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { InstanceCommandProviderModule } from 'src/database/commands/upgrade-version-command/instance-command-provider.module';
import { WorkspaceCommandProviderModule } from 'src/database/commands/upgrade-version-command/workspace-command-provider.module';

import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { CreateCampaignEmailWorkCollisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000007-create-campaign-email-work-collision';
import { RetireBrandBrainMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-reconciliation-name.constant';
import { SynchronizeInstagramSourceControlledMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790491923604-synchronize-instagram-source-controlled-metadata.command';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import {
  type UpgradeStep,
  UpgradeSequenceReaderService,
} from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';

const workspaceId = '20202020-0000-4000-8000-000000000001';
// Read the actual decorated provider registry, not an authored 2.20 suffix.
const workspaceModules = Reflect.getMetadata(
  MODULE_METADATA.IMPORTS,
  WorkspaceCommandProviderModule,
) as Function[];
const providers = [
  ...(Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    InstanceCommandProviderModule,
  ) as Function[]),
  ...workspaceModules.flatMap(
    (module) => Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [],
  ),
].filter((provider) => typeof provider === 'function');
const registry = new UpgradeCommandRegistryService({
  getProviders: () =>
    providers.map((metatype) => ({
      metatype,
      instance: Object.create(metatype.prototype),
    })),
} as unknown as DiscoveryService);
registry.onModuleInit();
const sequence = new UpgradeSequenceReaderService(
  registry,
).getUpgradeSequence();
const instances = sequence
  .filter((step) => step.kind !== 'workspace')
  .map((step) => step.name);
const workspaces = [
  'SynchronizeMyahPartnershipFactsCommand_1789730000001',
  'SynchronizeCampaignReplyAuthorityCommand_1790000000003',
  'RetireBrandBrainMetadataCommand_1790000000410',
  'RetireShopifyConnectionsCommand_1790000000411',
  'RetireCalendarSyncCommand_1790000000412',
  'RetireDashboardCommand_1790000000413',
  'RefreshMyahAssistantSkillsForExactApprovalsWorkspaceCommand_1790161829172',
  'SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
].map((name) => `2.20.0_${name}`);

const row = (name: string, isInitial = false, status = 'completed') => ({
  id: name,
  name,
  status,
  isInitial,
  attempt: 1,
  createdAt: new Date(),
  workspaceId: workspaceId as string | null,
});

const setup = (
  options: {
    global?: string[];
    receipts?: ReturnType<typeof row>[];
    objects?: string[];
    recover3604?: boolean;
  } = {},
) => {
  const events: string[] = [];
  const receipts = options.receipts ?? [row(workspaces[7], true)];
  const objects = options.objects ?? [
    MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding.universalIdentifier,
  ];
  const replyFields = [
    MYAH_STANDARD_OBJECTS.campaign.fields.replyAgentEnabled.universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.replyAgentPaused
      .universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.emailConversationBindings
      .universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding.fields
      .campaignCreator.universalIdentifier,
  ];
  const partnershipFields = [
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
      .universalIdentifier,
    MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations
      .universalIdentifier,
    STANDARD_OBJECTS.task.fields.partnershipObligations.universalIdentifier,
  ];
  const query = jest.fn(async (sql: string) => {
    events.push('read');
    if (sql.includes('FROM core.workspace')) return [{ id: workspaceId }];
    if (sql.includes('to_regclass')) return [{ ready: true }];
    if (sql.includes('FROM core."objectMetadata"'))
      return objects.map((universalIdentifier) => ({ universalIdentifier }));
    if (sql.includes('FROM core."fieldMetadata"'))
      return [
        ...replyFields,
        ...(objects.includes(
          MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier,
        )
          ? partnershipFields
          : []),
      ].map((universalIdentifier) => ({ universalIdentifier }));
    throw new Error('Unplanned admission query');
  });
  const isLastAttemptCompleted = jest.fn(
    async ({ name }: { name: string }) =>
      options.recover3604 === true && name === workspaces[7],
  );
  const getScopedUpgradeReceiptHistories = jest.fn(async () => {
    const attempts = new Map<string, number>();
    return new Map<string | null, Array<ReturnType<typeof row>>>([
      [
        null,
        (options.global ?? instances).map((name, index) => {
          const attempt = (attempts.get(name) ?? 0) + 1;
          attempts.set(name, attempt);
          return {
            ...row(name),
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            attempt,
            createdAt: new Date(Date.UTC(2026, 8, 28) + index * 1000),
            workspaceId: null,
          };
        }),
      ],
      [workspaceId, receipts],
    ]);
  });
  const refresh = jest.fn(async () => {
    events.push('refresh');
  });
  const writeLock = {
    withLock: async (operation: () => Promise<unknown>) => {
      events.push('lock');
      return operation();
    },
    currentRunner: () => ({ query, isReleased: false, databaseConnection: {} }),
  };
  const service = new UpgradeSequenceRunnerService(
    { getScopedUpgradeReceiptHistories, isLastAttemptCompleted } as never,
    {} as never,
    {} as never,
    {} as never,
    { refresh } as never,
    {} as never,
    {
      getActiveOrSuspendedWorkspaceIds: jest.fn(async () => [workspaceId]),
    } as never,
    writeLock as never,
  );
  const cursor = jest.fn(async () => {
    events.push('cursor');
    throw new Error('cursor reached');
  });
  (
    service as unknown as { resolveStartCursor: typeof cursor }
  ).resolveStartCursor = cursor;
  const run = (candidate: UpgradeStep[] = sequence, dryRun = true) =>
    service.run({
      sequence: candidate,
      options: { dryRun },
    });
  return {
    run,
    query,
    events,
    refresh,
    cursor,
    getScopedUpgradeReceiptHistories,
    isLastAttemptCompleted,
  };
};

beforeEach(() => {
  jest
    .spyOn(
      CreateCampaignPartnershipWorkItemFastInstanceCommand.prototype,
      'assertPhysicalContract',
    )
    .mockResolvedValue();
  jest
    .spyOn(
      CreateCampaignEmailWorkCollisionFastInstanceCommand.prototype,
      'assertPhysicalContract',
    )
    .mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

it('admits and repeats the full decorated 144-instance clean/current history', async () => {
  expect(sequence).toHaveLength(248);
  expect(instances).toHaveLength(144);
  const f = setup();
  await expect(f.run()).rejects.toThrow('cursor reached');
  const firstRun = [...f.events];
  await expect(f.run()).rejects.toThrow('cursor reached');
  expect(f.events).toEqual([...firstRun, ...firstRun]);
  expect(f.getScopedUpgradeReceiptHistories).toHaveBeenCalledTimes(2);
});

const swapped = [...instances];
[swapped[4], swapped[5]] = [swapped[5], swapped[4]];
it.each([
  ['equal-cardinality swapped instance receipts', swapped],
  [
    'extra completed second attempt before the last slow receipt',
    [...instances.slice(0, -1), instances[17], instances[instances.length - 1]],
  ],
])('holds %s before refresh or recovery', async (_description, global) => {
  const f = setup({ global });
  await expect(f.run(sequence, false)).rejects.toThrow(
    'Unsupported MYAH-334 upgrade history',
  );
  expect(f.events).toEqual(['lock', 'read']);
  expect(f.refresh).not.toHaveBeenCalled();
  expect(f.isLastAttemptCompleted).not.toHaveBeenCalled();
  expect(f.cursor).not.toHaveBeenCalled();
});

it('rejects an unregistered 7300 before ledger, refresh, recovery or cursor', async () => {
  const f = setup();
  await expect(
    f.run(
      sequence.filter(
        (step) =>
          step.name !==
          '2.20.0_CreateMyahCampaignReplyEvidenceFastInstanceCommand_1790141137300',
      ),
    ),
  ).rejects.toThrow('Unsupported MYAH-334 assembled upgrade sequence');
  expect(f.events).toEqual(['lock']);
  expect(f.getScopedUpgradeReceiptHistories).not.toHaveBeenCalled();
});

it.each([
  ['partial global', { global: instances.slice(0, -2) }],
  [
    '334-only 142 global and reply checkpoint',
    {
      global: instances.filter(
        (name) =>
          !['1790141137300', '1790141137400'].some((suffix) =>
            name.endsWith(suffix),
          ),
      ),
      receipts: [row(workspaces[1], true)],
    },
  ],
  [
    'historical non-progress reconciliation',
    { global: [...instances, LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME] },
  ],
  [
    'late failed workspace',
    {
      receipts: [row(workspaces[7], true), row(workspaces[0], false, 'failed')],
    },
  ],
  [
    'failed plus initial',
    {
      receipts: [row(workspaces[0], false, 'failed'), row(workspaces[7], true)],
    },
  ],
  [
    'unexplained workspace',
    { receipts: [row(workspaces[7], true), row('unknown')] },
  ],
])(
  'holds %s before refresh, physical read or cursor',
  async (_name, options) => {
    const f = setup(options);
    await expect(f.run(sequence, false)).rejects.toThrow(
      'Unsupported MYAH-334 upgrade history',
    );
    expect(f.events).toEqual(['lock', 'read']);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.cursor).not.toHaveBeenCalled();
  },
);

it('rejects the 410-only workspace history even with otherwise complete assembled instance receipts', async () => {
  const f = setup({
    receipts: [
      row(
        '2.20.0_InstallMyahInboxEmailGeneralProvenanceCommand_1789645911004',
        true,
      ),
      row('2.20.0_SynchronizeMyahStandardMetadataCommand_1784266302001'),
      row('2.20.0_RefreshMyahAssistantSkillsCommand_1789645911006'),
      ...workspaces.slice(2).map((name) => row(name)),
    ],
  });
  await expect(f.run(sequence, false)).rejects.toThrow(
    'Unsupported MYAH-334 upgrade history',
  );
  expect(f.events).toEqual(['lock', 'read']);
  expect(f.refresh).not.toHaveBeenCalled();
  expect(f.cursor).not.toHaveBeenCalled();
});

it('admits the genuine initial 3604 checkpoint only with complete receipts and physical baseline', async () => {
  const f = setup();
  await expect(f.run()).rejects.toThrow('cursor reached');
  expect(f.events).toEqual([
    'lock',
    'read',
    'read',
    'read',
    'read',
    'refresh',
    'cursor',
    'refresh',
  ]);
});

it('accepts a completed ordered B/reply prefix only when both partnership objects exist', async () => {
  const receipts = [
    row(workspaces[7], true),
    row(workspaces[0]),
    row(workspaces[1]),
  ];
  const f = setup({ receipts });
  await expect(f.run()).rejects.toThrow('metadata does not match');
  expect(f.refresh).not.toHaveBeenCalled();
  const valid = setup({
    receipts,
    objects: [
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier,
    ],
  });
  await expect(valid.run()).rejects.toThrow('cursor reached');
});

it('admits an initial checkpoint without recovering it, then recovers only a genuinely executed 3604 before the cursor', async () => {
  const candidate = sequence.map((step) => {
    const prototype =
      step.name === workspaces[2]
        ? RetireBrandBrainMetadataCommand.prototype
        : step.name === workspaces[7]
          ? SynchronizeInstagramSourceControlledMetadataCommand.prototype
          : null;
    return prototype ? { ...step, command: Object.create(prototype) } : step;
  }) as UpgradeStep[];
  const initial = setup();
  const initial3604 = candidate.find(
    (step) => step.name === workspaces[7],
  )! as unknown as {
    command: SynchronizeInstagramSourceControlledMetadataCommand;
  };
  initial3604.command.reconcileCommittedUpgrade = jest.fn(async () => {
    initial.events.push('recovered');
  });
  await expect(initial.run(candidate, false)).rejects.toThrow('cursor reached');
  expect(initial3604.command.reconcileCommittedUpgrade).not.toHaveBeenCalled();
  expect(initial.isLastAttemptCompleted).toHaveBeenCalledWith({
    name: workspaces[7],
    workspaceId,
    queryRunner: expect.any(Object),
    requireNonInitial: true,
  });
  expect(initial.events.indexOf('cursor')).toBeGreaterThan(
    initial.events.indexOf('refresh'),
  );

  const executed = setup({
    receipts: [
      row(workspaces[7], true),
      ...workspaces.map((name) => row(name)),
    ],
    objects: [
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier,
    ],
    recover3604: true,
  });
  initial3604.command.reconcileCommittedUpgrade = jest.fn(async () => {
    executed.events.push('recovered');
  });
  await expect(executed.run(candidate, false)).rejects.toThrow(
    'cursor reached',
  );
  expect(initial3604.command.reconcileCommittedUpgrade).toHaveBeenCalledWith(
    workspaceId,
  );
  expect(executed.events.indexOf('recovered')).toBeLessThan(
    executed.events.indexOf('cursor'),
  );
});
