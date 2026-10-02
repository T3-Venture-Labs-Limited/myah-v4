import {
  BackfillSystemUniqueIndexUniversalIdentifierCommand,
  SYSTEM_UNIQUE_INDEX_BACKFILL_UPGRADE_NAME,
} from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1783093620000-backfill-system-unique-index-universal-identifier.command';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RetireBrandBrainMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { SynchronizeInstagramSourceControlledMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790491923604-synchronize-instagram-source-controlled-metadata.command';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const setup = (
  completed: boolean,
  failRecovery = false,
  target: 'index' | '2001' | '0410' | '3604' = 'index',
  wrongClass = false,
  receipt: 'initial' | 'failed' | 'missing' | 'executed' = 'executed',
) => {
  const choices = {
    index: {
      prototype: BackfillSystemUniqueIndexUniversalIdentifierCommand.prototype,
      name: SYSTEM_UNIQUE_INDEX_BACKFILL_UPGRADE_NAME,
      timestamp: 1783093620000,
      version: '2.19.0',
    },
    '2001': {
      prototype: SynchronizeMyahStandardMetadataCommand.prototype,
      name: '2.20.0_SynchronizeMyahStandardMetadataCommand_1784266302001',
      timestamp: 1784266302001,
      version: '2.20.0',
    },
    '0410': {
      prototype: RetireBrandBrainMetadataCommand.prototype,
      name: '2.20.0_RetireBrandBrainMetadataCommand_1790000000410',
      timestamp: 1790000000410,
      version: '2.20.0',
    },
    '3604': {
      prototype: SynchronizeInstagramSourceControlledMetadataCommand.prototype,
      name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
      timestamp: 1790491923604,
      version: '2.20.0',
    },
  } as const;
  const selected = choices[target];
  const events: string[] = [];
  const reconcileCommittedUpgrade = jest.fn(async () => {
    events.push('reconciled');
    if (failRecovery) throw new Error('Redis unavailable');
  });
  const command = Object.create(
    wrongClass ? RetireBrandBrainMetadataCommand.prototype : selected.prototype,
  );
  command.reconcileCommittedUpgrade = reconcileCommittedUpgrade;
  const findOne = jest.fn().mockResolvedValue(
    receipt === 'missing'
      ? null
      : {
          status: receipt === 'failed' ? 'failed' : 'completed',
          isInitial: receipt === 'initial',
        },
  );
  const migrationService = new UpgradeMigrationService({ findOne } as never);
  const isLastAttemptCompleted =
    target === '3604'
      ? jest.spyOn(migrationService, 'isLastAttemptCompleted')
      : jest.fn().mockResolvedValue(completed);
  const runWorkspaceCommands = jest.fn();
  const runFastInstanceCommand = jest.fn();
  const runSlowInstanceCommand = jest.fn();
  const runner = new UpgradeSequenceRunnerService(
    (target === '3604'
      ? migrationService
      : { isLastAttemptCompleted }) as never,
    { runFastInstanceCommand, runSlowInstanceCommand } as never,
    { runWorkspaceCommands } as never,
    {} as never,
    { refresh: jest.fn(async () => undefined) } as never,
    {} as never,
    {
      getActiveOrSuspendedWorkspaceIds: jest.fn(async () => [workspaceId]),
    } as never,
    {
      withLock: async (operation: () => Promise<unknown>) => {
        if (target === '3604') events.push('lock:enter');
        try {
          return await operation();
        } finally {
          if (target === '3604') events.push('lock:exit');
        }
      },
      currentRunner: () => ({
        manager: { getRepository: () => ({ findOne }) },
      }),
    } as never,
  );
  const resolveStartCursor = jest.fn(async () => {
    events.push('cursor');
    throw new Error('stop at cursor');
  });
  (
    runner as unknown as { resolveStartCursor: typeof resolveStartCursor }
  ).resolveStartCursor = resolveStartCursor;
  const run = () =>
    runner.run({
      sequence: [
        {
          kind: 'workspace',
          command,
          name: selected.name,
          timestamp: selected.timestamp,
          version: selected.version,
        },
      ],
      options: {},
    });
  return {
    run,
    events,
    reconcileCommittedUpgrade,
    isLastAttemptCompleted,
    findOne,
    resolveStartCursor,
    runWorkspaceCommands,
    runFastInstanceCommand,
    runSlowInstanceCommand,
  };
};

it('republishes a completed index receipt before any cursor can skip it', async () => {
  const h = setup(true);
  await expect(h.run()).rejects.toThrow('stop at cursor');
  expect(h.isLastAttemptCompleted).toHaveBeenCalledWith({
    name: SYSTEM_UNIQUE_INDEX_BACKFILL_UPGRADE_NAME,
    workspaceId,
    queryRunner: expect.any(Object),
  });
  expect(h.reconcileCommittedUpgrade).toHaveBeenCalledWith(workspaceId);
  expect(h.events).toEqual(['reconciled', 'cursor']);
});

it('does not advance cursor if completed-receipt cache recovery fails', async () => {
  const h = setup(true, true);
  await expect(h.run()).rejects.toThrow('Redis unavailable');
  expect(h.resolveStartCursor).not.toHaveBeenCalled();
});

it('does not publish for an uncommitted index attempt', async () => {
  const h = setup(false);
  await expect(h.run()).rejects.toThrow('stop at cursor');
  expect(h.reconcileCommittedUpgrade).not.toHaveBeenCalled();
});

it('skips a completed initial 3604 checkpoint before the cursor', async () => {
  const h = setup(true, false, '3604', false, 'initial');
  await expect(h.run()).rejects.toThrow('stop at cursor');
  expect(h.events).toEqual(['lock:enter', 'cursor', 'lock:exit']);
  expect(h.reconcileCommittedUpgrade).not.toHaveBeenCalled();
  expect(h.findOne).toHaveBeenCalledWith({
    where: {
      name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
      workspaceId,
    },
    order: { attempt: 'DESC' },
  });
});

it('reconciles completed 3604 before the cursor under lock on every resumed run without replaying writes', async () => {
  const h = setup(true, false, '3604');
  await expect(h.run()).rejects.toThrow('stop at cursor');
  await expect(h.run()).rejects.toThrow('stop at cursor');
  expect(h.events).toEqual([
    'lock:enter',
    'reconciled',
    'cursor',
    'lock:exit',
    'lock:enter',
    'reconciled',
    'cursor',
    'lock:exit',
  ]);
  expect(h.isLastAttemptCompleted).toHaveBeenCalledTimes(2);
  expect(h.isLastAttemptCompleted).toHaveBeenCalledWith({
    name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
    workspaceId,
    queryRunner: expect.any(Object),
    requireNonInitial: true,
  });
  expect(h.reconcileCommittedUpgrade).toHaveBeenCalledTimes(2);
  expect(h.reconcileCommittedUpgrade).toHaveBeenNthCalledWith(1, workspaceId);
  expect(h.reconcileCommittedUpgrade).toHaveBeenNthCalledWith(2, workspaceId);
  expect(h.runWorkspaceCommands).not.toHaveBeenCalled();
  expect(h.runFastInstanceCommand).not.toHaveBeenCalled();
  expect(h.runSlowInstanceCommand).not.toHaveBeenCalled();
});

// A previous completed execution cannot override the latest failed attempt.
it.each(['missing', 'failed'] as const)(
  'does not reconcile 3604 for a latest %s receipt',
  async (receipt) => {
    const incomplete = setup(false, false, '3604', false, receipt);
    await expect(incomplete.run()).rejects.toThrow('stop at cursor');
    expect(incomplete.reconcileCommittedUpgrade).not.toHaveBeenCalled();
    expect(incomplete.events).toEqual(['lock:enter', 'cursor', 'lock:exit']);
    expect(incomplete.isLastAttemptCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
        workspaceId,
        requireNonInitial: true,
      }),
    );
    expect(incomplete.findOne).toHaveBeenCalledWith({
      where: {
        name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
        workspaceId,
      },
      order: { attempt: 'DESC' },
    });
  },
);

it('holds the 3604 cursor when committed cache reconciliation fails', async () => {
  const failed = setup(true, true, '3604');
  await expect(failed.run()).rejects.toThrow('Redis unavailable');
  expect(failed.events).toEqual(['lock:enter', 'reconciled', 'lock:exit']);
  expect(failed.resolveStartCursor).not.toHaveBeenCalled();
});

it('fails closed on wrong 3604 constructor under lock before checking receipt or cursor', async () => {
  const h = setup(true, false, '3604', true);
  await expect(h.run()).rejects.toThrow(
    'Recovery command not registered: 2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
  );
  expect(h.events).toEqual(['lock:enter', 'lock:exit']);
  expect(h.isLastAttemptCompleted).not.toHaveBeenCalled();
  expect(h.resolveStartCursor).not.toHaveBeenCalled();
});

for (const name of ['2001', '0410'] as const) {
  it(`reconciles completed ${name} receipt before cursor, including a zero-action receipt`, async () => {
    const h = setup(true, false, name);
    await expect(h.run()).rejects.toThrow('stop at cursor');
    expect(h.reconcileCommittedUpgrade).toHaveBeenCalledWith(workspaceId);
    expect(h.isLastAttemptCompleted).toHaveBeenCalledWith({
      name:
        name === '2001'
          ? '2.20.0_SynchronizeMyahStandardMetadataCommand_1784266302001'
          : '2.20.0_RetireBrandBrainMetadataCommand_1790000000410',
      workspaceId,
      queryRunner: expect.any(Object),
    });
    expect(h.events).toEqual(['reconciled', 'cursor']);
  });
  it(`keeps cursor parked when ${name} cache recovery fails`, async () => {
    const h = setup(true, true, name);
    await expect(h.run()).rejects.toThrow('Redis unavailable');
    expect(h.resolveStartCursor).not.toHaveBeenCalled();
  });
}
