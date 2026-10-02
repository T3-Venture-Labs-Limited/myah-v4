import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { ImapSmtpCalDavAPIService } from 'src/modules/connected-account/services/imap-smtp-caldav-apis.service';
import { WorkspaceSharedConnectedAccountConflictError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-conflict.error';
import { WorkspaceSharedConnectedAccountNotFoundError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-not-found.error';

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

  describe('workspace-shared replay', () => {
    const makeFixture = () => {
      const save = jest.fn();
      const findAccount = jest.fn().mockResolvedValue(null);
      const findChannel = jest.fn().mockResolvedValue(null);
      const query = jest.fn();
      const transactionManager = {
        query,
        queryRunner: { isTransactionActive: true, isReleased: false, query },
        getRepository: jest.fn((entity) => {
          if (entity === ConnectedAccountEntity)
            return { findOne: findAccount, save };
          if (entity === MessageChannelEntity) return { findOne: findChannel };
          throw new Error('Unexpected repository');
        }),
      };
      const connectedAccountRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        manager: {
          transaction: jest.fn((callback) => callback(transactionManager)),
        },
      };
      const createMessageChannel = jest
        .fn()
        .mockResolvedValue('message-channel-id');
      const service = new ImapSmtpCalDavAPIService(
        connectedAccountRepository as never,
        { findOne: jest.fn().mockResolvedValue(null) } as never,
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
      const input = {
        handle: 'test@example.com',
        userWorkspaceId: 'user-workspace-id',
        workspaceId: 'workspace-id',
        visibility: 'workspace' as const,
        connectionParameters: {
          IMAP: {
            connectionSecurity: 'SSL_TLS',
            host: 'imap.example.com',
            password: 'password',
            port: 993,
          },
        } as never,
      };
      return {
        service,
        input,
        save,
        findAccount,
        findChannel,
        query,
        connectedAccountRepository,
        createMessageChannel,
      };
    };

    it('persists a new shared account as workspace-visible', async () => {
      const fixture = makeFixture();
      await fixture.service.upsertConnectedAccount(fixture.input);
      expect(fixture.save).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'workspace',
          id: 'connected-account-id',
        }),
      );
      expect(fixture.createMessageChannel).toHaveBeenCalledTimes(1);
    });

    it('locks the workspace before replaying an existing account and channel', async () => {
      const fixture = makeFixture();
      fixture.findAccount.mockResolvedValue({
        id: 'existing-account-id',
        handle: fixture.input.handle,
        userWorkspaceId: 'user-workspace-id',
        visibility: 'workspace',
      });
      fixture.findChannel.mockResolvedValue({
        id: 'existing-channel-id',
        syncStage: 'PENDING_CONFIGURATION',
      });
      const result = await fixture.service.upsertConnectedAccount(
        fixture.input,
      );

      expect(fixture.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['workspace-shared-imap-smtp:workspace-id'],
      );
      expect(fixture.query.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.findAccount.mock.invocationCallOrder[0],
      );
      expect(fixture.findAccount).toHaveBeenCalledWith({
        lock: { mode: 'pessimistic_write' },
        where: expect.objectContaining({
          visibility: 'workspace',
          workspaceId: 'workspace-id',
        }),
      });
      expect(result).toEqual({
        connectedAccountId: 'existing-account-id',
        messageChannelId: 'existing-channel-id',
      });
      expect(fixture.save).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'workspace',
          id: 'existing-account-id',
        }),
      );
      expect(fixture.createMessageChannel).not.toHaveBeenCalled();
    });

    it('rejects a concurrent shared-name collision before saving', async () => {
      const fixture = makeFixture();
      fixture.findAccount.mockResolvedValue({
        id: 'existing-account-id',
        handle: 'other@example.com',
        visibility: 'workspace',
      });
      await expect(
        fixture.service.upsertConnectedAccount({
          ...fixture.input,
          name: 'shared-outreach-mailbox',
        }),
      ).rejects.toBeInstanceOf(WorkspaceSharedConnectedAccountConflictError);
      expect(fixture.save).not.toHaveBeenCalled();
    });

    it('does not silently downgrade a shared account to user scope', async () => {
      const fixture = makeFixture();
      await expect(
        fixture.service.upsertConnectedAccount({
          ...fixture.input,
          visibility: 'user',
          existingAccount: {
            id: 'existing-account-id',
            visibility: 'workspace',
          } as never,
        }),
      ).rejects.toBeInstanceOf(WorkspaceSharedConnectedAccountConflictError);
      expect(
        fixture.connectedAccountRepository.manager.transaction,
      ).not.toHaveBeenCalled();
      expect(fixture.save).not.toHaveBeenCalled();
    });

    it('does not recreate an expected shared account that disappeared under the lock', async () => {
      const fixture = makeFixture();
      await expect(
        fixture.service.upsertConnectedAccount({
          ...fixture.input,
          name: 'shared-outreach-mailbox',
          existingAccount: {
            id: 'existing-account-id',
            visibility: 'workspace',
          } as never,
        }),
      ).rejects.toBeInstanceOf(WorkspaceSharedConnectedAccountNotFoundError);
      expect(fixture.save).not.toHaveBeenCalled();
    });

    it('scopes the replay lock and lookup to the requested workspace', async () => {
      const fixture = makeFixture();
      await fixture.service.upsertConnectedAccount({
        ...fixture.input,
        workspaceId: 'other-workspace-id',
      });
      expect(fixture.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        ['workspace-shared-imap-smtp:other-workspace-id'],
      );
      expect(fixture.findAccount).toHaveBeenCalledWith({
        lock: { mode: 'pessimistic_write' },
        where: expect.objectContaining({ workspaceId: 'other-workspace-id' }),
      });
    });
  });
});
