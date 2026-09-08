import { MODULE_METADATA } from '@nestjs/common/constants';
import { MYAH_STANDARD_OBJECTS, STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { SynchronizeMyahCampaignAccountMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788537600000-synchronize-myah-campaign-account-metadata.command';
import { SynchronizeCampaignSequenceMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788696000000-synchronize-campaign-sequence-metadata.command';
import type { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import type { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import type { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const CAMPAIGN_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIER =
  '9a791319-798c-4a65-9eb9-1731b407d2a8';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
  dataSource: {} as never,
};

const buildCommand = ({
  campaignExists = true,
  synchronizeWorkspace = jest.fn().mockResolvedValue(undefined),
}: {
  campaignExists?: boolean;
  synchronizeWorkspace?: jest.Mock;
} = {}) => {
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: campaignExists
        ? { [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {} }
        : {},
    },
  });
  const flush = jest.fn();
  const command = new SynchronizeCampaignSequenceMetadataCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { flush, getOrRecompute } as unknown as WorkspaceCacheService,
  );

  return { command, flush, getOrRecompute, synchronizeWorkspace };
};

const buildUpgradeRunner = () => {
  const recordUpgradeMigration = jest.fn().mockResolvedValue(undefined);
  const invalidateInstanceAndAllWorkspacesStatus = jest
    .fn()
    .mockResolvedValue(undefined);
  const runner = new WorkspaceCommandRunnerService(
    { get: jest.fn().mockReturnValue('2.20.0') } as unknown as TwentyConfigService,
    { recordUpgradeMigration } as unknown as UpgradeMigrationService,
    {
      invalidateInstanceAndAllWorkspacesStatus,
    } as unknown as UpgradeStatusService,
  );

  (
    runner as unknown as {
      logger: { error: jest.Mock; log: jest.Mock; warn: jest.Mock };
    }
  ).logger = {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  };

  return {
    invalidateInstanceAndAllWorkspacesStatus,
    recordUpgradeMigration,
    runner,
  };
};

describe('SynchronizeCampaignSequenceMetadataCommand', () => {
  it('registers after the latest existing command and in the active 2.20 module', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignAccountMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1788537600000 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeCampaignSequenceMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1788696000000 });

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(SynchronizeCampaignSequenceMetadataCommand);
  });

  it('synchronizes only the private workflow-version sequence field', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args, {
      fieldMetadata: new Set([CAMPAIGN_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIER]),
    });
    expect(
      STANDARD_OBJECTS.workflowVersion.fields.campaignSequence
        .universalIdentifier,
    ).toBe(CAMPAIGN_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIER);
  });

  it('delegates each rerun to the idempotent source-controlled synchronizer', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);
    expect(synchronizeWorkspace).toHaveBeenNthCalledWith(2, args, {
      fieldMetadata: new Set([CAMPAIGN_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIER]),
    });
  });

  it('skips workspaces without Myah Campaign metadata', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = buildCommand({
      campaignExists: false,
    });

    await command.runOnWorkspace(args);

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('skips workspaces without a data source', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace({ ...args, dataSource: undefined });

    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('does not record completion or write command-owned state in dry-run mode', async () => {
    const { command, flush, synchronizeWorkspace } = buildCommand();
    const { recordUpgradeMigration, runner } = buildUpgradeRunner();
    const dryRunArgs = { ...args, options: { dryRun: true } };

    await runner.runWorkspaceCommands({
      iteratorContext: dryRunArgs,
      options: dryRunArgs.options,
      workspaceCommands: [
        {
          name: '2-20-workspace-command-1788696000000-synchronize-campaign-sequence-metadata',
          command,
        },
      ],
    });

    expect(synchronizeWorkspace).toHaveBeenCalledWith(dryRunArgs, {
      fieldMetadata: new Set([CAMPAIGN_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIER]),
    });
    expect(recordUpgradeMigration).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('records failure rather than completion when metadata synchronization fails', async () => {
    const metadataFailure = new Error('metadata migration rejected');
    const { command, flush } = buildCommand({
      synchronizeWorkspace: jest.fn().mockRejectedValue(metadataFailure),
    });
    const {
      invalidateInstanceAndAllWorkspacesStatus,
      recordUpgradeMigration,
      runner,
    } = buildUpgradeRunner();

    await expect(
      runner.runWorkspaceCommands({
        iteratorContext: args,
        options: args.options,
        workspaceCommands: [
          {
            name: '2-20-workspace-command-1788696000000-synchronize-campaign-sequence-metadata',
            command,
          },
        ],
      }),
    ).rejects.toThrow(metadataFailure);

    expect(recordUpgradeMigration).toHaveBeenCalledTimes(1);
    expect(recordUpgradeMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceIds: [args.workspaceId],
        status: 'failed',
        error: metadataFailure,
      }),
    );
    expect(recordUpgradeMigration).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
    expect(flush).not.toHaveBeenCalled();
    expect(invalidateInstanceAndAllWorkspacesStatus).toHaveBeenCalledTimes(1);
  });
});
