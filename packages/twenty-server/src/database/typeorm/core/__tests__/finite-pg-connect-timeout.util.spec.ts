import { EventEmitter } from 'events';

import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';

import { finitePgConnectTimeout } from '../finite-pg-connect-timeout.util';
import { connectionSource, typeORMCoreModuleOptions } from '../core.datasource';
import { GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

jest.mock('dotenv', () => ({ config: jest.fn() }));

// Native datasource, driver and pool; only the wire transport is replaced.
// Never initialize metadata, read credentials, or open a socket.
class Client extends EventEmitter {
  _queryable = true;
  connect(callback: () => void) {
    callback();
  }
  async query(sql: string) {
    return {
      rows: sql.includes('version()')
        ? [{ version: 'PostgreSQL 16.0' }]
        : sql.includes('current_database')
          ? [{ current_database: 'fixture' }]
          : [{ current_schema: 'public' }],
      command: 'SELECT',
      rowCount: 1,
    };
  }
  end() {
    this.emit('end');
  }
}

const connectTransport = async (source: DataSource, expected: number) => {
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
  const optionsSeen: unknown[] = [];
  const pools: Pool[] = [];
  class FixturePool extends Pool {
    constructor(options: object) {
      optionsSeen.push(options);
      super({ ...options, Client, max: 1, idleTimeoutMillis: 0 } as never);
      pools.push(this);
    }
  }
  const driver = source.driver as PostgresDriver;
  const originalTransport = driver.postgres;
  driver.postgres = { Pool: FixturePool };
  // Real driver.connect creates pg-pool using the datasource's actual options.
  await driver.connect();
  expect(optionsSeen).toEqual([
    expect.objectContaining({ connectionTimeoutMillis: expected }),
  ]);
  const pool = pools[0];
  const held = await pool.connect();
  const checkout = source.createQueryRunner();
  const result = expect(checkout.connect()).rejects.toThrow('timeout exceeded');
  await jest.advanceTimersByTimeAsync(expected + 1);
  await result;
  expect(pool.waitingCount).toBe(0);
  held.release();
  await jest.advanceTimersByTimeAsync(1);
  expect(driver.connectedQueryRunners).toHaveLength(0);
  expect(pool.idleCount).toBe(1);
  await driver.disconnect();
  driver.postgres = originalTransport;
};

describe('finite native PostgreSQL checkout construction', () => {
  it.each([
    undefined,
    null,
    0,
    '0',
    -1,
    NaN,
    Infinity,
    'invalid',
    1.5,
    2_147_483_648,
  ])('uses 10s for unset/invalid/unlimited %s', (value) => {
    expect(finitePgConnectTimeout(value)).toBe(10_000);
  });
  it.each([1, 2_000, 10_000, '12000'])(
    'uses a positive integer budget %s',
    (value) => {
      expect(finitePgConnectTimeout(value)).toBe(Number(value));
    },
  );
  it('core datasource constructor supplies the native pool timeout and cancels exhausted checkout', async () => {
    const timeout = finitePgConnectTimeout(
      process.env.PG_DATABASE_PRIMARY_TIMEOUT_MS,
    );
    expect(connectionSource).toBeInstanceOf(DataSource);
    expect(typeORMCoreModuleOptions).toMatchObject({
      connectTimeoutMS: timeout,
    });
    await connectTransport(connectionSource, timeout);
  });
  it.each([0, -1, 2_000, NaN])(
    'real workspace primary and replica constructors cancel exhausted checkout (%s)',
    async (timeout) => {
      const sources: GlobalWorkspaceDataSource[] = [];
      const initialize = jest
        .spyOn(GlobalWorkspaceDataSource.prototype, 'initialize')
        .mockImplementation(async function (this: GlobalWorkspaceDataSource) {
          sources.push(this);
          await connectTransport(this, finitePgConnectTimeout(timeout));
          return this;
        });
      const destroy = jest
        .spyOn(GlobalWorkspaceDataSource.prototype, 'destroy')
        .mockResolvedValue(undefined);
      const config = {
        get: jest.fn(
          (key: string) =>
            ({
              PG_DATABASE_PRIMARY_TIMEOUT_MS: timeout,
              PG_DATABASE_REPLICA_TIMEOUT_MS: timeout,
              PG_DATABASE_REPLICA_URL:
                'postgres://execution-fixture.invalid/no-network',
            })[key],
        ),
        getLoggingConfig: jest.fn(() => []),
      };
      try {
        const service = new GlobalWorkspaceDataSourceService(
          config as never,
          {} as never,
          connectionSource,
        );
        await service.onModuleInit();
        expect(sources).toHaveLength(2);
        expect(service.getGlobalWorkspaceDataSource()).toBe(sources[0]);
        expect(service.getGlobalWorkspaceDataSourceReplica()).toBe(sources[1]);
        for (const source of sources) {
          expect(source).toBeInstanceOf(GlobalWorkspaceDataSource);
          expect(source.options).toMatchObject({
            connectTimeoutMS: finitePgConnectTimeout(timeout),
          });
        }
        await service.onApplicationShutdown();
      } finally {
        initialize.mockRestore();
        destroy.mockRestore();
      }
    },
  );
});
