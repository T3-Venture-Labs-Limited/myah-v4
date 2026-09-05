import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1799201012000-backfill-composio-instagram-history.command';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1799201011500-invalidate-composio-instagram-authorities.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const args: RunOnWorkspaceArgs = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const appSyncedColumns = [
  ...[
    'id',
    'provider',
    'lifecycle',
    'providerConversationId',
    'recipientIgsid',
  ].map((columnName) => ({
    tableName: '_myahSocialConversation',
    columnName,
  })),
  ...['id', 'provider', 'conversationId', 'text', 'providerCreatedAt'].map(
    (columnName) => ({
      tableName: '_myahSocialMessage',
      columnName,
    }),
  ),
  ...['id', 'conversationId', 'status', 'sentAt', 'sendBlockedReason'].map(
    (columnName) => ({
      tableName: '_myahInstagramReplyDraft',
      columnName,
    }),
  ),
];

const createCommand = () =>
  new BackfillComposioInstagramHistoryWorkspaceCommand(
    {} as WorkspaceIteratorService,
  );

describe('BackfillComposioInstagramHistoryWorkspaceCommand', () => {
  it('registers the exact 2.20 history cutover after cursor-safe workspace authority invalidation', () => {
    const backfillMetadata = getRegisteredWorkspaceCommandMetadata(
      BackfillComposioInstagramHistoryWorkspaceCommand,
    );
    const invalidationMetadata = getRegisteredWorkspaceCommandMetadata(
      InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
    );

    expect(backfillMetadata).toEqual({
      version: '2.20.0',
      timestamp: 1799201012000,
    });
    expect(invalidationMetadata).toEqual({
      version: '2.20.0',
      timestamp: 1799201011500,
    });
    expect(backfillMetadata?.timestamp ?? 0).toBeGreaterThan(
      invalidationMetadata?.timestamp ?? 0,
    );
  });

  it('fails closed when the app-synced historical fields are absent', async () => {
    const query = jest
      .fn()
      .mockResolvedValue(
        appSyncedColumns.filter(
          ({ tableName, columnName }) =>
            tableName !== '_myahInstagramReplyDraft' ||
            ['id', 'status'].includes(columnName),
        ),
      );

    await expect(
      createCommand().runOnWorkspace({
        ...args,
        dataSource: { query } as never,
      }),
    ).rejects.toThrow('app-synced Instagram history fields are missing');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves historical rows without deduplication while excluding Unipile conversations, messages, and drafts', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(appSyncedColumns)
      .mockResolvedValue(undefined);
    const command = createCommand();

    await command.runOnWorkspace({
      ...args,
      dataSource: { query } as never,
    });

    expect(query).toHaveBeenCalledTimes(2);
    const [sql] = query.mock.calls[1] as [string];

    expect(sql).toContain('"provider" IS DISTINCT FROM \'UNIPILE\'');
    expect(sql).toContain("'COMPOSIO_HISTORY'");
    expect(sql).toContain("'HISTORICAL'");
    expect(sql).toContain("'NEEDS_REVIEW'");
    expect(sql).toContain("'APPROVED'");
    expect(sql).toContain("'DISCARDED'");
    expect(sql).toContain("'PROVIDER_CUTOVER'");
    expect(sql).toContain('"sentAt" IS NULL');
    expect(sql).not.toContain('DISTINCT ON');
    expect(sql).not.toContain('DELETE FROM');
  });

  it('preflights app fields but never mutates in dry-run mode', async () => {
    const query = jest.fn().mockResolvedValue(appSyncedColumns);

    await createCommand().runOnWorkspace({
      ...args,
      options: { dryRun: true },
      dataSource: { query } as never,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('information_schema.columns');
  });

  it('does nothing when no workspace data source is available', async () => {
    await expect(createCommand().runOnWorkspace(args)).resolves.toBeUndefined();
  });
});
