import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { ImapSmtpCalDavAPIService } from 'src/modules/connected-account/services/imap-smtp-caldav-apis.service';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'connected-account-id') }));

describe('ImapSmtpCalDavAPIService calendar retirement', () => {
  it('creates only an email channel when legacy CalDAV parameters are present', async () => {
    const save = jest.fn();
    const transactionManager = {
      queryRunner: {
        isTransactionActive: true,
        isReleased: false,
        query: jest.fn(),
      },
      getRepository: jest.fn((entity) => {
        if (entity === ConnectedAccountEntity) {
          return { save };
        }
        if (entity === MessageChannelEntity) {
          return { findOne: jest.fn().mockResolvedValue(null) };
        }
        throw new Error('Unexpected repository');
      }),
    };
    const connectedAccountRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      manager: {
        transaction: jest.fn((callback) => callback(transactionManager)),
      },
    };
    const messageChannelRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const createMessageChannel = jest
      .fn()
      .mockResolvedValue('message-channel-id');
    const service = new ImapSmtpCalDavAPIService(
      connectedAccountRepository as never,
      messageChannelRepository as never,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'user-workspace-id', userId: 'user-id' }),
      } as never,
      { add: jest.fn() } as never,
      { createMessageChannel } as never,
      { syncMessageFolders: jest.fn() } as never,
      { removeAccountToReconnect: jest.fn() } as never,
      { resetAndMarkAsMessagesListFetchPending: jest.fn() } as never,
      {
        encryptConnectionParameters: jest.fn(
          ({ connectionParameters }) => connectionParameters,
        ),
      } as never,
    );

    await service.upsertConnectedAccount({
      connectionParameters: {
        IMAP: {
          connectionSecurity: 'SSL_TLS',
          host: 'imap.example.com',
          password: 'password',
          port: 993,
        },
        CALDAV: {
          connectionSecurity: 'SSL_TLS',
          host: 'caldav.example.com',
          password: 'password',
          port: 443,
        },
      } as never,
      handle: 'test@example.com',
      userWorkspaceId: 'user-workspace-id',
      workspaceId: 'workspace-id',
    });

    expect(createMessageChannel).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'connected-account-id' }),
    );
  });
});
