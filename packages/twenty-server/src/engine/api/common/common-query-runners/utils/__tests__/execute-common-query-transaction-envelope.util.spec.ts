import { executeCommonQueryTransactionEnvelope } from 'src/engine/api/common/common-query-runners/utils/execute-common-query-transaction-envelope.util';

describe('executeCommonQueryTransactionEnvelope', () => {
  const createContext = () => {
    const entityManager = { id: 'transaction-manager' };
    const queryRunner = {
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
      manager: entityManager,
      release: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

    return { dataSource, entityManager, queryRunner };
  };

  it('commits and releases after running with the exact transaction manager', async () => {
    const { dataSource, entityManager, queryRunner } = createContext();
    const execute = jest.fn().mockResolvedValue('result');

    await expect(
      executeCommonQueryTransactionEnvelope(dataSource as never, execute),
    ).resolves.toBe('result');

    expect(execute).toHaveBeenCalledWith(entityManager);
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(
      queryRunner.commitTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(queryRunner.release.mock.invocationCallOrder[0]);
  });

  it.each([
    ['connect', 'connect'],
    ['start', 'startTransaction'],
  ] as const)('releases exactly once when %s fails', async (_name, method) => {
    const { dataSource, queryRunner } = createContext();
    const failure = new Error(`${method} failed`);

    queryRunner[method].mockRejectedValueOnce(failure);
    if (method === 'startTransaction') {
      queryRunner.isTransactionActive = false;
    }

    await expect(
      executeCommonQueryTransactionEnvelope(dataSource as never, jest.fn()),
    ).rejects.toBe(failure);

    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('preserves a start failure when an active transaction rollback and release also fail', async () => {
    const { dataSource, queryRunner } = createContext();
    const primary = new Error('start failed');

    queryRunner.startTransaction.mockRejectedValueOnce(primary);
    queryRunner.rollbackTransaction.mockRejectedValueOnce(
      new Error('rollback failed'),
    );
    queryRunner.release.mockRejectedValueOnce(new Error('release failed'));

    await expect(
      executeCommonQueryTransactionEnvelope(dataSource as never, jest.fn()),
    ).rejects.toBe(primary);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('preserves a callback failure and diagnoses rollback/release failures', async () => {
    const { dataSource, queryRunner } = createContext();
    const primary = new Error('callback failed');
    const rollbackFailure = new Error('rollback failed');
    const releaseFailure = new Error('release failed');
    const cleanupReporter = jest.fn();

    queryRunner.rollbackTransaction.mockRejectedValueOnce(rollbackFailure);
    queryRunner.release.mockRejectedValueOnce(releaseFailure);

    await expect(
      executeCommonQueryTransactionEnvelope(
        dataSource as never,
        async () => {
          throw primary;
        },
        undefined,
        cleanupReporter,
      ),
    ).rejects.toBe(primary);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(cleanupReporter).toHaveBeenNthCalledWith(1, {
      error: rollbackFailure,
      stage: 'rollback',
      transactionCommitted: false,
    });
    expect(cleanupReporter).toHaveBeenNthCalledWith(2, {
      error: releaseFailure,
      stage: 'release',
      transactionCommitted: false,
    });
  });

  it('preserves a commit failure when rollback and release also fail', async () => {
    const { dataSource, queryRunner } = createContext();
    const primary = new Error('commit failed');

    queryRunner.commitTransaction.mockRejectedValueOnce(primary);
    queryRunner.rollbackTransaction.mockRejectedValueOnce(
      new Error('rollback failed'),
    );
    queryRunner.release.mockRejectedValueOnce(new Error('release failed'));

    await expect(
      executeCommonQueryTransactionEnvelope(dataSource as never, jest.fn()),
    ).rejects.toBe(primary);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('contains and diagnoses release failure after successful commit', async () => {
    const { dataSource, queryRunner } = createContext();
    const failure = new Error('release failed');
    const cleanupReporter = jest.fn();

    queryRunner.release.mockRejectedValueOnce(failure);

    await expect(
      executeCommonQueryTransactionEnvelope(
        dataSource as never,
        jest.fn().mockResolvedValue('committed'),
        undefined,
        cleanupReporter,
      ),
    ).resolves.toBe('committed');

    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(cleanupReporter).toHaveBeenCalledWith({
      error: failure,
      stage: 'release',
      transactionCommitted: true,
    });
  });

  it('contains a throwing cleanup reporter after committed release failure', async () => {
    const { dataSource, queryRunner } = createContext();
    const releaseFailure = new Error('release failed');
    const reporterFailure = new Error('cleanup reporter failed');
    const cleanupReporter = jest.fn(() => {
      throw reporterFailure;
    });

    queryRunner.release.mockRejectedValueOnce(releaseFailure);

    await expect(
      executeCommonQueryTransactionEnvelope(
        dataSource as never,
        jest.fn().mockResolvedValue('committed'),
        undefined,
        cleanupReporter,
      ),
    ).resolves.toBe('committed');

    expect(cleanupReporter).toHaveBeenCalledWith({
      error: releaseFailure,
      stage: 'release',
      transactionCommitted: true,
    });
  });

  it('contains a throwing cleanup reporter without masking an existing primary failure', async () => {
    const { dataSource, queryRunner } = createContext();
    const primary = new Error('callback failed');
    const rollbackFailure = new Error('rollback failed');
    const cleanupReporter = jest.fn(() => {
      throw new Error('cleanup reporter failed');
    });

    queryRunner.rollbackTransaction.mockRejectedValueOnce(rollbackFailure);

    await expect(
      executeCommonQueryTransactionEnvelope(
        dataSource as never,
        async () => {
          throw primary;
        },
        undefined,
        cleanupReporter,
      ),
    ).rejects.toBe(primary);

    expect(cleanupReporter).toHaveBeenCalledWith({
      error: rollbackFailure,
      stage: 'rollback',
      transactionCommitted: false,
    });
  });

  it('runs the committed callback after commit and before release', async () => {
    const { dataSource, queryRunner } = createContext();
    const onCommitted = jest.fn().mockResolvedValue(undefined);

    await executeCommonQueryTransactionEnvelope(
      dataSource as never,
      jest.fn().mockResolvedValue('result'),
      onCommitted,
    );

    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(
      queryRunner.commitTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(onCommitted.mock.invocationCallOrder[0]);
    expect(onCommitted.mock.invocationCallOrder[0]).toBeLessThan(
      queryRunner.release.mock.invocationCallOrder[0],
    );
  });

  it('runs the committed callback and returns its result when release subsequently fails', async () => {
    const { dataSource, queryRunner } = createContext();
    const releaseFailure = new Error('release failed');
    const onCommitted = jest.fn().mockResolvedValue(undefined);
    const cleanupReporter = jest.fn();

    queryRunner.release.mockRejectedValueOnce(releaseFailure);

    await expect(
      executeCommonQueryTransactionEnvelope(
        dataSource as never,
        jest.fn().mockResolvedValue('result'),
        onCommitted,
        cleanupReporter,
      ),
    ).resolves.toBe('result');

    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(cleanupReporter).toHaveBeenCalledWith({
      error: releaseFailure,
      stage: 'release',
      transactionCommitted: true,
    });
  });

  it('rolls back and releases when the opted-in operation fails', async () => {
    const { dataSource, queryRunner } = createContext();
    const failure = new Error('mutation failed');

    await expect(
      executeCommonQueryTransactionEnvelope(dataSource as never, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(
      queryRunner.rollbackTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(queryRunner.release.mock.invocationCallOrder[0]);
  });
});
