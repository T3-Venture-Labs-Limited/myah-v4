type PendingOperationCleanupPhase = 'abort' | 'drain' | 'finalize';

export type PendingOperationCleanup = {
  abort: () => Promise<void>;
  drain: () => Promise<void>;
  finalize: () => Promise<void>;
  reportCleanupFailure: (
    phase: PendingOperationCleanupPhase,
    error: unknown,
  ) => void;
  timeoutMs: number;
};

type CleanupOperation = readonly [
  PendingOperationCleanupPhase,
  () => Promise<void>,
];

type CleanupRunState = {
  currentPhase: PendingOperationCleanupPhase;
  lifecycleSettled: boolean;
  result: Promise<void>;
};

type PendingWriteCleanupFailure = {
  operation: 'save' | 'statusUpdate';
  reason: unknown;
};

export class PendingWriteCleanupError extends Error {
  constructor(readonly failures: ReadonlyArray<PendingWriteCleanupFailure>) {
    super(
      `Pending write cleanup failed: ${failures
        .map(({ operation, reason }) => `${operation}: ${String(reason)}`)
        .join('; ')}`,
    );
    this.name = 'PendingWriteCleanupError';
  }
}

export const assertPendingWriteCleanupSettled = ({
  isExpectedSaveCancellation,
  saveCancellationConfirmed,
  saveResult,
  statusUpdateResult,
}: {
  isExpectedSaveCancellation: (reason: unknown) => boolean;
  saveCancellationConfirmed: boolean;
  saveResult: PromiseSettledResult<unknown>;
  statusUpdateResult?: PromiseSettledResult<unknown>;
}): void => {
  const failures: PendingWriteCleanupFailure[] = [];

  if (saveResult.status === 'fulfilled') {
    failures.push({
      operation: 'save',
      reason: new Error(
        'Owned MYAH-319 save resolved instead of cancelling on failure',
      ),
    });
  } else if (
    !saveCancellationConfirmed ||
    !isExpectedSaveCancellation(saveResult.reason)
  ) {
    failures.push({ operation: 'save', reason: saveResult.reason });
  }

  if (statusUpdateResult?.status === 'rejected') {
    failures.push({
      operation: 'statusUpdate',
      reason: statusUpdateResult.reason,
    });
  }

  if (failures.length > 0) throw new PendingWriteCleanupError(failures);
};

class PendingOperationCleanupError extends Error {
  constructor(
    readonly failures: ReadonlyArray<{
      error: unknown;
      phase: PendingOperationCleanupPhase;
    }>,
  ) {
    super(
      `Pending operation cleanup failed: ${failures
        .map(({ error, phase }) => `${phase}: ${String(error)}`)
        .join('; ')}`,
    );
    this.name = 'PendingOperationCleanupError';
  }
}

const cleanupRuns = new WeakMap<PendingOperationCleanup, CleanupRunState>();

const allCleanupOperations = (
  cleanup: PendingOperationCleanup,
): ReadonlyArray<CleanupOperation> => [
  ['abort', cleanup.abort],
  ['drain', cleanup.drain],
  ['finalize', cleanup.finalize],
];

const runCleanupOperations = async (
  cleanup: PendingOperationCleanup,
  operations: ReadonlyArray<CleanupOperation>,
  state: CleanupRunState,
): Promise<void> => {
  const failures: Array<{
    error: unknown;
    phase: PendingOperationCleanupPhase;
  }> = [];

  for (const [phase, operation] of operations) {
    state.currentPhase = phase;
    try {
      await operation();
    } catch (error) {
      failures.push({ error, phase });
      cleanup.reportCleanupFailure(phase, error);
    }
  }

  if (failures.length === 1) throw failures[0].error;
  if (failures.length > 1) throw new PendingOperationCleanupError(failures);
};

const startSerializedCleanup = (
  cleanup: PendingOperationCleanup,
  operations: ReadonlyArray<CleanupOperation>,
): Promise<void> => {
  const active = cleanupRuns.get(cleanup);

  if (active && !active.lifecycleSettled) return active.result;
  if (!Number.isFinite(cleanup.timeoutMs) || cleanup.timeoutMs <= 0) {
    return Promise.reject(new Error('Cleanup timeout must be positive'));
  }

  const state: CleanupRunState = {
    currentPhase: operations[0][0],
    lifecycleSettled: false,
    result: Promise.resolve(),
  };
  const lifecycle = runCleanupOperations(cleanup, operations, state);
  void lifecycle.then(
    () => {
      state.lifecycleSettled = true;
    },
    () => {
      state.lifecycleSettled = true;
    },
  );
  state.result = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const error = new Error(
        `Timed out during ${state.currentPhase} after ${cleanup.timeoutMs}ms`,
      );

      cleanup.reportCleanupFailure(state.currentPhase, error);
      reject(error);
    }, cleanup.timeoutMs);

    void lifecycle.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
  cleanupRuns.set(cleanup, state);

  return state.result;
};

export const drainPendingOperationCleanup = (
  cleanup: PendingOperationCleanup,
): Promise<void> =>
  startSerializedCleanup(cleanup, allCleanupOperations(cleanup));

const finalizePendingOperationCleanup = (
  cleanup: PendingOperationCleanup,
): Promise<void> =>
  startSerializedCleanup(cleanup, [['finalize', cleanup.finalize]]);

export const runWithPendingOperationCleanup = async <T>(
  callback: () => Promise<T>,
  cleanup: PendingOperationCleanup,
): Promise<T> => {
  let primaryError: unknown;
  let result: T | undefined;

  try {
    result = await callback();
  } catch (error) {
    primaryError = error;
  }

  if (primaryError !== undefined) {
    try {
      await drainPendingOperationCleanup(cleanup);
    } catch {
      // Each secondary failure was already reported; the assertion stays primary.
    }
    throw primaryError;
  }

  await finalizePendingOperationCleanup(cleanup);

  return result as T;
};
