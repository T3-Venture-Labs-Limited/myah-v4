import { MODULE_METADATA } from '@nestjs/common/constants';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { RemoveMyahCampaignCreatorListsWidgetCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787298665000-remove-myah-campaign-creator-lists-widget.command';
import { SynchronizeMyahCampaignEmailSignatureMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1787721600000-synchronize-myah-campaign-email-signature-metadata.command';
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
  const command = new SynchronizeMyahCampaignEmailSignatureMetadataCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
  );

  return { command, getOrRecompute, synchronizeWorkspace };
};

describe('SynchronizeMyahCampaignEmailSignatureMetadataCommand', () => {
  it('adds a newer 2.20 command without changing the completed prior command', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        RemoveMyahCampaignCreatorListsWidgetCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1787298665000 });
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahCampaignEmailSignatureMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1787721600000 });
  });

  it('registers the correction in the current 2.20 command module', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      V2_20_UpgradeVersionCommandModule,
    ) as unknown[];

    expect(providers).toContain(
      SynchronizeMyahCampaignEmailSignatureMetadataCommand,
    );
  });

  it('synchronizes only the Campaign Email signature field and Operations placement', async () => {
    const { command, synchronizeWorkspace } = buildCommand();

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args, {
      fieldMetadata: new Set([
        MYAH_STANDARD_OBJECTS.campaign.fields.emailSignature
          .universalIdentifier,
      ]),
      view: new Set([
        MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5.universalIdentifier,
      ]),
      viewField: new Set([
        MYAH_STANDARD_OBJECTS.campaign.views.view9c4f90c5.viewFields
          .emailSignature.universalIdentifier,
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
