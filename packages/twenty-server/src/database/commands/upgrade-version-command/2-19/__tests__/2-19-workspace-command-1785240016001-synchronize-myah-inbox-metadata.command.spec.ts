import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const INBOX_FIELD_UNIVERSAL_IDENTIFIERS: Record<string, true> = {
  '2bab4cc0-d1d8-4394-b506-9c49a8b414a5': true,
  'f7e38f36-1901-40df-b6c1-cfff373f472f': true,
  'eb7f2495-3cc2-4db5-9744-1172ab8a44e8': true,
  '5047d99f-a82c-4a68-ad39-efd9665a182c': true,
  'ff39959f-533d-4a41-b022-2744628ada69': true,
  '8ec8253f-9b54-46d5-9b55-ac1829c10f4f': true,
  'dfcab7eb-b140-48b7-9252-ed4b9b0d5789': true,
  '664b677e-8625-4442-bc1c-c836f541d0d1': true,
  '46def870-48cb-4348-b1e3-50be5104c046': true,
  '07c0459e-9426-40a6-acdb-3c86824f0d47': true,
};

type SynchronizeSourceControlledMyahMetadataService = {
  synchronizeWorkspace: (
    args: RunOnWorkspaceArgs,
    selection: { fieldMetadata: ReadonlySet<string> },
  ) => Promise<void>;
};

type SynchronizeMyahInboxMetadataCommand = {
  runOnWorkspace: (args: RunOnWorkspaceArgs) => Promise<void>;
};

type SynchronizeMyahInboxMetadataCommandConstructor = new (
  ...constructorArgs: unknown[]
) => SynchronizeMyahInboxMetadataCommand;

type SynchronizeMyahInboxMetadataCommandModule = {
  SynchronizeMyahInboxMetadataCommand: SynchronizeMyahInboxMetadataCommandConstructor;
};

const loadCommandModule =
  (): SynchronizeMyahInboxMetadataCommandModule | undefined => {
    try {
      return require(
        'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1785240016001-synchronize-myah-inbox-metadata.command',
      ) as SynchronizeMyahInboxMetadataCommandModule;
    } catch {
      return undefined;
    }
  };

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: true },
  index: 0,
  total: 1,
};

describe('SynchronizeMyahInboxMetadataCommand', () => {
  it('delegates the complete Inbox field set through an active-release source-controlled metadata sync', async () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();

    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new commandModule!.SynchronizeMyahInboxMetadataCommand(
      {} as WorkspaceIteratorService,
      {
        synchronizeWorkspace,
      } as SynchronizeSourceControlledMyahMetadataService,
    );

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    const selection = synchronizeWorkspace.mock.calls[0][1] as {
      fieldMetadata: ReadonlySet<string>;
    };

    expect([...selection.fieldMetadata].sort()).toEqual(
      Object.keys(INBOX_FIELD_UNIVERSAL_IDENTIFIERS).sort(),
    );
  });

  it('registers the Inbox metadata replay in active version 2.19 after the Creator search repair', () => {
    const commandModule = loadCommandModule();

    expect(commandModule).toBeDefined();
    expect(
      getRegisteredWorkspaceCommandMetadata(
        commandModule!.SynchronizeMyahInboxMetadataCommand,
      ),
    ).toMatchObject({
      version: '2.19.0',
      timestamp: 1785240016001,
    });
  });
});
