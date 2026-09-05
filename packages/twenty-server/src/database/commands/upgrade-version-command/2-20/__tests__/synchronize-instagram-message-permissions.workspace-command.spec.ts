import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

type Command = {
  runOnWorkspace: (args: { workspaceId: string; options: Record<string, unknown> }) => Promise<void>;
};

type CommandConstructor = new (...dependencies: never[]) => Command;

type CommandModule = {
  SynchronizeInstagramMessagePermissionsCommand: CommandConstructor;
};

const loadModule = (): CommandModule | undefined => {
  try {
    return require(
      'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1799201011000-synchronize-instagram-message-permissions.command'
    ) as CommandModule;
  } catch {
    return undefined;
  }
};

describe('SynchronizeInstagramMessagePermissionsCommand', () => {
  it('is registered at the reserved 2.20 workspace timestamp', () => {
    const commandModule = loadModule();

    expect(commandModule).toBeDefined();
    expect(
      getRegisteredWorkspaceCommandMetadata(
        commandModule!.SynchronizeInstagramMessagePermissionsCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1799201011000 });
  });

  it('reuses the standard metadata synchronizer so existing workspaces receive default-false flags without bespoke writes', async () => {
    const commandModule = loadModule();

    expect(commandModule).toBeDefined();
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const CommandClass = commandModule!.SynchronizeInstagramMessagePermissionsCommand;
    const command = new CommandClass(
      {} as never,
      { synchronizeWorkspace } as never,
    );
    const args = { workspaceId: 'workspace-id', options: {} };

    await command.runOnWorkspace(args);

    expect(synchronizeWorkspace).toHaveBeenCalledWith(args);
  });
});
