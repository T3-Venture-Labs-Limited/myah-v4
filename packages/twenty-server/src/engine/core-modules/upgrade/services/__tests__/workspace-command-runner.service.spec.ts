import { Logger } from '@nestjs/common';
import type { QueryRunner, Repository } from 'typeorm';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import type { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import type { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import type { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';
import {
  type RunWorkspaceCommandsArgs,
  WorkspaceCommandRunnerService,
} from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import type { UpgradeMigrationEntity } from 'src/engine/core-modules/upgrade/upgrade-migration.entity';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const workspaceId = '20202020-0000-0000-0000-000000000001';
const appSyncedColumns = Object.entries({
  _myahSocialConversation: [
    'id',
    'provider',
    'lifecycle',
    'providerConversationId',
    'recipientIgsid',
  ],
  _myahSocialMessage: [
    'id',
    'provider',
    'conversationId',
    'text',
    'providerCreatedAt',
  ],
  _myahInstagramReplyDraft: [
    'id',
    'conversationId',
    'status',
    'sentAt',
    'sendBlockedReason',
  ],
}).flatMap(([tableName, columns]) =>
  columns.map((columnName) => ({ tableName, columnName })),
);
const commandCases = [
  InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
  BackfillComposioInstagramHistoryWorkspaceCommand,
];

const createHarness = () => {
  const rows: Partial<UpgradeMigrationEntity>[] = [];
  const repository = {
    count: jest.fn(
      async ({ where }: { where: { name: string; workspaceId: string } }) =>
        rows.filter(
          (row) =>
            row.name === where.name && row.workspaceId === where.workspaceId,
        ).length,
    ),
    save: jest.fn(async (batch: Partial<UpgradeMigrationEntity>[]) => {
      rows.push(...batch);
      return batch;
    }),
  };
  const invalidateInstanceAndAllWorkspacesStatus = jest
    .fn()
    .mockResolvedValue(undefined);
  const pinned = {
    isTransactionActive: false,
    isReleased: false,
    startTransaction: jest.fn(async () => {
      pinned.isTransactionActive = true;
    }),
    commitTransaction: jest.fn(async () => {
      pinned.isTransactionActive = false;
    }),
    rollbackTransaction: jest.fn(async () => {
      pinned.isTransactionActive = false;
    }),
    manager: { getRepository: () => repository },
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM core.workspace'))
        return [{ databaseSchema: getWorkspaceSchemaName(workspaceId) }];
      return sql.includes('information_schema.columns')
        ? appSyncedColumns
        : undefined;
    }),
  };
  const runner = new WorkspaceCommandRunnerService(
    {
      get: jest.fn().mockReturnValue('2.20.0'),
    } as unknown as TwentyConfigService,
    new UpgradeMigrationService(
      repository as unknown as Repository<UpgradeMigrationEntity>,
    ),
    {
      invalidateInstanceAndAllWorkspacesStatus,
    } as unknown as UpgradeStatusService,
    {
      currentRunner: () => pinned as unknown as QueryRunner,
    } as UpgradeWriteLockService,
  );
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM core.workspace')) {
      return [{ databaseSchema: getWorkspaceSchemaName(workspaceId) }];
    }

    return sql.includes('information_schema.columns')
      ? appSyncedColumns
      : undefined;
  });
  const dataSource = { query } as unknown as NonNullable<
    RunWorkspaceCommandsArgs['iteratorContext']['dataSource']
  >;
  const iteratorContext = { workspaceId, index: 0, total: 1 };
  const workspaceCommands = commandCases.map((commandClass) => {
    const metadata = getRegisteredWorkspaceCommandMetadata(commandClass)!;

    return {
      name: `${metadata.version}_${commandClass.name}_${metadata.timestamp}`,
      command: new commandClass({} as WorkspaceIteratorService, dataSource),
    };
  });

  return {
    runner,
    pinned,
    repository,
    rows,
    query,
    dataSource,
    iteratorContext,
    workspaceCommands,
    invalidateInstanceAndAllWorkspacesStatus,
  };
};

describe('WorkspaceCommandRunnerService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an unadapted command before its first database write', async () => {
    const harness = createHarness();
    const unadapted = jest.fn(async () => {
      await harness.dataSource.query('unsafe write');
    });

    await expect(
      harness.runner.runWorkspaceCommands({
        iteratorContext: harness.iteratorContext,
        options: {},
        workspaceCommands: [
          {
            name: 'unadapted',
            command: { runOnWorkspace: unadapted } as never,
          },
        ],
      }),
    ).rejects.toThrow('not adapted to the pinned upgrade transaction');
    expect(unadapted).not.toHaveBeenCalled();
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.rows).toEqual([
      {
        name: 'unadapted',
        workspaceId,
        attempt: 1,
        status: 'failed',
        executedByVersion: '2.20.0',
        errorMessage: expect.any(String),
      },
    ]);
  });

  it('runs metadata cache/events only after the completed receipt commits', async () => {
    const harness = createHarness();
    const afterCommitEffect = jest.fn();
    const metadataCommand = {
      runOnWorkspaceInUpgradeTransaction: jest.fn(
        async (_args, _runner, afterCommit) => {
          afterCommit(afterCommitEffect);
          expect(afterCommitEffect).not.toHaveBeenCalled();
        },
      ),
    } as never;

    await harness.runner.runWorkspaceCommands({
      iteratorContext: harness.iteratorContext,
      options: {},
      workspaceCommands: [{ name: 'metadata', command: metadataCommand }],
    });
    expect(harness.rows[0].status).toBe('completed');
    expect(
      harness.pinned.commitTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(afterCommitEffect.mock.invocationCallOrder[0]);
  });

  it('does not claim a failed receipt when COMMIT outcome is uncertain', async () => {
    const harness = createHarness();
    harness.pinned.commitTransaction.mockRejectedValueOnce(
      new Error('commit response lost'),
    );

    await expect(
      harness.runner.runWorkspaceCommands({
        iteratorContext: harness.iteratorContext,
        options: {},
        workspaceCommands: [harness.workspaceCommands[0]],
      }),
    ).rejects.toThrow('commit response lost');
    expect(harness.rows).toHaveLength(1); // Mock repository cannot model server rollback; no second receipt.
    expect(harness.rows[0].status).toBe('completed');
    expect(harness.pinned.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('does not emit a deferred metadata event if COMMIT fails', async () => {
    const harness = createHarness();
    const effect = jest.fn();
    harness.pinned.commitTransaction.mockRejectedValueOnce(
      new Error('commit response lost'),
    );
    await expect(
      harness.runner.runWorkspaceCommands({
        iteratorContext: harness.iteratorContext,
        options: {},
        workspaceCommands: [
          {
            name: 'metadata',
            command: {
              runOnWorkspaceInUpgradeTransaction: async (
                _args: unknown,
                _runner: unknown,
                afterCommit: (effect: () => void) => void,
              ) => afterCommit(effect),
            } as never,
          },
        ],
      }),
    ).rejects.toThrow('commit response lost');
    expect(effect).not.toHaveBeenCalled();
  });

  it('executes real authority and history commands in order before acknowledging each completion', async () => {
    const harness = createHarness();

    await harness.runner.runWorkspaceCommands({
      iteratorContext: {
        ...harness.iteratorContext,
        dataSource: harness.dataSource,
      },
      options: {},
      workspaceCommands: harness.workspaceCommands,
    });

    expect(harness.rows).toEqual(
      harness.workspaceCommands.map(({ name }) => ({
        name,
        workspaceId,
        attempt: 1,
        status: 'completed',
        executedByVersion: '2.20.0',
        errorMessage: null,
      })),
    );
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.pinned.query).toHaveBeenCalledTimes(4);
    expect(harness.pinned.commitTransaction).toHaveBeenCalledTimes(2);
    expect(harness.pinned.query.mock.calls[0][0]).toContain(
      'send_instagram_reply',
    );
    expect(harness.pinned.query.mock.calls[1][0]).toContain(
      'FROM core.workspace',
    );
    expect(harness.pinned.query.mock.calls[2][0]).toContain(
      'information_schema.columns',
    );
    expect(harness.pinned.query.mock.calls[3][0]).toContain('COMPOSIO_HISTORY');
    expect(harness.pinned.query.mock.invocationCallOrder[0]).toBeLessThan(
      harness.repository.save.mock.invocationCallOrder[0],
    );
    expect(harness.repository.save.mock.invocationCallOrder[0]).toBeLessThan(
      harness.pinned.query.mock.invocationCallOrder[1],
    );
    expect(harness.pinned.query.mock.invocationCallOrder[3]).toBeLessThan(
      harness.repository.save.mock.invocationCallOrder[1],
    );
  });

  it('dry-runs the real sequence with column preflight only and no migration or cache writes', async () => {
    const harness = createHarness();

    await harness.runner.runWorkspaceCommands({
      iteratorContext: {
        ...harness.iteratorContext,
        dataSource: harness.dataSource,
      },
      options: { dryRun: true },
      workspaceCommands: harness.workspaceCommands,
    });

    expect(harness.query).toHaveBeenCalledTimes(2);
    expect(harness.query.mock.calls[0][0]).toContain('FROM core.workspace');
    expect(harness.query.mock.calls[1][0]).toContain(
      'information_schema.columns',
    );
    expect(harness.repository.count).not.toHaveBeenCalled();
    expect(harness.repository.save).not.toHaveBeenCalled();
    expect(harness.rows).toEqual([]);
    expect(
      harness.invalidateInstanceAndAllWorkspacesStatus,
    ).not.toHaveBeenCalled();
  });
});
