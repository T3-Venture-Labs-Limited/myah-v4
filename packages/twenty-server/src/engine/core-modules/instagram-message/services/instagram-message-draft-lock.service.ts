import { AsyncLocalStorage } from 'async_hooks';
import { type EventEmitter } from 'events';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, type QueryRunner } from 'typeorm';

type LockSession = {
  workspaceId: string;
  runner: QueryRunner;
  keys: string[];
  deadline: number;
};

@Injectable()
export class InstagramMessageDraftLockService {
  private readonly sessions = new AsyncLocalStorage<LockSession>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async withLock<T>(
    input: { workspaceId: string; draftId: string },
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `instagram-message-draft:${input.workspaceId}:${input.draftId}`;
    const session = this.sessions.getStore();
    if (session) {
      if (
        session.workspaceId !== input.workspaceId ||
        session.keys.length !== 1
      ) {
        throw new Error('Instagram message lock ordering changed');
      }
      await this.acquire(session, key);
      return operation();
    }
    return this.withSession(input.workspaceId, key, operation);
  }

  // Composer nesting reuses this runner: handle -> draft -> Creator table.
  async withNormalizedHandleLock<T>(
    input: { workspaceId: string; normalizedHandle: string },
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.sessions.getStore()) {
      throw new Error('Instagram message lock ordering changed');
    }
    return this.withSession(
      input.workspaceId,
      `instagram-message-handle:${input.workspaceId}:${input.normalizedHandle}`,
      operation,
    );
  }

  private async acquire(session: LockSession, key: string): Promise<void> {
    if (Date.now() >= session.deadline)
      throw new Error('Instagram message lock deadline exceeded');
    await session.runner.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
    session.keys.push(key);
    // A delayed response/grant must never start work after the acquisition budget.
    if (Date.now() >= session.deadline)
      throw new Error('Instagram message lock deadline exceeded');
  }

  private async withSession<T>(
    workspaceId: string,
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    // Native connectTimeoutMS cancels queued pool checkout. Never race connect().
    const client: EventEmitter = await runner.connect();
    const listeners = client.listeners('error');
    if (listeners.length !== 1) {
      // No session changes or locks yet; an unexpected driver shape is not usable.
      await runner.release();
      throw new Error('Instagram message lock driver is unavailable');
    }
    const nativeDiscard = listeners[0];
    let normalReleaseStarted = false;
    let discardStarted = false;
    const discard = async (cause: unknown) => {
      if (
        discardStarted ||
        normalReleaseStarted ||
        runner.isReleased ||
        client.listeners('error').length !== 1 ||
        client.listeners('error')[0] !== nativeDiscard
      ) {
        throw new Error(
          'Instagram message lock connection cannot be safely discarded',
        );
      }
      discardStarted = true;
      // Pinned TypeORM PostgresQueryRunner compatibility seam: its sole checked-out
      // client's error listener returns releasePostgresConnection(error). Await it
      // directly: emit() would lose an async cleanup rejection. It removes the
      // listener/runner and calls pg release(error), which destroys the client.
      // A rejected discard is reported, NOT proof of release and never retried.
      await nativeDiscard.call(
        client,
        cause instanceof Error
          ? cause
          : new Error('Instagram message lock cleanup failed'),
      );
    };
    const session: LockSession = {
      workspaceId,
      runner,
      keys: [],
      deadline: Date.now() + 2_000,
    };
    let settings:
      | { statement_timeout: string; lock_timeout: string }
      | undefined;
    let uncertain = false;
    let failure: unknown;
    let result: T | undefined;
    try {
      [settings] = await runner.query(
        `SELECT current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout`,
      );
      if (
        !settings ||
        typeof settings.statement_timeout !== 'string' ||
        typeof settings.lock_timeout !== 'string'
      ) {
        throw new Error('Instagram message lock settings are unavailable');
      }
      await runner.query(
        `SELECT set_config('statement_timeout', '2000ms', false), set_config('lock_timeout', '2000ms', false)`,
      );
      // Until a query has completed, acquisition failure can mean unknown ownership.
      uncertain = true;
      await this.acquire(session, key);
      uncertain = false;
      result = await this.sessions.run(session, operation);
    } catch (error) {
      failure = error;
      // A nested draft acquisition may fail after the handle was obtained. Even
      // when ownership is known, destroying on failure avoids returning any lock.
      uncertain = true;
    }
    if (!uncertain) {
      try {
        for (const lockKey of [...session.keys].reverse()) {
          const [unlocked] = await runner.query(
            'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
            [lockKey],
          );
          if (unlocked?.unlocked !== true)
            throw new Error('Instagram message lock cleanup failed');
        }
        await runner.query(
          `SELECT set_config('statement_timeout', $1, false), set_config('lock_timeout', $2, false)`,
          [settings!.statement_timeout, settings!.lock_timeout],
        );
      } catch (error) {
        failure = error;
        uncertain = true;
      }
    }
    if (uncertain) {
      try {
        await discard(failure);
      } catch (cleanupError) {
        throw Object.assign(
          new Error(
            'Instagram message lock discard failed; connection cleanup is unconfirmed',
          ),
          { cause: failure, cleanupError },
        );
      }
    } else {
      // Once release starts it may already have returned the client to the pool;
      // never invoke the captured listener after a failed/partial normal release.
      normalReleaseStarted = true;
      await runner.release();
    }
    if (uncertain) throw failure;
    return result as T;
  }
}
