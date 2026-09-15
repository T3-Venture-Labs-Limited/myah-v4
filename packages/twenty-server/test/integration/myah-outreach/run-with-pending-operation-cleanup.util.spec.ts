import {
  assertPendingWriteCleanupSettled,
  drainPendingOperationCleanup,
  PendingWriteCleanupError,
  runWithPendingOperationCleanup,
} from './run-with-pending-operation-cleanup.util';

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

const deferred = <T>(): Deferred<T> => {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
};

describe('runWithPendingOperationCleanup', () => {
  it('aborts and drains a pending write before finalizing while preserving the primary failure', async () => {
    const events: string[] = [];
    const write = deferred<void>();
    const abortRelease = deferred<void>();
    let committed = false;
    const operation = write.promise.then(() => {
      committed = true;
    });
    void operation.catch(() => undefined);
    const assertionFailure = new Error('injected assertion failure');

    const result = runWithPendingOperationCleanup(
      async () => {
        events.push('assertion');
        throw assertionFailure;
      },
      {
        abort: async () => {
          events.push('abort:start');
          await abortRelease.promise;
          write.reject(new Error('write cancelled'));
          events.push('abort:end');
        },
        drain: async () => {
          events.push('drain:start');
          const [settled] = await Promise.allSettled([operation]);

          expect(settled.status).toBe('rejected');
          events.push('drain:end');
        },
        finalize: async () => {
          events.push('finalize');
        },
        reportCleanupFailure: jest.fn(),
        timeoutMs: 500,
      },
    );

    await Promise.resolve();
    expect(events).toEqual(['assertion', 'abort:start']);
    abortRelease.resolve();

    await expect(result).rejects.toBe(assertionFailure);
    expect(events).toEqual([
      'assertion',
      'abort:start',
      'abort:end',
      'drain:start',
      'drain:end',
      'finalize',
    ]);
    expect(committed).toBe(false);
  });

  it('bounds and serializes overlapping cleanup without releasing under an outstanding abort', async () => {
    jest.useFakeTimers();
    const abortRelease = deferred<void>();
    const cleanupFinished = deferred<void>();
    const events: string[] = [];
    let abortStarts = 0;
    let firstState = 'pending';
    let secondState = 'pending';
    const cleanup = {
      abort: async () => {
        abortStarts += 1;
        events.push('abort:start');
        await abortRelease.promise;
        events.push('abort:end');
      },
      drain: async () => {
        events.push('drain');
      },
      finalize: async () => {
        events.push('finalize');
        cleanupFinished.resolve();
      },
      reportCleanupFailure: jest.fn(),
      timeoutMs: 10,
    };

    const first = drainPendingOperationCleanup(cleanup).then(
      () => {
        firstState = 'resolved';
      },
      () => {
        firstState = 'rejected';
      },
    );
    const second = drainPendingOperationCleanup(cleanup).then(
      () => {
        secondState = 'resolved';
      },
      () => {
        secondState = 'rejected';
      },
    );

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10);
    const stateAtTimeout = {
      abortStarts,
      events: [...events],
      firstState,
      secondState,
    };

    abortRelease.resolve();
    await cleanupFinished.promise;
    await Promise.allSettled([first, second]);

    expect(stateAtTimeout).toEqual({
      abortStarts: 1,
      events: ['abort:start'],
      firstState: 'rejected',
      secondState: 'rejected',
    });
    expect(events).toEqual(['abort:start', 'abort:end', 'drain', 'finalize']);
    expect(cleanup.reportCleanupFailure).toHaveBeenCalledWith(
      'abort',
      expect.objectContaining({
        message: 'Timed out during abort after 10ms',
      }),
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds and serializes successful-path finalization against hook cleanup', async () => {
    jest.useFakeTimers();
    const finalizeRelease = deferred<void>();
    const cleanupFinished = deferred<void>();
    const events: string[] = [];
    const cleanup = {
      abort: async () => {
        events.push('abort');
      },
      drain: async () => {
        events.push('drain');
      },
      finalize: async () => {
        events.push('finalize:start');
        await finalizeRelease.promise;
        events.push('finalize:end');
        cleanupFinished.resolve();
      },
      reportCleanupFailure: jest.fn(),
      timeoutMs: 10,
    };

    const success = runWithPendingOperationCleanup(async () => 'ok', cleanup);
    const successExpectation = expect(success).rejects.toThrow(
      'Timed out during finalize after 10ms',
    );

    await Promise.resolve();
    expect(events).toEqual(['finalize:start']);
    const overlappingHookCleanup = drainPendingOperationCleanup(cleanup);
    const hookExpectation = expect(overlappingHookCleanup).rejects.toThrow(
      'Timed out during finalize after 10ms',
    );

    await jest.advanceTimersByTimeAsync(10);
    await successExpectation;
    await hookExpectation;
    expect(events).toEqual(['finalize:start']);

    finalizeRelease.resolve();
    await cleanupFinished.promise;
    expect(events).toEqual(['finalize:start', 'finalize:end']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['abort', 'drain', 'finalize'] as const)(
    'reports a secondary %s failure without replacing the primary failure',
    async (failedPhase) => {
      const assertionFailure = new Error('injected assertion failure');
      const cleanupFailure = new Error(`${failedPhase} failed`);
      const reportCleanupFailure = jest.fn();

      const result = runWithPendingOperationCleanup(
        async () => {
          throw assertionFailure;
        },
        {
          abort: async () => {
            if (failedPhase === 'abort') throw cleanupFailure;
          },
          drain: async () => {
            if (failedPhase === 'drain') throw cleanupFailure;
          },
          finalize: async () => {
            if (failedPhase === 'finalize') throw cleanupFailure;
          },
          reportCleanupFailure,
          timeoutMs: 500,
        },
      );

      await expect(result).rejects.toBe(assertionFailure);
      expect(reportCleanupFailure).toHaveBeenCalledWith(
        failedPhase,
        cleanupFailure,
      );
    },
  );

  it('fails with a cleanup error when there is no primary failure', async () => {
    const cleanupFailure = new Error('finalize failed');
    const reportCleanupFailure = jest.fn();

    await expect(
      runWithPendingOperationCleanup(async () => 'ok', {
        abort: jest.fn(),
        drain: jest.fn(),
        finalize: async () => {
          throw cleanupFailure;
        },
        reportCleanupFailure,
        timeoutMs: 500,
      }),
    ).rejects.toBe(cleanupFailure);
    expect(reportCleanupFailure).toHaveBeenCalledWith(
      'finalize',
      cleanupFailure,
    );
  });

  it('reports a rejected status update without replacing the primary assertion', async () => {
    const assertionFailure = new Error('injected assertion failure');
    const expectedSaveCancellation = Object.assign(new Error('cancelled'), {
      code: '57014',
    });
    const statusUpdateFailure = new Error('status update failed');
    const reportCleanupFailure = jest.fn();

    const result = runWithPendingOperationCleanup(
      async () => {
        throw assertionFailure;
      },
      {
        abort: async () => undefined,
        drain: async () => {
          assertPendingWriteCleanupSettled({
            isExpectedSaveCancellation: (error) =>
              (error as { code?: string }).code === '57014',
            saveCancellationConfirmed: true,
            saveResult: {
              reason: expectedSaveCancellation,
              status: 'rejected',
            },
            statusUpdateResult: {
              reason: statusUpdateFailure,
              status: 'rejected',
            },
          });
        },
        finalize: async () => undefined,
        reportCleanupFailure,
        timeoutMs: 500,
      },
    );

    await expect(result).rejects.toBe(assertionFailure);
    expect(reportCleanupFailure).toHaveBeenCalledWith(
      'drain',
      expect.objectContaining({
        failures: [{ operation: 'statusUpdate', reason: statusUpdateFailure }],
      }),
    );
  });

  it('preserves unexpected save and status-update rejection reasons', () => {
    const unexpectedSaveFailure = new Error('save failed before cancellation');
    const statusUpdateFailure = new Error('status update failed');
    let thrown: unknown;

    try {
      assertPendingWriteCleanupSettled({
        isExpectedSaveCancellation: () => false,
        saveCancellationConfirmed: true,
        saveResult: {
          reason: unexpectedSaveFailure,
          status: 'rejected',
        },
        statusUpdateResult: {
          reason: statusUpdateFailure,
          status: 'rejected',
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PendingWriteCleanupError);
    expect(thrown).toMatchObject({
      failures: [
        { operation: 'save', reason: unexpectedSaveFailure },
        { operation: 'statusUpdate', reason: statusUpdateFailure },
      ],
    });
  });

  it('does not treat a cancellation-shaped rejection as expected before cancellation is confirmed', () => {
    const preexistingFailure = Object.assign(new Error('query cancelled'), {
      code: '57014',
    });

    expect(() =>
      assertPendingWriteCleanupSettled({
        isExpectedSaveCancellation: (error) => error === preexistingFailure,
        saveCancellationConfirmed: false,
        saveResult: { reason: preexistingFailure, status: 'rejected' },
      }),
    ).toThrow(PendingWriteCleanupError);
  });

  it('drains every cleanup phase and fails explicitly when no primary failure exists', async () => {
    const events: string[] = [];
    const abortFailure = new Error('abort failed');
    const reportCleanupFailure = jest.fn();

    await expect(
      drainPendingOperationCleanup({
        abort: async () => {
          events.push('abort');
          throw abortFailure;
        },
        drain: async () => {
          events.push('drain');
        },
        finalize: async () => {
          events.push('finalize');
        },
        reportCleanupFailure,
        timeoutMs: 500,
      }),
    ).rejects.toBe(abortFailure);
    expect(events).toEqual(['abort', 'drain', 'finalize']);
    expect(reportCleanupFailure).toHaveBeenCalledWith('abort', abortFailure);
  });
});
