import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';

describe('ConnectedAccountMetadataService forecast invalidation', () => {
  it('invalidates after deleting a connected account with the transaction manager', async () => {
    const events: string[] = [];
    const queryRunner = {
      isReleased: false,
      isTransactionActive: true,
      query: jest.fn(() => events.push('forecast-invalidation')),
    };
    const connectedAccounts = {
      delete: jest.fn(async () => {
        events.push('account-delete');
        return { affected: 1 };
      }),
      findOneOrFail: jest.fn().mockResolvedValue({
        id: accountId,
        userWorkspaceId: 'user-workspace-id',
      }),
    };
    const calendarChannels = { find: jest.fn().mockResolvedValue([]) };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === ConnectedAccountEntity
          ? connectedAccounts
          : calendarChannels,
      ),
      queryRunner,
    };
    const repository = {
      manager: { transaction: jest.fn((operation) => operation(manager)) },
    };
    const service = new ConnectedAccountMetadataService(
      repository as never,
      calendarChannels as never,
      {} as never,
      { revokeIfApp: jest.fn() } as never,
      { emitCustomBatchEvent: jest.fn() } as never,
      {
        assertDeletionAllowedInTransaction: jest.fn().mockResolvedValue([]),
      } as never,
    );

    await service.delete({ id: accountId, workspaceId });

    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(connectedAccounts.delete).toHaveBeenCalledWith({
      id: accountId,
      workspaceId,
    });
    expect(events).toEqual(['account-delete', 'forecast-invalidation']);
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('campaignForecastHead'),
      [workspaceId, `workspace:${workspaceId}`],
    );
  });

  it('invalidates after transfer archives personal accounts and disables their message channels', async () => {
    const events: string[] = [];
    const queryRunner = {
      isReleased: false,
      isTransactionActive: true,
      query: jest.fn(() => events.push('forecast-invalidation')),
    };
    const manager = {
      queryRunner,
      update: jest.fn(async (entity) => {
        events.push(
          entity === ConnectedAccountEntity
            ? 'account-archive'
            : entity === MessageChannelEntity
              ? 'message-channel-disable'
              : 'calendar-channel-disable',
        );
      }),
    };
    const repository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: accountId, name: 'Personal account', visibility: 'user' },
        ]),
      manager: { transaction: jest.fn((operation) => operation(manager)) },
    };
    const service = new ConnectedAccountMetadataService(
      repository as never,
      {} as never,
      {} as never,
      { revokeIfApp: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    await service.transferOwnership({
      fromUserWorkspaceId: 'from-user-workspace-id',
      toUserWorkspaceId: 'to-user-workspace-id',
      workspaceId,
    });

    expect(events).toEqual([
      'account-archive',
      'message-channel-disable',
      'calendar-channel-disable',
      'forecast-invalidation',
    ]);
  });
});
