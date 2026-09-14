import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import type { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import type { UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import {
  type RunWorkspaceCommandsArgs,
  WorkspaceCommandRunnerService,
} from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import type { UpgradeMigrationEntity } from 'src/engine/core-modules/upgrade/upgrade-migration.entity';

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
  {
    commandClass: InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
    prerequisiteError:
      'Cannot invalidate Composio Instagram authorities: workspace data source is required',
    queryCount: 1,
  },
  {
    commandClass: BackfillComposioInstagramHistoryWorkspaceCommand,
    prerequisiteError:
      'Cannot backfill Composio Instagram history: workspace data source is required',
    queryCount: 2,
  },
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
  );
  const query = jest.fn(async (sql: string) =>
    sql.includes('information_schema.columns') ? appSyncedColumns : undefined,
  );
  const dataSource = { query } as unknown as NonNullable<
    RunWorkspaceCommandsArgs['iteratorContext']['dataSource']
  >;
  const iteratorContext = { workspaceId, index: 0, total: 1 };
  const workspaceCommands = commandCases.map(({ commandClass }) => {
    const metadata = getRegisteredWorkspaceCommandMetadata(commandClass)!;

    return {
      name: `${metadata.version}_${commandClass.name}_${metadata.timestamp}`,
      command: new commandClass({} as WorkspaceIteratorService),
    };
  });

  return {
    runner,
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

  describe.each(commandCases)(
    '$commandClass.name datasource prerequisite',
    ({ commandClass, prerequisiteError, queryCount }) => {
      it('records only a failed attempt, stops the sequence, and completes on retry with a data source', async () => {
        const harness = createHarness();
        const entry = harness.workspaceCommands.find(
          ({ command }) => command instanceof commandClass,
        )!;
        const subsequentCommand = jest.fn().mockResolvedValue(undefined);
        const workspaceCommands = [
          entry,
          {
            name: 'subsequent-workspace-command',
            command: {
              runOnWorkspace: subsequentCommand,
            } as unknown as typeof entry.command,
          },
        ];
        const run = (withDataSource: boolean) =>
          harness.runner.runWorkspaceCommands({
            iteratorContext: {
              ...harness.iteratorContext,
              dataSource: withDataSource ? harness.dataSource : undefined,
            },
            options: {},
            workspaceCommands,
          });
        const error = await run(false).then(
          () => undefined,
          (failure: unknown) => failure,
        );

        expect(harness.rows).toEqual([
          {
            name: entry.name,
            workspaceId,
            attempt: 1,
            status: 'failed',
            executedByVersion: '2.20.0',
            errorMessage: expect.stringContaining(prerequisiteError),
          },
        ]);
        expect(error).toEqual(new Error(prerequisiteError));
        expect(subsequentCommand).not.toHaveBeenCalled();
        expect(harness.query).not.toHaveBeenCalled();
        expect(harness.repository.save).toHaveBeenCalledTimes(1);
        expect(
          harness.invalidateInstanceAndAllWorkspacesStatus,
        ).toHaveBeenCalledTimes(1);

        await expect(run(true)).resolves.toBeUndefined();

        expect(
          harness.rows.map(({ name, attempt, status }) => ({
            name,
            attempt,
            status,
          })),
        ).toEqual([
          { name: entry.name, attempt: 1, status: 'failed' },
          { name: entry.name, attempt: 2, status: 'completed' },
          {
            name: 'subsequent-workspace-command',
            attempt: 1,
            status: 'completed',
          },
        ]);
        expect(harness.rows[1].errorMessage).toBeNull();
        expect(subsequentCommand).toHaveBeenCalledTimes(1);
        expect(harness.query).toHaveBeenCalledTimes(queryCount);
        expect(
          harness.invalidateInstanceAndAllWorkspacesStatus,
        ).toHaveBeenCalledTimes(2);
      });

      it('rejects missing data source during dry-run without migration or query writes', async () => {
        const harness = createHarness();
        const entry = harness.workspaceCommands.find(
          ({ command }) => command instanceof commandClass,
        )!;

        await expect(
          harness.runner.runWorkspaceCommands({
            iteratorContext: harness.iteratorContext,
            options: { dryRun: true },
            workspaceCommands: [entry],
          }),
        ).rejects.toThrow(prerequisiteError);

        expect(harness.query).not.toHaveBeenCalled();
        expect(harness.repository.count).not.toHaveBeenCalled();
        expect(harness.repository.save).not.toHaveBeenCalled();
        expect(harness.rows).toEqual([]);
        expect(
          harness.invalidateInstanceAndAllWorkspacesStatus,
        ).not.toHaveBeenCalled();
      });
    },
  );

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
    expect(harness.query).toHaveBeenCalledTimes(3);
    expect(harness.query.mock.calls[0][0]).toContain('send_instagram_reply');
    expect(harness.query.mock.calls[1][0]).toContain(
      'information_schema.columns',
    );
    expect(harness.query.mock.calls[2][0]).toContain('COMPOSIO_HISTORY');
    expect(harness.query.mock.invocationCallOrder[0]).toBeLessThan(
      harness.repository.save.mock.invocationCallOrder[0],
    );
    expect(harness.repository.save.mock.invocationCallOrder[0]).toBeLessThan(
      harness.query.mock.invocationCallOrder[1],
    );
    expect(harness.query.mock.invocationCallOrder[2]).toBeLessThan(
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

    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.query.mock.calls[0][0]).toContain(
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
