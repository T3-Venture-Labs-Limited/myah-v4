import {
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
} from 'twenty-shared/types';

import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const channelId = '22222222-2222-4222-8222-222222222222';
const accountId = '33333333-3333-4333-8333-333333333333';

describe('MessageChannelSyncStatusService forecast invalidation', () => {
  const makeService = () => {
    const events: string[] = [];
    const queries: string[] = [];
    const channels = {
      find: jest
        .fn()
        .mockResolvedValue([{ connectedAccountId: accountId, id: channelId }]),
      update: jest.fn(async () => {
        events.push('channel-update');
        return { affected: 1 };
      }),
    };
    const accounts = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === MessageChannelEntity ? channels : accounts,
      ),
      queryRunner: {
        isReleased: false,
        isTransactionActive: true,
        query: jest.fn((sql: string) => {
          events.push('forecast-invalidation');
          queries.push(sql);
        }),
      },
    };
    const dataSource = {
      transaction: jest.fn((operation) => operation(manager)),
    };
    const service = new MessageChannelSyncStatusService(
      {} as never,
      {
        executeInWorkspaceContext: jest.fn((operation) => operation()),
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
        getRepository: jest.fn().mockResolvedValue({
          findOne: jest.fn().mockResolvedValue(null),
        }),
      } as never,
      channels as never,
      {} as never,
      accounts as never,
      {} as never,
      { addAccountToReconnectByKey: jest.fn() } as never,
      {} as never,
      { incrementCounterForEvents: jest.fn() } as never,
    );
    return { accounts, channels, dataSource, events, queries, service };
  };

  it('invalidates in the same transaction as an insufficient-permissions readiness loss', async () => {
    const { accounts, channels, dataSource, events, queries, service } =
      makeService();

    await service.markAsFailed(
      [channelId],
      workspaceId,
      MessageChannelSyncStatus.FAILED_INSUFFICIENT_PERMISSIONS,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(channels.update).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      expect.objectContaining({
        syncStatus: MessageChannelSyncStatus.FAILED_INSUFFICIENT_PERMISSIONS,
      }),
    );
    expect(accounts.update).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      expect.objectContaining({ authFailedAt: expect.any(Date) }),
    );
    expect(events).toEqual(['channel-update', 'forecast-invalidation']);
    expect(queries).toEqual(
      expect.arrayContaining([expect.stringContaining('campaignForecastHead')]),
    );
  });

  it('invalidates in the same transaction as sender readiness restoration', async () => {
    const { channels, dataSource, events, queries, service } = makeService();

    await service.markAsMessageSyncCompleted([channelId], workspaceId);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(channels.update).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      expect.objectContaining({ syncStatus: MessageChannelSyncStatus.ACTIVE }),
    );
    expect(events).toEqual(['channel-update', 'forecast-invalidation']);
    expect(queries).toEqual(
      expect.arrayContaining([expect.stringContaining('campaignForecastHead')]),
    );
  });

  it.each([
    [
      'schedules a message-list fetch',
      'markAsMessagesListFetchScheduled' as const,
      MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
    ],
    [
      'starts a message-list fetch',
      'markAsMessagesListFetchOngoing' as const,
      MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING,
    ],
    [
      'starts message import',
      'markAsMessagesImportOngoing' as const,
      MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
    ],
  ])(
    '%s and invalidates with the identical transaction manager',
    async (_description, method, syncStage) => {
      const { channels, dataSource, events, queries, service } = makeService();

      await service[method]([channelId], workspaceId);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(channels.update).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId }),
        expect.objectContaining({
          syncStage,
          syncStatus: MessageChannelSyncStatus.ONGOING,
        }),
      );
      expect(events).toEqual(['channel-update', 'forecast-invalidation']);
      expect(queries).toEqual([
        expect.stringContaining('campaignForecastHead'),
      ]);
    },
  );
});
