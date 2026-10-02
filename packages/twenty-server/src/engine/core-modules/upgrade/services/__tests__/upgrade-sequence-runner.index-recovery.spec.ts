import {
  BackfillSystemUniqueIndexUniversalIdentifierCommand,
  SYSTEM_UNIQUE_INDEX_BACKFILL_UPGRADE_NAME,
} from 'src/database/commands/upgrade-version-command/2-19/2-19-workspace-command-1783093620000-backfill-system-unique-index-universal-identifier.command';
import { SynchronizeMyahStandardMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command';
import { RetireBrandBrainMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { UpgradeSequenceRunnerService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-runner.service';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const setup = (
  completed: boolean,
  failRecovery = false,
  target: 'index' | '2001' | '0410' = 'index',
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
  } as const;
  const selected = choices[target];
  const events: string[] = [];
  const reconcileCommittedUpgrade = jest.fn(async () => {
    events.push('reconciled');
    if (failRecovery) throw new Error('Redis unavailable');
  });
  const command = Object.create(selected.prototype);
  command.reconcileCommittedUpgrade = reconcileCommittedUpgrade;
  const isLastAttemptCompleted = jest.fn().mockResolvedValue(completed);
  const runner = new UpgradeSequenceRunnerService(
    { isLastAttemptCompleted } as never,
    {} as never,
    {} as never,
    {} as never,
    { refresh: jest.fn(async () => undefined) } as never,
    {} as never,
    {
      getActiveOrSuspendedWorkspaceIds: jest.fn(async () => [workspaceId]),
    } as never,
    {
      withLock: (operation: () => Promise<unknown>) => operation(),
      currentRunner: () => ({}),
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
    resolveStartCursor,
  };
};

it('republishes a completed index receipt before any cursor can skip it', async () => {
  const h = setup(true);
  await expect(h.run()).rejects.toThrow('stop at cursor');
  expect(h.isLastAttemptCompleted).toHaveBeenCalledWith(
    expect.objectContaining({
      name: SYSTEM_UNIQUE_INDEX_BACKFILL_UPGRADE_NAME,
      workspaceId,
    }),
  );
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

for (const name of ['2001', '0410'] as const) {
  it(`reconciles completed ${name} receipt before cursor, including a zero-action receipt`, async () => {
    const h = setup(true, false, name);
    await expect(h.run()).rejects.toThrow('stop at cursor');
    expect(h.reconcileCommittedUpgrade).toHaveBeenCalledWith(workspaceId);
    expect(h.events).toEqual(['reconciled', 'cursor']);
  });
  it(`keeps cursor parked when ${name} cache recovery fails`, async () => {
    const h = setup(true, true, name);
    await expect(h.run()).rejects.toThrow('Redis unavailable');
    expect(h.resolveStartCursor).not.toHaveBeenCalled();
  });
}
