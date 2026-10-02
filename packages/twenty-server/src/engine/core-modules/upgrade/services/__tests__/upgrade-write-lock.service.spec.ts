import { EventEmitter } from 'events';

import { type DataSource, type QueryRunner } from 'typeorm';

import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';

describe('UpgradeWriteLockService', () => {
  const setup = () => {
    const client = new EventEmitter();
    const discard = jest.fn().mockResolvedValue(undefined);

    client.on('error', discard);
    const query = jest
      .fn()
      .mockImplementation(async (sql: string) =>
        sql.includes('try_advisory')
          ? [{ acquired: true }]
          : [{ unlocked: true }],
      );
    const runner = {
      connect: jest.fn().mockResolvedValue(client),
      query,
      release: jest.fn().mockResolvedValue(undefined),
      isReleased: false,
      isTransactionActive: false,
    } as unknown as QueryRunner;
    const service = new UpgradeWriteLockService({
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource);

    return { client, discard, query, runner, service };
  };

  it('pins the session through nested operations, unlocks once, then releases', async () => {
    const { query, runner, service } = setup();

    await service.withLock(async () => {
      expect(service.currentRunner()).toBe(runner);
      await service.withLock(async () => {
        expect(service.currentRunner()).toBe(runner);
      });
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(() => service.currentRunner()).toThrow(/required/);
  });

  it('rejects a concurrent activation under the lock before ordered upgrade work', async () => {
    const { discard, query, service } = setup();
    query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ workspaceTable: 'workspace' }])
      .mockResolvedValueOnce([{ count: '1' }]);
    const operation = jest.fn();

    await expect(
      service.withLock(operation, {
        requireNoOngoingActivation: true,
        allowEmptyCoreBootstrap: true,
      }),
    ).rejects.toThrow(/activation is ongoing/);
    expect(operation).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('admits only a truly empty core schema for explicit first-boot migration under the lock', async () => {
    const { query, service } = setup();
    query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ workspaceTable: null }])
      .mockResolvedValueOnce([{ relationCount: '0' }]);
    const operation = jest.fn().mockResolvedValue(undefined);

    await service.withLock(operation, {
      requireNoOngoingActivation: true,
      allowEmptyCoreBootstrap: true,
    });

    expect(operation).toHaveBeenCalledWith(true);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("to_regclass('core.workspace')"),
    );
  });

  it('does not admit an empty core bootstrap without explicit permission', async () => {
    const { query, service } = setup();
    query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ workspaceTable: null }]);
    const operation = jest.fn();

    await expect(
      service.withLock(operation, { requireNoOngoingActivation: true }),
    ).rejects.toThrow(/workspace table is missing/i);
    expect(operation).not.toHaveBeenCalled();
  });

  it('refuses a partial core schema with no workspace table rather than treating it as first boot', async () => {
    const { query, service } = setup();
    query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([{ workspaceTable: null }])
      .mockResolvedValueOnce([{ relationCount: '1' }]);
    const operation = jest.fn();

    await expect(
      service.withLock(operation, {
        requireNoOngoingActivation: true,
        allowEmptyCoreBootstrap: true,
      }),
    ).rejects.toThrow(/workspace table is missing/i);
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects contention before work and discards the checked-out connection', async () => {
    const { discard, query, runner, service } = setup();

    query.mockResolvedValueOnce([{ acquired: false }]);
    const operation = jest.fn();

    await expect(service.withLock(operation)).rejects.toThrow(
      /Another upgrade/,
    );
    expect(operation).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
    expect(runner.release).not.toHaveBeenCalled();
  });

  it('discards on a failed operation instead of returning an uncertain session to pool', async () => {
    const { discard, runner, service } = setup();

    await expect(
      service.withLock(async () => {
        throw new Error('DDL failed');
      }),
    ).rejects.toThrow('DDL failed');
    expect(discard).toHaveBeenCalledTimes(1);
    expect(runner.release).not.toHaveBeenCalled();
  });
});
