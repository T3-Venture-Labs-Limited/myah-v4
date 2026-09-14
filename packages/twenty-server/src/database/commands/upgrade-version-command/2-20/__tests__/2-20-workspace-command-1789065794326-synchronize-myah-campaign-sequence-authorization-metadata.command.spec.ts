import { MODULE_METADATA } from '@nestjs/common/constants';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789065794326-synchronize-myah-campaign-sequence-authorization-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
  dataSource: {} as never,
};

const buildCommand = ({ campaignExists = true } = {}) => {
  const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: campaignExists
        ? { [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {} }
        : {},
    },
  });
  const command =
    new SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
      { getOrRecompute } as unknown as WorkspaceCacheService,
    );

  return { command, getOrRecompute, synchronizeWorkspace };
};

describe('SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand', () => {
  it('registers at the allocated 2.20 timestamp and in the active module', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1789065794326 });

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand,
    );
  });

  it('targets only the Campaign sequenceAuthorization field on every run', async () => {
    const { command, synchronizeWorkspace } = buildCommand();
    const expectedOptions = {
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.sequenceAuthorization
          .universalIdentifier,
      ]),
    };

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);
    expect(synchronizeWorkspace).toHaveBeenNthCalledWith(
      1,
      args,
      expectedOptions,
    );
    expect(synchronizeWorkspace).toHaveBeenNthCalledWith(
      2,
      args,
      expectedOptions,
    );
  });

  it('skips workspaces without Campaign metadata', async () => {
    const { command, synchronizeWorkspace } = buildCommand({
      campaignExists: false,
    });

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('skips workspaces without a data source', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace({ ...args, dataSource: undefined });

    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
