import { CommandMeta } from 'nest-commander/src/constants';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { SynchronizeInstagramSourceControlledMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790491923604-synchronize-instagram-source-controlled-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

describe('SynchronizeInstagramSourceControlledMetadataCommand', () => {
  it('registers the named 2.20 command and scopes synchronization to Instagram adoption', async () => {
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeInstagramSourceControlledMetadataCommand(
      {} as never,
      { synchronizeWorkspace } as never,
    );

    await command.runOnWorkspace(args);

    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeInstagramSourceControlledMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1790491923604 });
    expect(
      Reflect.getMetadata(
        CommandMeta,
        SynchronizeInstagramSourceControlledMetadataCommand,
      ),
    ).toMatchObject({
      name: 'upgrade:2-20:synchronize-instagram-source-controlled-metadata',
    });
    expect(synchronizeWorkspace).toHaveBeenCalledWith(
      args,
      expect.objectContaining({
        migrateLegacyMyahApplication: false,
        legacyInstagramApplicationUniversalIdentifier:
          '4738ebcd-6662-4ecc-a190-374fa0525951',
        targetObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.myahInstagramAccount.universalIdentifier,
          MYAH_STANDARD_OBJECTS.myahSocialConversation.universalIdentifier,
          MYAH_STANDARD_OBJECTS.myahSocialMessage.universalIdentifier,
          MYAH_STANDARD_OBJECTS.myahInstagramReplyDraft.universalIdentifier,
        ]),
        additionalAvailableObjectUniversalIdentifiers: new Set([
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
        ]),
      }),
    );
  });
});
