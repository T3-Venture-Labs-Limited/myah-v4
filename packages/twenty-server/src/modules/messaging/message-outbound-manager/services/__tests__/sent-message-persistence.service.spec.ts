import {
  MessageChannelType,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';

import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';

describe('SentMessagePersistenceService', () => {
  it('initializes the first outbound tuple and receipt through the real save boundary', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const messageChannelId = '00000000-0000-4000-8000-000000000102';
    const connectedAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'sender@brand.com',
      handleAliases: [],
    } as unknown as ConnectedAccountEntity;
    const triageService = {
      ensureSourceContactInTransaction: jest.fn().mockResolvedValue(undefined),
      lockIdentityKeysInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    const receiptService = {
      recordInTransaction: jest.fn().mockResolvedValue(undefined),
      isTriageSchemaProvisioned: jest.fn().mockResolvedValue(true),
      lockMigrationMarkerForSourcePersistenceInTransaction: jest
        .fn()
        .mockResolvedValue(true),
    };
    const messageChannelRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: messageChannelId,
        workspaceId,
        connectedAccountId: connectedAccount.id,
        handle: connectedAccount.handle,
        connectedAccount,
      }),
    };
    const transactionManager = {
      queryRunner: {
        isTransactionActive: true,
        isReleased: false,
        manager: undefined as unknown,
        query: jest.fn().mockResolvedValue([]),
      },
      getRepository: jest.fn().mockReturnValue(messageChannelRepository),
    };
    transactionManager.queryRunner.manager = transactionManager;
    const saveService =
      new MessagingSaveMessagesAndEnqueueContactCreationService(
        { add: jest.fn() } as never,
        {
          saveMessagesWithinTransaction: jest.fn().mockResolvedValue({
            messageExternalIdsAndIdsMap: new Map([
              ['provider-message-id', '00000000-0000-4000-8000-000000000104'],
            ]),
            messageExternalIdToMessageChannelMessageAssociationIdMap: new Map(),
            messageExternalIdToMessageThreadIdMap: new Map([
              ['provider-message-id', '00000000-0000-4000-8000-000000000105'],
            ]),
            messageExternalIdToPersistenceInfoMap: new Map([
              [
                'provider-message-id',
                {
                  createdAt: '2026-09-15T10:00:00.000Z',
                  direction: 'OUTGOING',
                  wasInserted: true,
                  messageThreadId: '00000000-0000-4000-8000-000000000105',
                },
              ],
            ]),
          }),
        } as unknown as MessagingMessageService,
        { saveMessageParticipants: jest.fn() } as never,
        { saveMessageFolderAssociations: jest.fn() } as never,
        {} as GlobalWorkspaceOrmManager,
        triageService as unknown as MyahInboxContactTriageService,
        receiptService as unknown as MyahInboxContactTriageReceiptService,
        undefined,
      );
    const service = new SentMessagePersistenceService(
      messageChannelRepository as never,
      saveService,
    );

    await service.persistSentMessage({
      sendResult: {
        headerMessageId: '<sent@example.com>',
        messageExternalId: 'provider-message-id',
      },
      subject: 'Subject',
      body: 'Body',
      recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
      connectedAccount,
      messageChannelId,
      workspaceId,
      expectedMessageId: '00000000-0000-4000-8000-000000000104',
      providerAcceptedAt: new Date('2026-09-15T09:00:00.000Z'),
      transactionManager: transactionManager as never,
    });

    expect(triageService.ensureSourceContactInTransaction).toHaveBeenCalledWith(
      {
        workspaceId,
        sourceType: 'EMAIL_THREAD',
        initialDirection: 'OUTBOUND',
        sourceRecordId: '00000000-0000-4000-8000-000000000105',
        manager: transactionManager,
      },
    );
    expect(receiptService.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'OUTBOUND',
        firstPersistence: true,
        mode: 'LIVE',
        sourceGenerationId: 'sent-email:provider-message-id',
        providerOccurredAt: '2026-09-15T09:00:00.000Z',
      }),
      transactionManager,
    );
  });

  it('enqueues contact creation after successful transactional sent-message persistence', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const messageChannelId = '00000000-0000-4000-8000-000000000102';
    const connectedAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'sender@brand.com',
      handleAliases: [],
    } as unknown as ConnectedAccountEntity;
    const contactsToCreate = [
      {
        messageId: '00000000-0000-4000-8000-000000000104',
        handle: 'creator@example.com',
        shouldCreateContact: true,
      },
    ];
    const saveMessagesAndEnqueueContactCreation = jest.fn().mockResolvedValue({
      messageExternalIdsAndIdsMap: new Map([
        ['provider-message-id', '00000000-0000-4000-8000-000000000104'],
      ]),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['provider-message-id', '00000000-0000-4000-8000-000000000105'],
      ]),
      contactsToCreate,
    });
    const captureContactsToCreate = jest.fn();
    const messageChannelRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: messageChannelId,
        workspaceId,
        connectedAccountId: connectedAccount.id,
        handle: connectedAccount.handle,
        isContactAutoCreationEnabled: true,
        connectedAccount,
      }),
    };
    const transactionManager = {
      queryRunner: {
        isTransactionActive: true,
        isReleased: false,
        manager: undefined as unknown,
        query: jest.fn().mockResolvedValue([]),
      },
      getRepository: jest.fn().mockReturnValue(messageChannelRepository),
    };
    transactionManager.queryRunner.manager = transactionManager;
    const service = new SentMessagePersistenceService(
      messageChannelRepository as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await service.persistSentMessage({
      sendResult: {
        headerMessageId: '<sent@example.com>',
        messageExternalId: 'provider-message-id',
      },
      subject: 'Subject',
      body: 'Body',
      recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
      connectedAccount,
      messageChannelId,
      workspaceId,
      transactionManager: transactionManager as never,
      captureContactsToCreate,
    });

    expect(captureContactsToCreate).toHaveBeenCalledWith(contactsToCreate);
  });

  it('persists the channel alias with its canonical connected account', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const messageChannelId = '00000000-0000-4000-8000-000000000102';
    const primaryAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'primary@brand.com',
      handleAliases: ['brand-alias@brand.com'],
    } as ConnectedAccountEntity;
    const messageChannelRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: messageChannelId,
        workspaceId,
        connectedAccountId: primaryAccount.id,
        handle: 'brand-alias@brand.com',
        connectedAccount: primaryAccount,
      }),
    };
    const saveMessagesAndEnqueueContactCreation = jest.fn().mockResolvedValue({
      messageExternalIdsAndIdsMap: new Map([
        ['provider-message-id', '00000000-0000-4000-8000-000000000104'],
      ]),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['provider-message-id', 'message-thread-id'],
      ]),
    });
    const service = new SentMessagePersistenceService(
      messageChannelRepository as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );
    const providerAcceptedAt = new Date('2026-09-11T10:00:00.000Z');
    const expectedMessageId = '00000000-0000-4000-8000-000000000104';

    await expect(
      service.persistSentMessage({
        sendResult: {
          headerMessageId: '<sent@example.com>',
          messageExternalId: 'provider-message-id',
        },
        subject: '',
        body: 'Thanks for the update',
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        connectedAccount: primaryAccount,
        messageChannelId,
        inReplyTo: '<incoming@example.com>',
        workspaceId,
        expectedMessageId,
        providerAcceptedAt,
      }),
    ).resolves.toEqual({
      messageId: '00000000-0000-4000-8000-000000000104',
      messageThreadId: 'message-thread-id',
    });

    expect(saveMessagesAndEnqueueContactCreation).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          subject: '',
          expectedMessageId,
          receivedAt: providerAcceptedAt,
          participants: expect.arrayContaining([
            expect.objectContaining({
              role: MessageParticipantRole.FROM,
              handle: 'brand-alias@brand.com',
            }),
          ]),
        }),
      ],
      expect.objectContaining({ id: messageChannelId }),
      primaryAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'sent-email:provider-message-id' },
      undefined,
    );
  });

  it('rejects a deterministic Message collision returned by the canonical save chain', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const connectedAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'sender@brand.com',
      handleAliases: [],
    } as unknown as ConnectedAccountEntity;
    const saveMessagesAndEnqueueContactCreation = jest
      .fn()
      .mockRejectedValue(
        new Error('Expected Message identity conflicts with header identity'),
      );
    const service = new SentMessagePersistenceService(
      {
        findOneOrFail: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000102',
          workspaceId,
          connectedAccountId: connectedAccount.id,
          handle: connectedAccount.handle,
          connectedAccount,
        }),
      } as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await expect(
      service.persistSentMessage({
        sendResult: {
          headerMessageId: '<sent@example.com>',
          messageExternalId: 'provider-message-id',
        },
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        connectedAccount,
        messageChannelId: '00000000-0000-4000-8000-000000000102',
        workspaceId,
        expectedMessageId: '00000000-0000-4000-8000-000000000104',
        providerAcceptedAt: new Date('2026-09-11T10:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'Expected Message identity conflicts with header identity',
    );
  });

  it('rejects a connected account that does not own the workspace channel', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const canonicalAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'primary@brand.com',
    } as ConnectedAccountEntity;
    const saveMessagesAndEnqueueContactCreation = jest.fn();
    const service = new SentMessagePersistenceService(
      {
        findOneOrFail: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000102',
          workspaceId,
          connectedAccountId: canonicalAccount.id,
          handle: canonicalAccount.handle,
          connectedAccount: canonicalAccount,
        }),
      } as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await expect(
      service.persistSentMessage({
        sendResult: { headerMessageId: '<sent@example.com>' },
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        connectedAccount: {
          ...canonicalAccount,
          id: '00000000-0000-4000-8000-000000000104',
        },
        messageChannelId: '00000000-0000-4000-8000-000000000102',
        workspaceId,
      }),
    ).rejects.toThrow('Connected account does not own the message channel');
    expect(saveMessagesAndEnqueueContactCreation).not.toHaveBeenCalled();
  });

  it('persists the public Email Group handle instead of its forwarding address', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const connectedAccount = {
      id: '00000000-0000-4000-8000-000000000103',
      workspaceId,
      handle: 'team@brand.com',
      handleAliases: [],
    } as unknown as ConnectedAccountEntity;
    const saveMessagesAndEnqueueContactCreation = jest.fn().mockResolvedValue({
      messageExternalIdsAndIdsMap: new Map([
        ['<sent@example.com>', 'message-id'],
      ]),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['<sent@example.com>', 'message-thread-id'],
      ]),
    });
    const service = new SentMessagePersistenceService(
      {
        findOneOrFail: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000102',
          workspaceId,
          connectedAccountId: connectedAccount.id,
          handle: 'myah-inbound-123@reply.brand.test',
          type: MessageChannelType.EMAIL_GROUP,
          connectedAccount,
        }),
      } as never,
      { saveMessagesAndEnqueueContactCreation } as never,
    );

    await service.persistSentMessage({
      sendResult: { headerMessageId: '<sent@example.com>' },
      subject: 'Re: Subject',
      body: 'Body',
      recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
      connectedAccount,
      messageChannelId: '00000000-0000-4000-8000-000000000102',
      workspaceId,
    });

    expect(saveMessagesAndEnqueueContactCreation).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({
              role: MessageParticipantRole.FROM,
              handle: 'team@brand.com',
            }),
          ]),
        }),
      ],
      expect.anything(),
      connectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'sent-email:<sent@example.com>' },
      undefined,
    );
  });
});
