import type { DataSource } from 'typeorm';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

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

const workspaceSchemaName = getWorkspaceSchemaName(args.workspaceId);
const workspaceRow = [{ databaseSchema: workspaceSchemaName }];

const createCommand = (query: jest.Mock) =>
  new BackfillComposioInstagramHistoryWorkspaceCommand(
    {} as WorkspaceIteratorService,
    { query } as unknown as DataSource,
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
      timestamp: 1789307619373,
    });
    expect(invalidationMetadata).toEqual({
      version: '2.20.0',
      timestamp: 1789307619370,
    });
    expect(backfillMetadata?.timestamp ?? 0).toBeGreaterThan(
      invalidationMetadata?.timestamp ?? 0,
    );
  });

  it.each([false, true])(
    'fails closed when the app-synced historical fields are absent (dryRun=%s)',
    async (dryRun) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce(workspaceRow)
        .mockResolvedValueOnce(
          appSyncedColumns.filter(
            ({ tableName, columnName }) =>
              tableName !== '_myahInstagramReplyDraft' ||
              ['id', 'status'].includes(columnName),
          ),
        );

      await expect(
        createCommand(query).runOnWorkspace({
          ...args,
          options: { dryRun },
        }),
      ).rejects.toThrow('app-synced Instagram history fields are missing');
      expect(query).toHaveBeenCalledTimes(2);
    },
  );

  it('skips a workspace where the historical Instagram app tables never existed', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(workspaceRow)
      .mockResolvedValueOnce([]);

    await expect(createCommand(query).runOnWorkspace(args)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a historical Instagram table exists without columns', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(workspaceRow)
      .mockResolvedValueOnce([
        { tableName: '_myahSocialConversation', columnName: null },
      ]);

    await expect(createCommand(query).runOnWorkspace(args)).rejects.toThrow(
      'app-synced Instagram history fields are missing',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('preserves historical rows without deduplication while excluding Unipile conversations, messages, and drafts', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(workspaceRow)
      .mockResolvedValueOnce(appSyncedColumns)
      .mockResolvedValue(undefined);
    const command = createCommand(query);

    await command.runOnWorkspace(args);

    expect(query).toHaveBeenCalledTimes(3);
    const [sql] = query.mock.calls[2] as [string];

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
    const query = jest
      .fn()
      .mockResolvedValueOnce(workspaceRow)
      .mockResolvedValueOnce(appSyncedColumns);

    await createCommand(query).runOnWorkspace({
      ...args,
      options: { dryRun: true },
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('information_schema.columns');
    expect(query.mock.calls[1][1]).toEqual([
      workspaceSchemaName,
      [
        '_myahSocialConversation',
        '_myahSocialMessage',
        '_myahInstagramReplyDraft',
      ],
    ]);
  });

  it.each([false, true])(
    'skips a workspace that has no database schema (dryRun=%s)',
    async (dryRun) => {
      const query = jest.fn().mockResolvedValue([{ databaseSchema: null }]);

      await expect(
        createCommand(query).runOnWorkspace({
          ...args,
          options: { dryRun },
        }),
      ).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed when the workspace schema identity is unexpected', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ databaseSchema: 'unexpected' }]);

    await expect(createCommand(query).runOnWorkspace(args)).rejects.toThrow(
      'workspace schema prerequisite mismatch',
    );
  });

  it('fails closed when the recorded workspace schema does not physically exist', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await expect(createCommand(query).runOnWorkspace(args)).rejects.toThrow(
      'workspace schema prerequisite mismatch',
    );
    expect(query.mock.calls[0][0]).toContain('pg_catalog.pg_namespace');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
