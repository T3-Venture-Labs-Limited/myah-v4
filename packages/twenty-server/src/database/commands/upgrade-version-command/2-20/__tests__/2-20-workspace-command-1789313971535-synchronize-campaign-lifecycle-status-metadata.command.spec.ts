import { MODULE_METADATA } from '@nestjs/common/constants';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { SynchronizeCampaignLifecycleStatusMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971535-synchronize-campaign-lifecycle-status-metadata.command';
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
  const command = new SynchronizeCampaignLifecycleStatusMetadataCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
  );

  return { command, getOrRecompute, synchronizeWorkspace };
};

describe('SynchronizeCampaignLifecycleStatusMetadataCommand', () => {
  it('appends the command to the current 2.20 module', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        VerifyInstagramSecurityCutoverWorkspaceCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1789313971534 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeCampaignLifecycleStatusMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1789313971535 });

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      SynchronizeCampaignLifecycleStatusMetadataCommand,
    );
  });

  it('synchronizes only the canonical Campaign lifecycle status field', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args, {
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.lifecycleStatus
          .universalIdentifier,
      ]),
    });
  });

  it('delegates reruns to the idempotent source-controlled synchronizer', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);
  });

  it('skips workspaces without canonical Campaign metadata', async () => {
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
});
