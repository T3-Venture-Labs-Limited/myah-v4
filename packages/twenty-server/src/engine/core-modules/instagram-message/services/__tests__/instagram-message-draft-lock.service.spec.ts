import { EventEmitter } from 'events';

import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';

import { InstagramMessageDraftLockService } from '../instagram-message-draft-lock.service';

// Real TypeORM runner and pg-pool lifecycle, transport-only execution fixture.
// No datasource.initialize(), ambient credentials, sockets or PostgreSQL.
const fixture = () => {
  const calls: string[] = [];
  let execute = async (sql: string, values?: string[]) => {
    calls.push(
      sql.includes('pg_advisory')
        ? `${sql.includes('unlock') ? 'unlock' : 'lock'}:${values?.[0]}`
        : sql,
    );
    if (sql.includes('current_setting'))
      return [{ statement_timeout: '7000ms', lock_timeout: '0' }];
    if (sql.includes('pg_advisory_unlock')) return [{ unlocked: true }];
    return [];
  };
  class Client extends EventEmitter {
    ended = false;
    _queryable = true;
    connect(callback: (error?: Error) => void) {
      callback();
    }
    async query(sql: string, values?: string[]) {
      return {
        rows: await execute(sql, values),
        command: 'SELECT',
        rowCount: 1,
      };
    }
    end() {
      this.ended = true;
      this.emit('end');
    }
  }
  const pool = new Pool({
    max: 1,
    connectionTimeoutMillis: 100,
    idleTimeoutMillis: 0,
    Client,
  } as never);
  const removed = jest.fn();
  pool.on('remove', removed);
  const dataSource = new DataSource({
    type: 'postgres',
    connectTimeoutMS: 100,
  });
  const driver = dataSource.driver as PostgresDriver;
  const clients: Client[] = [];
  const releaseCalls: Array<Error | undefined> = [];
  const obtain = jest
    .spyOn(driver, 'obtainMasterConnection')
    .mockImplementation(async () => {
      const client = await pool.connect();
      clients.push(client as unknown as Client);
      return [
        client,
        (error?: Error) => {
          releaseCalls.push(error);
          client.release(error);
        },
      ];
    });
  const service = new InstagramMessageDraftLockService(dataSource);
  const operation = jest.fn(async () => 'done');
  const run = () =>
    service.withNormalizedHandleLock(
      { workspaceId: 'workspace', normalizedHandle: 'recipient' },
      () =>
        service.withLock(
          { workspaceId: 'workspace', draftId: 'draft' },
          operation,
        ),
    );
  return {
    service,
    operation,
    run,
    calls,
    pool,
    driver,
    clients,
    removed,
    releaseCalls,
    obtain,
    setExecute: (next: typeof execute) => {
      execute = next;
    },
  };
};

describe('InstagramMessageDraftLockService native resource boundaries', () => {
  it('checks out once, acquires handle then draft, unlocks in reverse, restores before release', async () => {
    const f = fixture();
    await expect(f.run()).resolves.toBe('done');
    expect(f.obtain).toHaveBeenCalledTimes(1);
    expect(f.operation).toHaveBeenCalledTimes(1);
    expect(f.calls.filter((call) => /^(un)?lock:/.test(call))).toEqual([
      'lock:instagram-message-handle:workspace:recipient',
      'lock:instagram-message-draft:workspace:draft',
      'unlock:instagram-message-draft:workspace:draft',
      'unlock:instagram-message-handle:workspace:recipient',
    ]);
    expect(f.calls[f.calls.length - 1]).toContain(
      "set_config('statement_timeout', $1",
    );
    expect(f.releaseCalls).toEqual([undefined]);
    expect(f.driver.connectedQueryRunners).toHaveLength(0);
    expect(f.pool.idleCount).toBe(1);
    await f.pool.end();
  });

  it.each(['handle', 'draft', 'callback', 'unlock', 'restore'] as const)(
    'discards through the real native listener on %s failure, never retrying',
    async (failure) => {
      const f = fixture();
      f.setExecute(async (sql, values) => {
        if (sql.includes('current_setting'))
          return [{ statement_timeout: '0', lock_timeout: '0' }];
        if (
          (failure === 'handle' &&
            sql.includes('pg_advisory_lock') &&
            values?.[0].includes('handle')) ||
          (failure === 'draft' &&
            sql.includes('pg_advisory_lock') &&
            values?.[0].includes('draft')) ||
          (failure === 'unlock' && sql.includes('unlock')) ||
          (failure === 'restore' &&
            sql.includes("set_config('statement_timeout', $1"))
        )
          throw new Error(failure);
        return sql.includes('unlock') ? [{ unlocked: true }] : [];
      });
      if (failure === 'callback')
        f.operation.mockRejectedValueOnce(new Error(failure));
      await expect(f.run()).rejects.toThrow(failure);
      expect(f.operation).toHaveBeenCalledTimes(
        ['handle', 'draft'].includes(failure) ? 0 : 1,
      );
      expect(f.obtain).toHaveBeenCalledTimes(1);
      expect(f.releaseCalls).toHaveLength(1);
      expect(f.releaseCalls[0]).toBeInstanceOf(Error);
      expect(f.removed).toHaveBeenCalledTimes(1);
      expect(f.clients[0].ended).toBe(true);
      expect(f.driver.connectedQueryRunners).toHaveLength(0);
      expect(f.pool.totalCount).toBe(0);
      expect(f.clients[0].listenerCount('error')).toBe(1); // only pg-pool's idle/error sink, not TypeORM
      await f.pool.end();
    },
  );

  it.each(['duplicate-draft', 'nested-handle', 'other-workspace'] as const)(
    'rejects %s without a second checkout or callback',
    async (path) => {
      const f = fixture();
      const extra = jest.fn();
      f.operation.mockImplementationOnce(async () => {
        if (path === 'nested-handle')
          return f.service.withNormalizedHandleLock(
            { workspaceId: 'workspace', normalizedHandle: 'other' },
            extra,
          );
        return f.service.withLock(
          {
            workspaceId: path === 'other-workspace' ? 'other' : 'workspace',
            draftId: 'draft',
          },
          extra,
        );
      });
      await expect(f.run()).rejects.toThrow('lock ordering changed');
      expect(extra).not.toHaveBeenCalled();
      expect(f.obtain).toHaveBeenCalledTimes(1);
      expect(f.releaseCalls).toHaveLength(1);
      expect(f.removed).toHaveBeenCalledTimes(1);
      expect(f.pool.totalCount).toBe(0);
      await f.pool.end();
    },
  );

  it('does not execute after a late lock grant', async () => {
    const f = fixture();
    f.setExecute(async (sql) => {
      if (sql.includes('current_setting'))
        return [{ statement_timeout: '0', lock_timeout: '0' }];
      if (sql.includes('pg_advisory_lock'))
        jest.setSystemTime(Date.now() + 2_001);
      return [];
    });
    await expect(f.run()).rejects.toThrow('deadline exceeded');
    expect(f.operation).not.toHaveBeenCalled();
    expect(f.pool.totalCount).toBe(0);
    await f.pool.end();
  });

  it('native pg-pool cancels an exhausted checkout; later release never runs the timed-out callback', async () => {
    const f = fixture();
    const held = await f.pool.connect();
    const result = expect(f.run()).rejects.toThrow('timeout exceeded');
    await jest.advanceTimersByTimeAsync(101);
    await result;
    expect(f.pool.waitingCount).toBe(0);
    held.release();
    await jest.advanceTimersByTimeAsync(1);
    expect(f.operation).not.toHaveBeenCalled();
    expect(f.driver.connectedQueryRunners).toHaveLength(0);
    expect(f.pool.idleCount).toBe(1);
    expect(f.obtain).toHaveBeenCalledTimes(1);
    await f.pool.end();
  });

  it('serializes overlapping checkout without a second callback or hidden retry', async () => {
    const f = fixture();
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.operation.mockImplementationOnce(async () => {
      await held;
      return 'first';
    });
    const first = f.run();
    // let the first callback own the one pool slot
    await jest.advanceTimersByTimeAsync(0);
    const second = expect(f.run()).rejects.toThrow('timeout exceeded');
    await jest.advanceTimersByTimeAsync(101);
    await second;
    finish();
    await expect(first).resolves.toBe('first');
    expect(f.operation).toHaveBeenCalledTimes(1);
    expect(f.obtain).toHaveBeenCalledTimes(2);
    await f.pool.end();
  });

  it('reports a rejected native discard without unhandled rejection, retry, or false cleanup success', async () => {
    const f = fixture();
    const nativeObtain = f.obtain.getMockImplementation()!;
    let ownedRelease!: (error?: Error) => void;
    f.obtain.mockImplementation(async () => {
      const [client, release] = await nativeObtain();
      ownedRelease = (error) => release(error);
      return [
        client,
        () => {
          throw new Error('pg release failed');
        },
      ];
    });
    f.operation.mockRejectedValueOnce(new Error('callback'));
    await expect(f.run()).rejects.toThrow('cleanup is unconfirmed');
    expect(f.obtain).toHaveBeenCalledTimes(1);
    expect(f.removed).not.toHaveBeenCalled();
    // This fault leaves a retained resource; test teardown owns it, not production retry.
    ownedRelease(new Error('fixture teardown'));
    f.driver.connectedQueryRunners.length = 0;
    await f.pool.end();
  });
  it.each(['absent', 'multiple'] as const)(
    'rejects an unexpected %s listener shape before changing the session',
    async (shape) => {
      const f = fixture();
      const create = f.driver.createQueryRunner.bind(f.driver);
      jest.spyOn(f.driver, 'createQueryRunner').mockImplementation((mode) => {
        const runner = create(mode);
        const connect = runner.connect.bind(runner);
        jest.spyOn(runner, 'connect').mockImplementation(async () => {
          const client = await connect();
          if (shape === 'absent') client.removeAllListeners('error');
          else client.on('error', () => undefined);
          return client;
        });
        return runner;
      });
      await expect(f.run()).rejects.toThrow('driver is unavailable');
      expect(f.calls).toEqual([]);
      expect(f.operation).not.toHaveBeenCalled();
      expect(f.releaseCalls).toEqual([undefined]);
      await f.pool.end();
    },
  );

  it('refuses a changed captured listener, reports uncertain cleanup, never releases an uncertain session as healthy', async () => {
    const f = fixture();
    f.operation.mockImplementationOnce(async () => {
      f.clients[0].removeAllListeners('error');
      f.clients[0].on('error', () => undefined);
      throw new Error('callback');
    });
    await expect(f.run()).rejects.toThrow('cleanup is unconfirmed');
    expect(f.releaseCalls).toEqual([]);
    expect(f.obtain).toHaveBeenCalledTimes(1);
    // Only fixture teardown may reclaim this deliberately corrupted driver.
    await f.driver.connectedQueryRunners[0].release();
    await f.pool.end();
  });

  it.each([false, true])(
    'never invokes a captured listener after normal release rejects (returned=%s)',
    async (returned) => {
      const f = fixture();
      const nativeObtain = f.obtain.getMockImplementation()!;
      let teardown!: () => void;
      const release = jest.fn();
      f.obtain.mockImplementation(async () => {
        const [client, nativeRelease] = await nativeObtain();
        teardown = () => nativeRelease(new Error('fixture teardown'));
        return [
          client,
          (error?: Error) => {
            release(error);
            if (returned) nativeRelease(error);
            throw new Error('normal release failed');
          },
        ];
      });
      await expect(f.run()).rejects.toThrow('normal release failed');
      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith(undefined);
      expect(f.operation).toHaveBeenCalledTimes(1);
      if (!returned) teardown();
      f.driver.connectedQueryRunners.length = 0;
      await f.pool.end();
    },
  );
});
