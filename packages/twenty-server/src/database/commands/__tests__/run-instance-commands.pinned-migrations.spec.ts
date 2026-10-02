import { type DataSource, type QueryRunner } from 'typeorm';
import { MigrationExecutor } from 'typeorm/migration/MigrationExecutor';

import { RunInstanceCommandsCommand } from 'src/database/commands/run-instance-commands.command';
import { type InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import { type UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { type UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { type UpgradeStatusService } from 'src/engine/core-modules/upgrade/services/upgrade-status.service';
import { type WorkspaceVersionService } from 'src/engine/workspace-manager/workspace-version/services/workspace-version.service';

jest.mock('typeorm/migration/MigrationExecutor');

describe('frozen TypeORM migration preparation', () => {
  const runner = { isReleased: false } as QueryRunner;
  const getPendingMigrations = jest.fn();
  const executePendingMigrations = jest.fn();
  const runMigrations = jest.fn();
  const runFastInstanceCommand = jest.fn();
  const invalidate = jest.fn();
  const getUpgradeSequence = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getPendingMigrations.mockResolvedValue([]);
    executePendingMigrations.mockResolvedValue([]);
    runFastInstanceCommand.mockResolvedValue({ status: 'success' });
    getUpgradeSequence.mockReturnValue([
      { kind: 'fast-instance', name: 'next', command: {} },
    ]);
    jest.mocked(MigrationExecutor).mockImplementation(
      () =>
        ({
          getPendingMigrations,
          executePendingMigrations,
        }) as unknown as MigrationExecutor,
    );
  });

  const makeCommand = () => {
    const dataSource = { runMigrations } as unknown as DataSource;
    const command = new RunInstanceCommandsCommand(
      dataSource,
      {
        getActiveOrSuspendedWorkspaceIds: jest.fn().mockResolvedValue([]),
      } as unknown as WorkspaceVersionService,
      {} as UpgradeCommandRegistryService,
      { getUpgradeSequence } as unknown as UpgradeSequenceReaderService,
      { runFastInstanceCommand } as unknown as InstanceCommandRunnerService,
      {
        hasInstanceAttempt: jest.fn().mockResolvedValue(false),
      } as unknown as UpgradeMigrationService,
      {
        invalidateInstanceAndAllWorkspacesStatus: invalidate,
      } as unknown as UpgradeStatusService,
      {
        withLock: async (operation: () => Promise<unknown>) => operation(),
        currentRunner: () => runner,
      } as never,
    );

    return { command, dataSource };
  };

  it('pins the TypeORM executor to the lock backend, with native each-transaction mode', async () => {
    getPendingMigrations.mockResolvedValue([
      { name: 'Pending1780000000000', instance: {} },
    ]);
    executePendingMigrations.mockResolvedValue([
      { name: 'Pending1780000000000' },
    ]);
    const { command, dataSource } = makeCommand();

    await command.run([], { force: true, includeSlow: true });

    expect(MigrationExecutor).toHaveBeenCalledWith(dataSource, runner);
    expect(
      jest.mocked(MigrationExecutor).mock.results[0].value.transaction,
    ).toBe('each');
    expect(getPendingMigrations).toHaveBeenCalledTimes(1);
    expect(executePendingMigrations).toHaveBeenCalledTimes(1);
    expect(runMigrations).not.toHaveBeenCalled();
    expect(runFastInstanceCommand).toHaveBeenCalledTimes(1);
  });

  it('rejects truly pending nontransactional migrations before any writes even with --force', async () => {
    getPendingMigrations.mockResolvedValue([
      { name: 'AlreadyApplied1780000000000', instance: {} },
      {
        name: 'Untransactional1780000000001',
        instance: { transaction: false },
      },
    ]);
    const { command } = makeCommand();

    await expect(
      command.run([], { force: true, includeSlow: true }),
    ).rejects.toThrow(
      /pending nontransactional migrations.*Untransactional1780000000001/,
    );
    expect(executePendingMigrations).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
    expect(runFastInstanceCommand).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not invent an instance receipt or continue replay when the pinned migration backend is lost', async () => {
    getPendingMigrations.mockResolvedValue([
      { name: 'Pending1780000000000', instance: {} },
    ]);
    executePendingMigrations.mockRejectedValue(new Error('backend lost'));
    const { command } = makeCommand();

    await expect(
      command.run([], { force: true, includeSlow: true }),
    ).rejects.toThrow('backend lost');
    expect(runFastInstanceCommand).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it('does not create a migrations table or receipt when no migration is pending', async () => {
    const { command } = makeCommand();
    await command.run([], { force: true });
    expect(executePendingMigrations).not.toHaveBeenCalled();
    expect(runFastInstanceCommand).toHaveBeenCalledTimes(1);
  });
});
