import {
  MYAH_V4_PRODUCT,
  MYAH_V4_SCHEMA_VERSION,
  V4_SCHEMA_FINGERPRINT,
  type V4BaselineMarker,
  type V4BaselineState,
} from './classify-v4-baseline-state';
import { runV4Baseline } from './run-v4-baseline';
import type {
  V4BaselineTransaction,
  V4BaselineTransactionAdapter,
} from './run-v4-baseline';
import {
  createV4BaselineManifest,
  V4_PRISTINE_EMPTY_CATALOG,
} from './v4-baseline-manifest';

const completedManifest = createV4BaselineManifest({
  coreRelations: ['account'],
  publicRelations: ['contact'],
});
const pristineCatalog = V4_PRISTINE_EMPTY_CATALOG;

const exactMarker: V4BaselineMarker = {
  product: MYAH_V4_PRODUCT,
  schemaVersion: MYAH_V4_SCHEMA_VERSION,
  schemaFingerprint: V4_SCHEMA_FINGERPRINT,
  catalogFingerprint: completedManifest.catalogFingerprint,
  appliedAt: '2026-07-11T00:00:00.000Z',
};


const state = (overrides: Partial<V4BaselineState>): V4BaselineState => ({
  postgresMajorVersion: 16,
  catalog: pristineCatalog,
  marker: null,
  ...overrides,
});

const transactionSpies = () => {
  const events: string[] = [];
  const writeMarker = jest.fn(async (_marker: V4BaselineMarker) => undefined);
  const query = jest.fn(
    async <Result>(_sql: string): Promise<Result> =>
      ({ ready: true } as Result),
  );
  const transaction = jest.fn(
    async <Result>(
      callback: (transaction: V4BaselineTransaction) => Promise<Result>,
    ): Promise<Result> => {
      events.push('begin');

      try {
        const result = await callback({ query, writeMarker });
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  );

  return { transaction, query, writeMarker, events };
};

describe('runV4Baseline', () => {
  it('rejects without starting a transaction or invoking the callback', async () => {
    const spies = transactionSpies();
    const applyBaseline = jest.fn<() => Promise<void>>();
    const result = await runV4Baseline({
      state: state({ postgresMajorVersion: 15 }),
      manifest: completedManifest,
      transactionAdapter: spies,
      applyBaseline,
    });

    expect(result).toMatchObject({ action: 'reject' });
    expect(spies.transaction).not.toHaveBeenCalled();
    expect(applyBaseline).not.toHaveBeenCalled();
  });

  it('no-ops without starting a transaction or invoking the callback', async () => {
    const spies = transactionSpies();
    const applyBaseline = jest.fn<() => Promise<void>>();
    const result = await runV4Baseline({
      state: state({ catalog: completedManifest, marker: exactMarker }),
      manifest: completedManifest,
      transactionAdapter: spies,
      applyBaseline,
    });

    expect(result).toEqual({ action: 'no-op' });
    expect(spies.transaction).not.toHaveBeenCalled();
    expect(applyBaseline).not.toHaveBeenCalled();
  });

  it('passes transaction-owned typed query capability to apply before marker persistence', async () => {
    const spies = transactionSpies();
    const events: string[] = [];
    const applyBaseline = jest.fn(
      async (transaction: V4BaselineTransaction) => {
        const result = await transaction.query<{ ready: boolean }>(
          'SELECT ready',
        );
        events.push(result.ready ? 'query' : 'unexpected');
      },
    );
    spies.query.mockResolvedValue({ ready: true });
    spies.writeMarker.mockImplementation(async () => {
      events.push('marker');
    });

    await runV4Baseline({
      state: state({}),
      manifest: completedManifest,
      transactionAdapter: spies,
      applyBaseline,
    });

    expect(spies.query).toHaveBeenCalledWith('SELECT ready');
    expect(events).toEqual(['query', 'marker']);
  });
  it('applies inside one transaction and writes marker after callback success', async () => {
    const spies = transactionSpies();
    const events: string[] = [];
    const applyBaseline = jest.fn(async () => {
      events.push('apply');
    });
    spies.writeMarker.mockImplementation(async () => {
      events.push('marker');
    });

    const result = await runV4Baseline({
      state: state({}),
      manifest: completedManifest,
      transactionAdapter: spies,
      applyBaseline,
      now: () => '2026-07-11T01:00:00.000Z',
    });

    expect(result).toEqual({ action: 'apply' });
    expect(spies.transaction).toHaveBeenCalledTimes(1);
    expect(spies.events).toEqual(['begin', 'commit']);
    expect(applyBaseline).toHaveBeenCalledTimes(1);
    expect(spies.writeMarker).toHaveBeenCalledWith({
      ...exactMarker,
      appliedAt: '2026-07-11T01:00:00.000Z',
    });
    expect(events).toEqual(['apply', 'marker']);
  });

  it('rolls back callback failures and never writes marker', async () => {
    const applyError = new Error('apply failed');
    const spies = transactionSpies();
    const applyBaseline = jest.fn(async () => {
      throw applyError;
    });

    await expect(
      runV4Baseline({
        state: state({}),
        manifest: completedManifest,
        transactionAdapter: spies,
        applyBaseline,
      }),
    ).rejects.toBe(applyError);
    expect(spies.writeMarker).not.toHaveBeenCalled();
    expect(spies.events).toEqual(['begin', 'rollback']);
  });

  it('propagates marker write failures so the transaction rolls back', async () => {
    const markerError = new Error('marker failed');
    const spies = transactionSpies();
    spies.writeMarker.mockRejectedValue(markerError);

    await expect(
      runV4Baseline({
        state: state({}),
        manifest: completedManifest,
        transactionAdapter: spies,
        applyBaseline: async () => undefined,
      }),
    ).rejects.toBe(markerError);
    expect(spies.events).toEqual(['begin', 'rollback']);
    expect(spies.transaction).toHaveBeenCalledTimes(1);
  });
});
