import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { MessageChannelSyncLockService } from 'src/modules/messaging/common/services/message-channel-sync-lock.service';

describe('MessageChannelSyncLockService', () => {
  it('holds one channel-scoped advisory lock for the complete operation', async () => {
    const events: string[] = [];
    const query = jest.fn().mockImplementation(async () => {
      events.push('lock');
    });
    const transaction = jest
      .fn()
      .mockImplementation(
        async (callback: (manager: { query: jest.Mock }) => unknown) => {
          events.push('transaction-start');
          const result = await callback({ query });

          events.push('transaction-end');
          return result;
        },
      );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageChannelSyncLockService,
        {
          provide: getDataSourceToken(),
          useValue: { transaction },
        },
      ],
    }).compile();
    const operation = jest.fn().mockImplementation(async () => {
      events.push('operation');
      return 'result';
    });

    await expect(
      module.get(MessageChannelSyncLockService).withLock(
        {
          messageChannelId: 'message-channel-id',
          workspaceId: 'workspace-id',
        },
        operation,
      ),
    ).resolves.toBe('result');

    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['message-sync:workspace-id:message-channel-id'],
    );
    expect(events).toEqual([
      'transaction-start',
      'lock',
      'operation',
      'transaction-end',
    ]);
  });
  it('reuses an already-held lock for nested recovery on the same channel', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const transaction = jest
      .fn()
      .mockImplementation(
        async (callback: (manager: { query: jest.Mock }) => unknown) =>
          callback({ query }),
      );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageChannelSyncLockService,
        {
          provide: getDataSourceToken(),
          useValue: { transaction },
        },
      ],
    }).compile();
    const service = module.get(MessageChannelSyncLockService);
    const scope = {
      messageChannelId: 'message-channel-id',
      workspaceId: 'workspace-id',
    };
    const nestedOperation = jest.fn().mockResolvedValue('nested-result');

    await service.withLock(scope, () =>
      service.withLock(scope, nestedOperation),
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(nestedOperation).toHaveBeenCalledTimes(1);
  });
});
