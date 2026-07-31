import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  ConnectedAccountProvider,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
} from 'twenty-shared/types';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { ImapSmtpCaldavService } from 'src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service';
import { type PlaintextImapSmtpCaldavParams } from 'src/engine/core-modules/imap-smtp-caldav-connection/types/imap-smtp-caldav-connection.type';
import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { WorkspaceMailboxConnectionException } from 'src/engine/core-modules/myah/exceptions/workspace-mailbox-connection.exception';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { maskWorkspaceMailboxHandle } from 'src/engine/core-modules/myah/utils/mask-workspace-mailbox-handle.util';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WorkspaceSharedConnectedAccountConflictError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-conflict.error';
import { WorkspaceSharedConnectedAccountNotFoundError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-not-found.error';
import { ImapSmtpCalDavAPIService } from 'src/modules/connected-account/services/imap-smtp-caldav-apis.service';

describe('WorkspaceMailboxConnectionService', () => {
  describe('maskWorkspaceMailboxHandle', () => {
    it('masks a normal mailbox local part', () => {
      expect(maskWorkspaceMailboxHandle('outreach@example.com')).toBe(
        'o***h@example.com',
      );
    });

    it('masks a one-character mailbox local part', () => {
      expect(maskWorkspaceMailboxHandle('a@example.com')).toBe(
        'a***@example.com',
      );
    });

    it.each(['not-an-email', 'a@@example.com'])(
      'rejects malformed handle %s',
      (handle) => {
        expect(() => maskWorkspaceMailboxHandle(handle)).toThrow(
          'Invalid mailbox handle',
        );
      },
    );
  });

  describe('connectWorkspaceMailbox', () => {
    let service: WorkspaceMailboxConnectionService;

    const connectionParameters = {
      IMAP: {
        host: 'imap.example.com',
        port: 993,
        username: 'outreach@example.com',
        password: 'workspace-secret' as PlaintextString,
        connectionSecurity: EmailConnectionSecurity.SSL_TLS,
      },
      SMTP: {
        host: 'smtp.example.com',
        port: 587,
        username: 'outreach@example.com',
        password: 'workspace-secret' as PlaintextString,
        connectionSecurity: EmailConnectionSecurity.STARTTLS,
      },
    } satisfies PlaintextImapSmtpCaldavParams;
    const existingAccount = {
      id: 'connected-account-id',
      authFailedAt: null,
      handle: 'outreach@example.com',
      name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
      provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
      updatedAt: new Date('2026-07-27T12:00:00.000Z'),
      userWorkspaceId: 'user-workspace-id',
      visibility: 'workspace',
      workspaceId: 'workspace-id',
    } as ConnectedAccountEntity;
    const messageChannel = {
      id: 'message-channel-id',
      connectedAccountId: existingAccount.id,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      syncStatus: MessageChannelSyncStatus.ACTIVE,
      updatedAt: new Date('2026-07-27T12:00:00.000Z'),
      workspaceId: 'workspace-id',
    } as MessageChannelEntity;
    const connectedAccountRepository = { findOne: jest.fn() };
    const messageChannelRepository = { findOne: jest.fn() };
    const userWorkspaceRepository = { findOne: jest.fn() };
    const validationService = {
      validateAndTestWorkspaceMailboxConnection: jest.fn(),
    };
    const apiService = { upsertConnectedAccount: jest.fn() };
    const encryptionService = {
      decryptConnectionParameters: jest.fn(),
    };
    const metadataService = { delete: jest.fn() };

    beforeEach(async () => {
      jest.clearAllMocks();
      connectedAccountRepository.findOne.mockResolvedValue(null);
      messageChannelRepository.findOne.mockResolvedValue(messageChannel);
      userWorkspaceRepository.findOne.mockResolvedValue({
        id: 'user-workspace-id',
        userId: 'user-id',
        workspaceId: 'workspace-id',
      });
      validationService.validateAndTestWorkspaceMailboxConnection.mockResolvedValue(
        connectionParameters,
      );
      apiService.upsertConnectedAccount.mockResolvedValue({
        connectedAccountId: existingAccount.id,
        messageChannelId: messageChannel.id,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WorkspaceMailboxConnectionService,
          {
            provide: getRepositoryToken(ConnectedAccountEntity),
            useValue: connectedAccountRepository,
          },
          {
            provide: getRepositoryToken(MessageChannelEntity),
            useValue: messageChannelRepository,
          },
          {
            provide: getRepositoryToken(UserWorkspaceEntity),
            useValue: userWorkspaceRepository,
          },
          { provide: ImapSmtpCaldavService, useValue: validationService },
          { provide: ImapSmtpCalDavAPIService, useValue: apiService },
          {
            provide: ConnectedAccountTokenEncryptionService,
            useValue: encryptionService,
          },
          {
            provide: ConnectedAccountMetadataService,
            useValue: metadataService,
          },
        ],
      }).compile();

      service = module.get(WorkspaceMailboxConnectionService);
    });

    it('validates before creating a native shared account and channel', async () => {
      const result = await service.connectWorkspaceMailbox({
        accountType: 'IMAP_SMTP',
        connectionParameters,
        handle: ' Outreach@Example.com ',
        userWorkspaceId: 'user-workspace-id',
        workspaceId: 'workspace-id',
      });

      expect(
        validationService.validateAndTestWorkspaceMailboxConnection,
      ).toHaveBeenCalledWith({
        connectionParameters,
        handle: 'outreach@example.com',
      });
      expect(
        validationService.validateAndTestWorkspaceMailboxConnection.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        apiService.upsertConnectedAccount.mock.invocationCallOrder[0],
      );
      expect(apiService.upsertConnectedAccount).toHaveBeenCalledWith({
        connectionParameters,
        existingAccount: null,
        handle: 'outreach@example.com',
        name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
        userWorkspaceId: 'user-workspace-id',
        visibility: 'workspace',
        workspaceId: 'workspace-id',
      });
      expect(result).toEqual({
        connectedAccountId: existingAccount.id,
        messageChannelId: messageChannel.id,
        status: {
          connectedAccountId: existingAccount.id,
          errorCode: null,
          errorMessage: null,
          lastSafeOperation: 'CONNECTED',
          maskedHandle: 'o***h@example.com',
          messageChannelId: messageChannel.id,
          state: 'CONNECTED',
          syncStage: messageChannel.syncStage,
          syncStatus: messageChannel.syncStatus,
          updatedAt: messageChannel.updatedAt,
        },
      });
    });

    it('derives a technical owner from the same workspace for a server call', async () => {
      await service.connectWorkspaceMailbox({
        accountType: 'IMAP_SMTP',
        connectionParameters,
        handle: 'outreach@example.com',
        workspaceId: 'workspace-id',
      });

      expect(userWorkspaceRepository.findOne).toHaveBeenCalledWith({
        order: { createdAt: 'ASC' },
        where: { workspaceId: 'workspace-id' },
      });
      expect(apiService.upsertConnectedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ userWorkspaceId: 'user-workspace-id' }),
      );
    });

    it('replays the same mailbox and rejects a different active handle', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(existingAccount);

      await service.connectWorkspaceMailbox({
        accountType: 'IMAP_SMTP',
        connectionParameters,
        handle: 'outreach@example.com',
        userWorkspaceId: 'second-user-workspace-id',
        workspaceId: 'workspace-id',
      });

      expect(apiService.upsertConnectedAccount).toHaveBeenCalledWith(
        expect.objectContaining({ existingAccount }),
      );

      await expect(
        service.connectWorkspaceMailbox({
          accountType: 'IMAP_SMTP',
          connectionParameters,
          handle: 'different@example.com',
          userWorkspaceId: 'second-user-workspace-id',
          workspaceId: 'workspace-id',
        }),
      ).rejects.toMatchObject({
        code: 'MAILBOX_ALREADY_CONNECTED',
      } satisfies Partial<WorkspaceMailboxConnectionException>);
    });

    it('maps an atomic different-handle race to already connected', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(null);
      apiService.upsertConnectedAccount.mockRejectedValueOnce(
        new WorkspaceSharedConnectedAccountConflictError(),
      );

      await expect(
        service.connectWorkspaceMailbox({
          accountType: 'IMAP_SMTP',
          connectionParameters,
          handle: 'different@example.com',
          userWorkspaceId: 'second-user-workspace-id',
          workspaceId: 'workspace-id',
        }),
      ).rejects.toMatchObject({ code: 'MAILBOX_ALREADY_CONNECTED' });
    });

    it('returns a secret-free connection projection', async () => {
      const result = await service.connectWorkspaceMailbox({
        accountType: 'IMAP_SMTP',
        connectionParameters,
        handle: 'outreach@example.com',
        userWorkspaceId: 'user-workspace-id',
        workspaceId: 'workspace-id',
      });
      const serializedResult = JSON.stringify(result);

      for (const forbiddenText of [
        'workspace-secret',
        'username',
        'connectionParameters',
        'warmup',
        'readiness',
        'capacity',
        'campaign',
      ]) {
        expect(serializedResult).not.toContain(forbiddenText);
      }
    });

    it('rotates credentials only after strict validation and preserves IDs', async () => {
      const rotatedSmtp = {
        ...connectionParameters.SMTP,
        password: 'rotated-secret' as PlaintextString,
      };
      const storedAccount = {
        ...existingAccount,
        connectionParameters: { encrypted: true },
      } as unknown as ConnectedAccountEntity;

      connectedAccountRepository.findOne.mockResolvedValue(storedAccount);
      encryptionService.decryptConnectionParameters.mockReturnValue(
        connectionParameters,
      );
      validationService.validateAndTestWorkspaceMailboxConnection.mockResolvedValue(
        {
          IMAP: connectionParameters.IMAP,
          SMTP: rotatedSmtp,
        },
      );

      const result = await service.rotateWorkspaceMailbox({
        connectedAccountId: existingAccount.id,
        connectionParameters: { SMTP: rotatedSmtp },
        workspaceId: 'workspace-id',
      });

      expect(connectedAccountRepository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: existingAccount.id,
          name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
          provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
          visibility: 'workspace',
          workspaceId: 'workspace-id',
        }),
      });
      expect(
        encryptionService.decryptConnectionParameters,
      ).toHaveBeenCalledWith({
        connectionParameters: storedAccount.connectionParameters,
        workspaceId: 'workspace-id',
      });
      expect(
        validationService.validateAndTestWorkspaceMailboxConnection,
      ).toHaveBeenCalledWith({
        connectionParameters: {
          IMAP: connectionParameters.IMAP,
          SMTP: rotatedSmtp,
        },
        handle: existingAccount.handle,
      });
      expect(
        validationService.validateAndTestWorkspaceMailboxConnection.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        apiService.upsertConnectedAccount.mock.invocationCallOrder[0],
      );
      expect(apiService.upsertConnectedAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          existingAccount: storedAccount,
          userWorkspaceId: storedAccount.userWorkspaceId,
          visibility: 'workspace',
          workspaceId: 'workspace-id',
        }),
      );
      expect(result.connectedAccountId).toBe(existingAccount.id);
      expect(result.messageChannelId).toBe(messageChannel.id);
      expect(result.status.lastSafeOperation).toBe('ROTATED');
      expect(JSON.stringify(result)).not.toContain('rotated-secret');
    });

    it('does not replace credentials when rotation validation fails', async () => {
      connectedAccountRepository.findOne.mockResolvedValue({
        ...existingAccount,
        connectionParameters: { encrypted: true },
      } as unknown as ConnectedAccountEntity);
      encryptionService.decryptConnectionParameters.mockReturnValue(
        connectionParameters,
      );
      validationService.validateAndTestWorkspaceMailboxConnection.mockRejectedValue(
        new WorkspaceMailboxConnectionException('AUTHENTICATION_FAILED'),
      );

      await expect(
        service.rotateWorkspaceMailbox({
          connectedAccountId: existingAccount.id,
          connectionParameters,
          workspaceId: 'workspace-id',
        }),
      ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });

      expect(apiService.upsertConnectedAccount).not.toHaveBeenCalled();
    });

    it('normalizes decryption failures and never attempts replacement', async () => {
      connectedAccountRepository.findOne.mockResolvedValue({
        ...existingAccount,
        connectionParameters: { encrypted: true },
      } as unknown as ConnectedAccountEntity);
      encryptionService.decryptConnectionParameters.mockImplementation(() => {
        throw new Error('crypto failed for workspace-secret');
      });

      const error = await service
        .rotateWorkspaceMailbox({
          connectedAccountId: existingAccount.id,
          connectionParameters,
          workspaceId: 'workspace-id',
        })
        .catch((caughtError) => caughtError);

      expect(error).toMatchObject({ code: 'UNKNOWN' });
      expect(JSON.stringify(error)).not.toContain('workspace-secret');
      expect(
        validationService.validateAndTestWorkspaceMailboxConnection,
      ).not.toHaveBeenCalled();
      expect(apiService.upsertConnectedAccount).not.toHaveBeenCalled();
    });

    it('rejects cross-workspace rotation before decrypting credentials', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rotateWorkspaceMailbox({
          connectedAccountId: existingAccount.id,
          connectionParameters,
          workspaceId: 'other-workspace-id',
        }),
      ).rejects.toMatchObject({ code: 'MAILBOX_NOT_FOUND' });

      expect(
        encryptionService.decryptConnectionParameters,
      ).not.toHaveBeenCalled();
      expect(
        validationService.validateAndTestWorkspaceMailboxConnection,
      ).not.toHaveBeenCalled();
      expect(apiService.upsertConnectedAccount).not.toHaveBeenCalled();
    });

    it('reconnects through the same replacement path with stable IDs', async () => {
      connectedAccountRepository.findOne.mockResolvedValue({
        ...existingAccount,
        authFailedAt: new Date('2026-07-27T11:00:00.000Z'),
        connectionParameters: { encrypted: true },
      } as unknown as ConnectedAccountEntity);
      encryptionService.decryptConnectionParameters.mockReturnValue(
        connectionParameters,
      );

      const result = await service.reconnectWorkspaceMailbox({
        connectedAccountId: existingAccount.id,
        connectionParameters,
        workspaceId: 'workspace-id',
      });

      expect(apiService.upsertConnectedAccount).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          connectedAccountId: existingAccount.id,
          messageChannelId: messageChannel.id,
          status: expect.objectContaining({
            lastSafeOperation: 'RECONNECTED',
            state: 'CONNECTED',
          }),
        }),
      );
    });

    it('does not recreate a mailbox that disappears during rotation', async () => {
      connectedAccountRepository.findOne.mockResolvedValue({
        ...existingAccount,
        connectionParameters: { encrypted: true },
      } as unknown as ConnectedAccountEntity);
      encryptionService.decryptConnectionParameters.mockReturnValue(
        connectionParameters,
      );
      apiService.upsertConnectedAccount.mockRejectedValueOnce(
        new WorkspaceSharedConnectedAccountNotFoundError(),
      );

      await expect(
        service.rotateWorkspaceMailbox({
          connectedAccountId: existingAccount.id,
          connectionParameters,
          workspaceId: 'workspace-id',
        }),
      ).rejects.toMatchObject({ code: 'MAILBOX_NOT_FOUND' });

      expect(apiService.upsertConnectedAccount).toHaveBeenCalledTimes(1);
    });

    it('returns status only for the authenticated workspace', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(existingAccount);

      const status = await service.getWorkspaceMailboxStatus({
        connectedAccountId: existingAccount.id,
        workspaceId: 'workspace-id',
      });

      expect(connectedAccountRepository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: existingAccount.id,
          workspaceId: 'workspace-id',
        }),
      });
      expect(status).toEqual(
        expect.objectContaining({
          connectedAccountId: existingAccount.id,
          maskedHandle: 'o***h@example.com',
          messageChannelId: messageChannel.id,
          state: 'CONNECTED',
        }),
      );

      connectedAccountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getWorkspaceMailboxStatus({
          connectedAccountId: existingAccount.id,
          workspaceId: 'other-workspace-id',
        }),
      ).rejects.toMatchObject({ code: 'MAILBOX_NOT_FOUND' });
    });

    it('projects failed authentication as reconnect required', async () => {
      connectedAccountRepository.findOne.mockResolvedValue({
        ...existingAccount,
        authFailedAt: new Date('2026-07-27T11:00:00.000Z'),
      } as ConnectedAccountEntity);

      const status = await service.getWorkspaceMailboxStatus({
        connectedAccountId: existingAccount.id,
        workspaceId: 'workspace-id',
      });

      expect(status).toEqual(
        expect.objectContaining({
          errorCode: 'RECONNECT_REQUIRED',
          state: 'RECONNECT_REQUIRED',
        }),
      );
      expect(JSON.stringify(status)).not.toContain('workspace-secret');
    });

    it('revokes through the native workspace lifecycle', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(existingAccount);
      metadataService.delete.mockResolvedValue(existingAccount);

      const result = await service.revokeWorkspaceMailbox({
        connectedAccountId: existingAccount.id,
        workspaceId: 'workspace-id',
      });

      expect(metadataService.delete).toHaveBeenCalledWith({
        allowWorkspaceMailbox: true,
        id: existingAccount.id,
        workspaceId: 'workspace-id',
      });
      expect(result).toEqual({
        connectedAccountId: existingAccount.id,
        revoked: true,
        state: 'REVOKED',
      });
    });

    it('treats disappearance during revocation as already revoked', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(existingAccount);
      metadataService.delete.mockRejectedValue(
        new ConnectedAccountException(
          'Connected account not found',
          ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
        ),
      );

      await expect(
        service.revokeWorkspaceMailbox({
          connectedAccountId: existingAccount.id,
          workspaceId: 'workspace-id',
        }),
      ).resolves.toEqual({
        connectedAccountId: existingAccount.id,
        revoked: true,
        state: 'REVOKED',
      });
    });

    it('normalizes native revocation failures without raw dependency text', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(existingAccount);
      metadataService.delete.mockRejectedValue(
        new Error('delete leaked workspace-secret at provider-host'),
      );

      const error = await service
        .revokeWorkspaceMailbox({
          connectedAccountId: existingAccount.id,
          workspaceId: 'workspace-id',
        })
        .catch((caughtError) => caughtError);

      expect(error).toMatchObject({ code: 'UNKNOWN' });
      expect(JSON.stringify(error)).not.toContain('workspace-secret');
      expect(JSON.stringify(error)).not.toContain('provider-host');
    });

    it('makes absent and cross-workspace revocation indistinguishable', async () => {
      connectedAccountRepository.findOne.mockResolvedValue(null);

      for (const workspaceId of ['workspace-id', 'other-workspace-id']) {
        await expect(
          service.revokeWorkspaceMailbox({
            connectedAccountId: existingAccount.id,
            workspaceId,
          }),
        ).resolves.toEqual({
          connectedAccountId: existingAccount.id,
          revoked: true,
          state: 'REVOKED',
        });
      }

      expect(metadataService.delete).not.toHaveBeenCalled();
    });
  });
});
