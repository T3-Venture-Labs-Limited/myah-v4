import { MODULE_METADATA } from '@nestjs/common/constants';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { SynchronizeMyahCampaignEmailSignatureMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787721600000-synchronize-myah-campaign-email-signature-metadata.command';
import { SynchronizeMyahCampaignAccountMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1788537600000-synchronize-myah-campaign-account-metadata.command';
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
  const command = new SynchronizeMyahCampaignAccountMetadataCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
  );

  return { command, getOrRecompute, synchronizeWorkspace };
};

describe('SynchronizeMyahCampaignAccountMetadataCommand', () => {
  it('registers after the existing Campaign metadata synchronization command', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignEmailSignatureMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1787721600000 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignAccountMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1788537600000 });
  });

  it('registers the command in the active 2.20 module', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(SynchronizeMyahCampaignAccountMetadataCommand);
  });

  it('synchronizes complete Campaign account metadata through the source-controlled synchronizer', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args, {
      objectMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.universalIdentifier,
      ]),
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.campaignAccounts
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.outreachAction.fields.campaignAccountId
          .universalIdentifier,
      ]),
      index: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.indexes.campaignAccountUniqueIndex
          .universalIdentifier,
      ]),
      objectPermission: new Set([
        '9dda7955-44b7-5ea0-ab63-6dc0630626e8',
      ]),
    });
  });

  it('delegates each rerun to the idempotent source-controlled synchronizer', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);
    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);
    expect(synchronizeWorkspace).toHaveBeenNthCalledWith(2, args, {
      objectMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.universalIdentifier,
      ]),
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.campaignAccounts
          .universalIdentifier,
        MYAH_STANDARD_OBJECTS.outreachAction.fields.campaignAccountId
          .universalIdentifier,
      ]),
      index: new Set([
        MYAH_STANDARD_OBJECTS.campaignAccount.indexes.campaignAccountUniqueIndex
          .universalIdentifier,
      ]),
      objectPermission: new Set([
        '9dda7955-44b7-5ea0-ab63-6dc0630626e8',
      ]),
    });
  });

  it('skips synchronization when Campaign metadata is absent', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = buildCommand({
      campaignExists: false,
    });

    await command.runOnWorkspace(args);

    expect(getOrRecompute).toHaveBeenCalledWith(args.workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('skips synchronization without a workspace data source', async () => {
    const { command, getOrRecompute, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace({ ...args, dataSource: undefined });

    expect(getOrRecompute).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });
});
