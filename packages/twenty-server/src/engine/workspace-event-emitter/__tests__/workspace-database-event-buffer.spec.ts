import { executeCommonQueryTransactionEnvelope } from 'src/engine/api/common/common-query-runners/utils/execute-common-query-transaction-envelope.util';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import {
  enqueueWorkspaceDatabaseEvent,
  flushBufferedWorkspaceDatabaseEvents,
  runWithWorkspaceDatabaseEventBuffer,
} from 'src/engine/workspace-event-emitter/utils/workspace-database-event-buffer';

describe('Workspace database event transaction buffer', () => {
  const makeTransactionContext = () => {
    const manager = { id: 'transaction-manager' };
    const queryRunner = {
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
      manager,
      release: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
    };

    return {
      dataSource: { createQueryRunner: jest.fn(() => queryRunner) },
      queryRunner,
    };
  };

  it('buffers WorkspaceEventEmitter database events but leaves default emission immediate', async () => {
    const eventEmitter = { emit: jest.fn() };
    const workspaceEventEmitter = new WorkspaceEventEmitter(
      eventEmitter as never,
    );
    const input = {
      action: DatabaseEventAction.DELETED,
      events: [{ recordId: 'campaign-a' }],
      objectMetadata: {} as never,
      objectMetadataNameSingular: 'campaign',
      workspaceId: 'workspace-a',
    };

    workspaceEventEmitter.emitDatabaseBatchEvent(input as never);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    eventEmitter.emit.mockClear();

    const { bufferedEvents } = await runWithWorkspaceDatabaseEventBuffer(
      async () => {
        workspaceEventEmitter.emitDatabaseBatchEvent(input as never);
        expect(eventEmitter.emit).not.toHaveBeenCalled();
      },
    );

    flushBufferedWorkspaceDatabaseEvents(bufferedEvents, jest.fn());
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
  });

  it('flushes an emitter event only after the transaction envelope commits', async () => {
    const eventEmitter = { emit: jest.fn() };
    const workspaceEventEmitter = new WorkspaceEventEmitter(
      eventEmitter as never,
    );
    const { dataSource, queryRunner } = makeTransactionContext();
    await runWithWorkspaceDatabaseEventBuffer(async (flush) =>
      executeCommonQueryTransactionEnvelope(
        dataSource as never,
        async () => {
          workspaceEventEmitter.emitDatabaseBatchEvent({
            action: DatabaseEventAction.DELETED,
            events: [{ recordId: 'campaign-a' }],
            objectMetadata: {} as never,
            objectMetadataNameSingular: 'campaign',
            workspaceId: 'workspace-a',
          } as never);

          expect(eventEmitter.emit).not.toHaveBeenCalled();

          return 'committed';
        },
        () => flush(jest.fn()),
      ),
    );

    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(
      queryRunner.commitTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(eventEmitter.emit.mock.invocationCallOrder[0]);
    expect(eventEmitter.emit.mock.invocationCallOrder[0]).toBeLessThan(
      queryRunner.release.mock.invocationCallOrder[0],
    );
  });

  it.each(['callback', 'commit'] as const)(
    'discards emitter events when the transaction %s fails',
    async (failurePoint) => {
      const eventEmitter = { emit: jest.fn() };
      const workspaceEventEmitter = new WorkspaceEventEmitter(
        eventEmitter as never,
      );
      const { dataSource, queryRunner } = makeTransactionContext();
      const failure = new Error(`${failurePoint} failed`);

      if (failurePoint === 'commit') {
        queryRunner.commitTransaction.mockRejectedValueOnce(failure);
      }

      await expect(
        runWithWorkspaceDatabaseEventBuffer(async (flush) =>
          executeCommonQueryTransactionEnvelope(
            dataSource as never,
            async () => {
              workspaceEventEmitter.emitDatabaseBatchEvent({
                action: DatabaseEventAction.DELETED,
                events: [{ recordId: 'campaign-a' }],
                objectMetadata: {} as never,
                objectMetadataNameSingular: 'campaign',
                workspaceId: 'workspace-a',
              } as never);

              if (failurePoint === 'callback') throw failure;
            },
            () => flush(jest.fn()),
          ),
        ),
      ).rejects.toBe(failure);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    },
  );

  it('flushes a committed child before a later parent rollback', async () => {
    const calls: string[] = [];
    const parentFailure = new Error('parent rolled back');

    await expect(
      runWithWorkspaceDatabaseEventBuffer(async () => {
        enqueueWorkspaceDatabaseEvent(() => calls.push('parent'));

        await runWithWorkspaceDatabaseEventBuffer(async (flushChild) => {
          enqueueWorkspaceDatabaseEvent(() => calls.push('child'));
          flushChild(jest.fn());
        });

        expect(calls).toEqual(['child']);
        throw parentFailure;
      }),
    ).rejects.toBe(parentFailure);

    expect(calls).toEqual(['child']);
  });

  it('discards a caught child rollback while restoring the parent buffer', async () => {
    const calls: string[] = [];
    const childFailure = new Error('child rolled back');
    const parent = await runWithWorkspaceDatabaseEventBuffer(
      async (flushParent) => {
        enqueueWorkspaceDatabaseEvent(() => calls.push('parent-before'));

        await expect(
          runWithWorkspaceDatabaseEventBuffer(async () => {
            enqueueWorkspaceDatabaseEvent(() => calls.push('child'));
            throw childFailure;
          }),
        ).rejects.toBe(childFailure);

        enqueueWorkspaceDatabaseEvent(() => calls.push('parent-after'));
        flushParent(jest.fn());
      },
    );

    expect(parent.bufferedEvents).toEqual([]);
    expect(calls).toEqual(['parent-before', 'parent-after']);
  });

  it('flushes both committed scopes in transaction-commit order', async () => {
    const calls: string[] = [];

    await runWithWorkspaceDatabaseEventBuffer(async (flushParent) => {
      enqueueWorkspaceDatabaseEvent(() => calls.push('parent-before'));

      await runWithWorkspaceDatabaseEventBuffer(async (flushChild) => {
        enqueueWorkspaceDatabaseEvent(() => calls.push('child'));
        flushChild(jest.fn());
      });

      enqueueWorkspaceDatabaseEvent(() => calls.push('parent-after'));
      expect(calls).toEqual(['child']);
      flushParent(jest.fn());
    });

    expect(calls).toEqual(['child', 'parent-before', 'parent-after']);
  });

  it('contains a child flush failure and restores the parent scope', async () => {
    const calls: string[] = [];
    const reportFailure = jest.fn();
    const failure = new Error('child listener failed');

    await runWithWorkspaceDatabaseEventBuffer(async (flushParent) => {
      enqueueWorkspaceDatabaseEvent(() => calls.push('parent'));

      await runWithWorkspaceDatabaseEventBuffer(async (flushChild) => {
        enqueueWorkspaceDatabaseEvent(() => {
          throw failure;
        });
        enqueueWorkspaceDatabaseEvent(() => calls.push('child-after-failure'));
        flushChild(reportFailure);
      });

      enqueueWorkspaceDatabaseEvent(() => calls.push('parent-after-child'));
      flushParent(reportFailure);
    });

    expect(reportFailure).toHaveBeenCalledWith(failure);
    expect(calls).toEqual([
      'child-after-failure',
      'parent',
      'parent-after-child',
    ]);
  });

  it('does not buffer outside an opted-in scope', () => {
    expect(enqueueWorkspaceDatabaseEvent(jest.fn())).toBe(false);
  });

  it('flushes committed events once in insertion order', async () => {
    const calls: string[] = [];
    const { bufferedEvents, result } =
      await runWithWorkspaceDatabaseEventBuffer(async () => {
        expect(enqueueWorkspaceDatabaseEvent(() => calls.push('first'))).toBe(
          true,
        );
        expect(enqueueWorkspaceDatabaseEvent(() => calls.push('second'))).toBe(
          true,
        );

        return 'committed';
      });

    expect(calls).toEqual([]);
    expect(result).toBe('committed');

    flushBufferedWorkspaceDatabaseEvents(bufferedEvents, jest.fn());

    expect(calls).toEqual(['first', 'second']);
  });

  it('discards callback failures without leaking into the next scope', async () => {
    const leakedEvent = jest.fn();

    await expect(
      runWithWorkspaceDatabaseEventBuffer(async () => {
        enqueueWorkspaceDatabaseEvent(leakedEvent);
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');

    const next = await runWithWorkspaceDatabaseEventBuffer(async () => {
      return 'next';
    });

    flushBufferedWorkspaceDatabaseEvents(next.bufferedEvents, jest.fn());

    expect(leakedEvent).not.toHaveBeenCalled();
  });

  it('keeps overlapping scopes isolated', async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runWithWorkspaceDatabaseEventBuffer(async () => {
      enqueueWorkspaceDatabaseEvent(() => calls.push('first'));
      await firstGate;

      return 'first';
    });
    const second = await runWithWorkspaceDatabaseEventBuffer(async () => {
      enqueueWorkspaceDatabaseEvent(() => calls.push('second'));

      return 'second';
    });

    flushBufferedWorkspaceDatabaseEvents(second.bufferedEvents, jest.fn());
    expect(calls).toEqual(['second']);

    releaseFirst();
    const completedFirst = await first;

    flushBufferedWorkspaceDatabaseEvents(
      completedFirst.bufferedEvents,
      jest.fn(),
    );
    expect(calls).toEqual(['second', 'first']);
  });

  it('contains postcommit emission failures and continues flushing', async () => {
    const emitted = jest.fn();
    const reportFailure = jest.fn();
    const failure = new Error('listener failed');
    const { bufferedEvents } = await runWithWorkspaceDatabaseEventBuffer(
      async () => {
        enqueueWorkspaceDatabaseEvent(() => {
          throw failure;
        });
        enqueueWorkspaceDatabaseEvent(emitted);
      },
    );

    expect(() =>
      flushBufferedWorkspaceDatabaseEvents(bufferedEvents, reportFailure),
    ).not.toThrow();
    expect(reportFailure).toHaveBeenCalledWith(failure);
    expect(emitted).toHaveBeenCalledTimes(1);
  });
});
