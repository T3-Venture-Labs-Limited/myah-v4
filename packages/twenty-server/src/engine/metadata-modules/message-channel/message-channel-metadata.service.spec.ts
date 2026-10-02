import { MessageChannelMetadataService } from 'src/engine/metadata-modules/message-channel/message-channel-metadata.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const channelId = '22222222-2222-4222-8222-222222222222';
const accountId = '33333333-3333-4333-8333-333333333333';

describe('MessageChannelMetadataService forecast invalidation', () => {
  const makeService = () => {
    const events: string[] = [];
    const queryRunner = {
      isReleased: false,
      isTransactionActive: true,
      query: jest.fn(() => events.push('forecast-invalidation')),
    };
    const transactionalRepository = {
      delete: jest.fn(async () => {
        events.push('channel-delete');
        return { affected: 1 };
      }),
      findOneOrFail: jest.fn().mockResolvedValue({ id: channelId }),
      update: jest.fn(async () => events.push('channel-update')),
    };
    const manager = {
      getRepository: jest.fn(() => transactionalRepository),
      queryRunner,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn().mockResolvedValue({ id: channelId }),
      manager: { transaction: jest.fn((operation) => operation(manager)) },
      update: jest.fn(),
    };
    const service = new MessageChannelMetadataService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      { emitCustomBatchEvent: jest.fn() } as never,
      {
        assertDeletionAllowedInTransaction: jest.fn().mockResolvedValue([]),
      } as never,
    );
    return { events, repository, service, transactionalRepository };
  };

  it('invalidates after the generic isSyncEnabled update in the same transaction', async () => {
    const { events, repository, service, transactionalRepository } =
      makeService();

    await service.update({
      data: { isSyncEnabled: false },
      id: channelId,
      workspaceId,
    });

    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionalRepository.update).toHaveBeenCalledWith(
      { id: channelId, workspaceId },
      { isSyncEnabled: false },
    );
    expect(events).toEqual(['channel-update', 'forecast-invalidation']);
  });

  it('invalidates after deleting a message channel in the same transaction', async () => {
    const { events, repository, service, transactionalRepository } =
      makeService();

    await service.delete({
      connectedAccountId: accountId,
      messageChannelId: channelId,
      workspaceId,
    });

    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionalRepository.delete).toHaveBeenCalledWith({
      connectedAccountId: accountId,
      id: channelId,
      workspaceId,
    });
    expect(events).toEqual(['channel-delete', 'forecast-invalidation']);
  });
});
