import type { DataSource } from 'typeorm';
import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';

import { InvalidateComposioInstagramAuthoritiesSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1789307619363-invalidate-composio-instagram-authorities';
import { AddInstagramDirectActionContextFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619359-add-instagram-direct-action-context';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

describe('InvalidateComposioInstagramAuthoritiesSlowInstanceCommand', () => {
  it('is registered as the ordered 2.20 slow authority cutover', () => {
    expect(
      getRegisteredInstanceCommandMetadata(
        InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
      ),
    ).toEqual({
      version: '2.20.0',
      timestamp: 1789307619363,
      type: 'slow',
      runAfterWorkspace: false,
    });
    expect(
      INSTANCE_COMMANDS.indexOf(
        InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
      ),
    ).toBeGreaterThan(
      INSTANCE_COMMANDS.indexOf(
        AddInstagramDirectActionContextFastInstanceCommand,
      ),
    );
    expect(
      new InvalidateComposioInstagramAuthoritiesSlowInstanceCommand()
        .runDataMigrationWithoutWorkspaces,
    ).toBe(true);
  });

  it('expires only pending and approved legacy reply authorities and records cutover evidence from their draft evidence identity', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command =
      new InvalidateComposioInstagramAuthoritiesSlowInstanceCommand();

    await command.runDataMigration({ query } as unknown as DataSource);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0] as [string];

    expect(sql).toContain('"actionName" = \'send_instagram_reply\'');
    expect(sql).toContain("\"state\" IN ('PENDING', 'APPROVED')");
    expect(sql).toContain("'EXPIRED'");
    expect(sql).toContain("'draft'");
    expect(sql).toContain("'PROVIDER_CUTOVER'");
    expect(sql).toContain('ON CONFLICT (');
    expect(sql).not.toContain('send_instagram_message');
  });
});

describe('InvalidateComposioInstagramAuthoritiesWorkspaceCommand', () => {
  const args: RunOnWorkspaceArgs = {
    workspaceId: '20202020-0000-0000-0000-000000000001',
    options: { dryRun: false },
    index: 0,
    total: 1,
  };

  it('is registered in the appendable 2.20 workspace segment', () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
      ),
    ).toEqual({ version: '2.20.0', timestamp: 1789307619370 });
  });

  it('scopes legacy authority invalidation to the current workspace', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command = new InvalidateComposioInstagramAuthoritiesWorkspaceCommand(
      {} as WorkspaceIteratorService,
      { query } as unknown as DataSource,
    );

    await command.runOnWorkspace(args);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('AND \"workspaceId\" = $1');
    expect(query.mock.calls[0][1]).toEqual([args.workspaceId]);
  });

  it('uses the core data source when the workspace has no schema', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command = new InvalidateComposioInstagramAuthoritiesWorkspaceCommand(
      {} as WorkspaceIteratorService,
      { query } as unknown as DataSource,
    );

    await command.runOnWorkspace(args);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([args.workspaceId]);
  });

  it('never mutates authorities in dry-run mode', async () => {
    const query = jest.fn();
    const command = new InvalidateComposioInstagramAuthoritiesWorkspaceCommand(
      {} as WorkspaceIteratorService,
      { query } as unknown as DataSource,
    );

    await command.runOnWorkspace({
      ...args,
      options: { dryRun: true },
      dataSource: { query } as never,
    });

    expect(query).not.toHaveBeenCalled();
  });
});
