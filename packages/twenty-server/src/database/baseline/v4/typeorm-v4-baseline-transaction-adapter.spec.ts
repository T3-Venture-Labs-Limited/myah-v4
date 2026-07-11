import {
  MYAH_V4_PRODUCT,
  MYAH_V4_SCHEMA_VERSION,
  V4_SCHEMA_FINGERPRINT,
  type V4BaselineMarker,
} from './classify-v4-baseline-state';
import {
  createV4BaselineManifest,
  type V4BaselineManifest,
} from './v4-baseline-manifest';
import {
  createV4BaselineTransactionAdapter,
  type V4BaselineQueryRunner,
} from './typeorm-v4-baseline-transaction-adapter';

const completedManifest: V4BaselineManifest = createV4BaselineManifest({
  coreRelations: ['account'],
  publicRelations: ['contact'],
});

const marker: V4BaselineMarker = {
  product: MYAH_V4_PRODUCT,
  schemaVersion: MYAH_V4_SCHEMA_VERSION,
  schemaFingerprint: V4_SCHEMA_FINGERPRINT,
  catalogFingerprint: completedManifest.catalogFingerprint,
  appliedAt: '2026-07-11T00:00:00.000Z',
};

type QueryCall = Readonly<{
  sql: string;
  parameters: readonly unknown[] | undefined;
}>;

type RunnerSetup = Readonly<{
  runner: V4BaselineQueryRunner;
  events: string[];
  queryCalls: QueryCall[];
  setQueryFailure: (failure: Error | null) => void;
  setCommitFailure: (failure: Error | null) => void;
}>;

const setupRunner = (): RunnerSetup => {
  const events: string[] = [];
  const queryCalls: QueryCall[] = [];
  let transactionActive = false;
  let queryFailure: Error | null = null;
  let commitFailure: Error | null = null;
  function query<Result>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<Result>;
  function query(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<undefined> {
    queryCalls.push({ sql, parameters });
    if (queryFailure !== null) {
      return Promise.reject(queryFailure);
    }
    return Promise.resolve(undefined);
  }
  const runner: V4BaselineQueryRunner = {
    connect: jest.fn(async () => {
      events.push('connect');
    }),
    startTransaction: jest.fn(async () => {
      events.push('start');
      transactionActive = true;
    }),
    commitTransaction: jest.fn(async () => {
      events.push('commit');
      if (commitFailure !== null) {
        throw commitFailure;
      }
      transactionActive = false;
    }),
    rollbackTransaction: jest.fn(async () => {
      events.push('rollback');
      transactionActive = false;
    }),
    release: jest.fn(async () => {
      events.push('release');
    }),
    get isTransactionActive() {
      return transactionActive;
    },
    query,
  };

  return {
    runner,
    events,
    queryCalls,
    setQueryFailure: (failure: Error | null) => {
      queryFailure = failure;
    },
    setCommitFailure: (failure: Error | null) => {
      commitFailure = failure;
    },
  };
};

describe('createV4BaselineTransactionAdapter', () => {
  it('runs one query runner through connect, transaction, callback, marker, commit, release', async () => {
    const setup = setupRunner();
    const adapter = createV4BaselineTransactionAdapter(setup.runner);
    const callback = jest.fn(async (transaction) => {
      setup.events.push('callback');
      await transaction.query('SELECT 1');
      await transaction.writeMarker(marker);
      return 'done';
    });

    await expect(adapter.transaction(callback)).resolves.toBe('done');

    expect(setup.events).toEqual([
      'connect',
      'start',
      'callback',
      'commit',
      'release',
    ]);
    expect(setup.queryCalls).toHaveLength(2);
    expect(setup.queryCalls[1]).toEqual({
      sql: expect.stringContaining('INSERT INTO core._myah_schema_baseline'),
      parameters: [
        marker.product,
        marker.schemaVersion,
        marker.schemaFingerprint,
        marker.catalogFingerprint,
        marker.appliedAt,
      ],
    });
  });

  it('rolls back callback failures and always releases', async () => {
    const setup = setupRunner();
    const failure = new Error('callback failed');
    const adapter = createV4BaselineTransactionAdapter(setup.runner);

    await expect(
      adapter.transaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(setup.events).toEqual(['connect', 'start', 'rollback', 'release']);
  });

  it('rolls back marker failures without committing', async () => {
    const setup = setupRunner();
    const failure = new Error('marker failed');
    setup.setQueryFailure(failure);
    const adapter = createV4BaselineTransactionAdapter(setup.runner);

    await expect(
      adapter.transaction(async (transaction) => {
        await transaction.writeMarker(marker);
      }),
    ).rejects.toBe(failure);

    expect(setup.events).toEqual(['connect', 'start', 'rollback', 'release']);
  });

  it('rolls back a failed commit while the transaction remains active', async () => {
    const setup = setupRunner();
    const failure = new Error('commit failed');
    setup.setCommitFailure(failure);
    const adapter = createV4BaselineTransactionAdapter(setup.runner);

    await expect(
      adapter.transaction(async () => undefined),
    ).rejects.toBe(failure);

    expect(setup.events).toEqual([
      'connect',
      'start',
      'commit',
      'rollback',
      'release',
    ]);
  });
});
