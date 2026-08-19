import { SystemPermissionFlag } from 'twenty-shared/constants';

import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';
import { fromPermissionFlagToUniversalFlatRolePermissionFlag } from 'src/engine/core-modules/application/application-manifest/converters/from-permission-flag-to-universal-flat-role-permission-flag.util';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeMyahCampaignAutomationMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786526100000-synchronize-myah-campaign-automation-metadata.command';
import { SynchronizeManagedEmailCampaignAssignmentMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1786000001000-synchronize-managed-email-campaign-assignment-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

import { MYAH_STANDARD_OBJECTS, STANDARD_OBJECTS } from 'twenty-shared/metadata';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const argsWithDataSource = {
  ...args,
  dataSource: {} as never,
};

describe('SynchronizeMyahCampaignAutomationMetadataCommand', () => {
  it('replaces obsolete Campaign Automation metadata and grants Workflow access', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const synchronizeSourceControlledMetadata = jest
      .fn()
      .mockResolvedValue(undefined);
    const command = new SynchronizeMyahCampaignAutomationMetadataCommand(
      {} as WorkspaceIteratorService,
      { synchronizeWorkspace } as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: {
              [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {},
            },
          },
        }),
      } as never as WorkspaceCacheService,
      {
        synchronizeWorkspace: synchronizeSourceControlledMetadata,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
    );

    await command.runOnWorkspace(argsWithDataSource);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(argsWithDataSource, {
      explicitObsoleteUniversalIdentifiersByMetadataName: {
        fieldMetadata: new Set([
          'f173bd4d-0e7e-410b-876e-7c2dcf768a99',
          '0a178c94-60ff-48e0-9982-64318f6ca3fa',
          'a58a03e6-4c1d-4b0c-b40f-f3a78f6b6c16',
        ]),
        viewField: new Set(['9ecf92f8-6702-49bb-a25f-1d6e4ade47d8']),
        viewFilter: new Set(['e505cfd8-a195-4b9a-997c-6c8208394a37']),
        pageLayoutTab: new Set(['1c137df3-a23f-477c-a890-fb40aecc40f7']),
        pageLayoutWidget: new Set([
          '0c878749-e445-4309-b799-26c2294e48ee',
          '833783c1-7cc0-4993-a856-977f95e1e3b4',
        ]),
      },
      targetObjectUniversalIdentifiers: new Set([
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
        STANDARD_OBJECTS.workflow.universalIdentifier,
      ]),
    });
    expect(synchronizeSourceControlledMetadata).toHaveBeenCalledWith(
      argsWithDataSource,
      {
        rolePermissionFlag: new Set([
          fromPermissionFlagToUniversalFlatRolePermissionFlag({
            applicationUniversalIdentifier:
              TWENTY_STANDARD_APPLICATION.universalIdentifier,
            now: '',
            permissionFlagUniversalIdentifier: SystemPermissionFlag.WORKFLOWS,
            roleUniversalIdentifier:
              MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
          }).universalIdentifier,
        ]),
      },
    );
  });

  it('skips synchronization when Campaign metadata is absent', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const synchronizeSourceControlledMetadata = jest
      .fn()
      .mockResolvedValue(undefined);
    const command = new SynchronizeMyahCampaignAutomationMetadataCommand(
      {} as WorkspaceIteratorService,
      { synchronizeWorkspace } as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: {
              [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: undefined,
            },
          },
        }),
      } as never as WorkspaceCacheService,
      {
        synchronizeWorkspace: synchronizeSourceControlledMetadata,
      } as unknown as SynchronizeSourceControlledMyahMetadataService,
    );

    await command.runOnWorkspace(argsWithDataSource);

    expect(synchronizeWorkspace).not.toHaveBeenCalled();
    expect(synchronizeSourceControlledMetadata).not.toHaveBeenCalled();
  });

  it('registers after the latest current 2.20 workspace command', () => {
    const commandMetadata = getRegisteredWorkspaceCommandMetadata(
      SynchronizeMyahCampaignAutomationMetadataCommand,
    );
    const latestCurrentCommandMetadata = getRegisteredWorkspaceCommandMetadata(
      SynchronizeManagedEmailCampaignAssignmentMetadataCommand,
    );

    if (
      commandMetadata === undefined ||
      latestCurrentCommandMetadata === undefined
    ) {
      throw new Error('Workspace command registration is required');
    }

    expect(commandMetadata).toMatchObject({
      version: '2.20.0',
      timestamp: 1786526100000,
    });
    expect(commandMetadata.timestamp).toBeGreaterThan(
      latestCurrentCommandMetadata.timestamp,
    );
  });
});
