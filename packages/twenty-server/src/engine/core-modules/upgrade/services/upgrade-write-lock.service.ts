import { AsyncLocalStorage } from 'async_hooks';
import { type EventEmitter } from 'events';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

// Deliberately database-wide: an ordered upgrade and a new workspace's initial
// checkpoint must not read different sides of a schema/ledger transition.
const UPGRADE_LOCK_KEY = 'twenty:instance-upgrade';

type UpgradeSession = { runner: QueryRunner };

@Injectable()
export class UpgradeWriteLockService {
  private readonly context = new AsyncLocalStorage<UpgradeSession>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private async assertNoActivationInProgress(
    runner: QueryRunner,
    allowEmptyCoreBootstrap = false,
  ): Promise<boolean> {
    const [{ workspaceTable }] = await runner.query(
      `SELECT to_regclass('core.workspace') AS "workspaceTable"`,
    );
    if (workspaceTable === null) {
      // Only run-instance-commands may create the first core tables. A partial
      // schema must never bypass activation/receipt checks.
      const [schema] = allowEmptyCoreBootstrap
        ? await runner.query(
            `SELECT count(c.oid)::text AS "relationCount"
             FROM pg_catalog.pg_namespace n
             LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
             WHERE n.nspname = 'core' GROUP BY n.oid`,
          )
        : [];
      if (schema?.relationCount !== '0') {
        throw new Error('Core workspace table is missing; refusing upgrade');
      }
      return true;
    }

    const [row]: { count: string }[] = await runner.query(
      `SELECT count(*)::text AS count FROM core.workspace WHERE "activationStatus" = $1`,
      [WorkspaceActivationStatus.ONGOING_CREATION],
    );
    if (!row || Number(row.count) !== 0)
      throw new Error(
        'Workspace activation is ongoing; refusing upgrade until its outcome is settled',
      );
    return false;
  }

  currentRunner(): QueryRunner {
    const runner = this.context.getStore()?.runner;

    if (!runner || runner.isReleased) {
      throw new Error('Upgrade write lock is required for this operation');
    }

    return runner;
  }

  async withLock<T>(
    operation: (emptyCoreBootstrap: boolean) => Promise<T>,
    options: {
      requireNoOngoingActivation?: boolean;
      allowEmptyCoreBootstrap?: boolean;
    } = {},
  ): Promise<T> {
    if (this.context.getStore()) {
      const runner = this.currentRunner();
      const emptyCoreBootstrap = options.requireNoOngoingActivation
        ? await this.assertNoActivationInProgress(
            runner,
            options.allowEmptyCoreBootstrap,
          )
        : false;
      return operation(emptyCoreBootstrap);
    }

    const runner = this.dataSource.createQueryRunner();
    const client: EventEmitter = await runner.connect();
    const listeners = client.listeners('error');

    if (listeners.length !== 1) {
      await runner.release();
      throw new Error('Upgrade lock driver is unavailable');
    }

    // The installed TypeORM PostgresQueryRunner's native error listener
    // removes the listener and calls release(error), discarding the client.
    // Never return a connection with uncertain session lock ownership to pool.
    const nativeDiscard = listeners[0];
    let unlocked = false;
    let result: T | undefined;
    let failure: unknown;

    try {
      const [row] = await runner.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [UPGRADE_LOCK_KEY],
      );

      if (row?.acquired !== true) {
        throw new Error(
          'Another upgrade or workspace activation holds the upgrade lock',
        );
      }

      result = await this.context.run({ runner }, async () => {
        const emptyCoreBootstrap = options.requireNoOngoingActivation
          ? await this.assertNoActivationInProgress(
              runner,
              options.allowEmptyCoreBootstrap,
            )
          : false;
        return operation(emptyCoreBootstrap);
      });
      if (runner.isTransactionActive) {
        throw new Error('Upgrade returned with an open transaction');
      }
      const [release] = await runner.query(
        'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
        [UPGRADE_LOCK_KEY],
      );

      if (release?.unlocked !== true) {
        throw new Error('Upgrade advisory lock release was not confirmed');
      }
      unlocked = true;
    } catch (error) {
      failure = error;
    }

    if (!unlocked) {
      if (
        runner.isReleased ||
        client.listeners('error').length !== 1 ||
        client.listeners('error')[0] !== nativeDiscard
      ) {
        throw Object.assign(new Error('Upgrade lock cleanup is unconfirmed'), {
          cause: failure,
        });
      }
      try {
        await nativeDiscard.call(
          client,
          failure instanceof Error ? failure : new Error('Upgrade lock failed'),
        );
      } catch (cleanupError) {
        throw Object.assign(new Error('Upgrade lock discard failed'), {
          cause: failure,
          cleanupError,
        });
      }
      throw failure;
    }

    await runner.release();
    return result as T;
  }
}
