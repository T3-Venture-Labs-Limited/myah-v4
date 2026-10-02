import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessageFolderEntity } from 'src/engine/metadata-modules/message-folder/entities/message-folder.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { AccountsToReconnectService } from 'src/modules/connected-account/services/accounts-to-reconnect.service';
import { MessageChannelSyncLockService } from 'src/modules/messaging/common/services/message-channel-sync-lock.service';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import {
  getAcknowledgedMessageSyncIdsCacheKey,
  getMessagesToImportCacheKey,
  getPendingMessageSyncCursorsCacheKey,
  getPendingMessageSyncGenerationCacheKey,
} from 'src/modules/messaging/message-import-manager/utils/get-message-sync-cache-keys.util';

const workspaceId = 'workspace-id';
const messageChannelId = 'message-channel-id';

describe('MessageChannelSyncStatusService', () => {
  it('invalidates Gmail READY and rotates incarnation before clearing a 404 cursor', async () => {
    const calls: string[] = [];
    const tx = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM core."messageChannel"')) {
          calls.push('channel');
          return [{ connectedAccountId: 'account-id' }];
        }
        if (sql.includes('FOR UPDATE')) {
          calls.push('account-lock');
          return [{ id: 'account-id' }];
        }
        if (sql.includes('pg_attribute')) return [{ hasIncarnation: true }];
        if (sql.includes('uuid_generate_v4()')) {
          calls.push('rotate');
          return [];
        }
        if (sql.includes('to_regclass'))
          return [{ tableName: 'campaignEmailBaselineGeneration' }];
        if (sql.includes('campaignEmailBaselineGeneration')) {
          calls.push('invalidate');
          return [];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      mdel: jest.fn(async () => {
        calls.push('cache-reset');
      }),
    };
    const globalManager = {
      executeInWorkspaceContext: jest.fn((fn) => fn()),
      getGlobalWorkspaceDataSource: jest.fn(async () => ({
        transaction: (fn: (manager: typeof tx) => Promise<unknown>) => fn(tx),
      })),
    };
    const module = await Test.createTestingModule({
      providers: [
        MessageChannelSyncStatusService,
        { provide: CacheStorageNamespace.ModuleMessaging, useValue: cache },
        { provide: GlobalWorkspaceOrmManager, useValue: globalManager },
        {
          provide: getRepositoryToken(MessageChannelEntity),
          useValue: { update: jest.fn() },
        },
        {
          provide: getRepositoryToken(MessageFolderEntity),
          useValue: { update: jest.fn() },
        },
        { provide: getRepositoryToken(ConnectedAccountEntity), useValue: {} },
        { provide: getRepositoryToken(UserWorkspaceEntity), useValue: {} },
        { provide: AccountsToReconnectService, useValue: {} },
        { provide: MetricsService, useValue: {} },
        {
          provide: MessageChannelSyncLockService,
          useValue: {
            withLock: (_scope: unknown, fn: () => Promise<unknown>) => fn(),
          },
        },
      ],
    }).compile();
    await module
      .get(MessageChannelSyncStatusService)
      .resetAndMarkAsMessagesListFetchPending([messageChannelId], workspaceId);
    expect(calls).toEqual([
      'channel',
      'account-lock',
      'rotate',
      'invalidate',
      'cache-reset',
    ]);
  });

  it('clears work and current-generation cursor state during a full reset', async () => {
    const cache = {
      get: jest.fn().mockResolvedValue('generation-1'),
      mdel: jest.fn().mockResolvedValue(undefined),
    };
    const messageChannelRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const messageFolderRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const withLock = jest
      .fn()
      .mockImplementation(
        async (_scope: unknown, operation: () => Promise<unknown>) =>
          operation(),
      );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageChannelSyncStatusService,
        {
          provide: CacheStorageNamespace.ModuleMessaging,
          useValue: cache,
        },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((callback: () => unknown) => callback()),
            getGlobalWorkspaceDataSource: jest.fn(async () => ({
              transaction: (
                operation: (manager: unknown) => Promise<unknown>,
              ) => operation({ query: jest.fn().mockResolvedValue([]) }),
            })),
          },
        },
        {
          provide: getRepositoryToken(MessageChannelEntity),
          useValue: messageChannelRepository,
        },
        {
          provide: getRepositoryToken(MessageFolderEntity),
          useValue: messageFolderRepository,
        },
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: {},
        },
        { provide: AccountsToReconnectService, useValue: {} },
        { provide: MetricsService, useValue: {} },
        {
          provide: MessageChannelSyncLockService,
          useValue: { withLock },
        },
      ],
    }).compile();

    await module
      .get(MessageChannelSyncStatusService)
      .resetAndMarkAsMessagesListFetchPending([messageChannelId], workspaceId);
    expect(withLock).toHaveBeenCalledWith(
      { messageChannelId, workspaceId },
      expect.any(Function),
    );

    expect(cache.mdel).toHaveBeenCalledWith([
      getMessagesToImportCacheKey({ messageChannelId, workspaceId }),
      getPendingMessageSyncGenerationCacheKey({
        messageChannelId,
        workspaceId,
      }),
      getPendingMessageSyncCursorsCacheKey({
        generationId: 'generation-1',
        messageChannelId,
        workspaceId,
      }),
      getAcknowledgedMessageSyncIdsCacheKey({
        generationId: 'generation-1',
        messageChannelId,
        workspaceId,
      }),
    ]);
    expect(messageChannelRepository.update).toHaveBeenCalled();
    expect(messageFolderRepository.update).toHaveBeenCalled();
  });
});
