import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

const MESSAGE_SYNC_ADVISORY_LOCK_QUERY =
  'SELECT pg_advisory_xact_lock(hashtext($1))';

type MessageChannelScope = {
  messageChannelId: string;
  workspaceId: string;
};

@Injectable()
export class MessageChannelSyncLockService {
  private readonly heldLockKeys = new AsyncLocalStorage<Set<string>>();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async withLock<T>(
    { messageChannelId, workspaceId }: MessageChannelScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `message-sync:${workspaceId}:${messageChannelId}`;
    const heldLockKeys = this.heldLockKeys.getStore();

    if (heldLockKeys?.has(lockKey)) {
      return operation();
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(MESSAGE_SYNC_ADVISORY_LOCK_QUERY, [lockKey]);

      return this.heldLockKeys.run(
        new Set([...(heldLockKeys ?? []), lockKey]),
        operation,
      );
    });
  }
}
