import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  FieldActorSource,
  MessageChannelContactAutoCreationPolicy,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { CreateCompanyAndContactJob } from 'src/modules/contact-creation-manager/jobs/create-company-and-contact.job';
import { CAMPAIGN_REPLY_EVIDENCE_PORT } from 'src/modules/campaign-execution/constants/campaign-execution-di-tokens';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { MessagingMessageFolderAssociationService } from 'src/modules/messaging/message-import-manager/services/messaging-message-folder-association.service';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';
import { MessagingEmailBaselineService } from 'src/modules/messaging/message-import-manager/services/messaging-email-baseline.service';
import { CampaignEmailInboundHeldWorkService } from 'src/modules/campaign-partnership/services/campaign-email-inbound-held-work.service';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message';
import { MessagingMessageParticipantService } from 'src/modules/messaging/message-participant-manager/services/messaging-message-participant.service';

describe('MessagingSaveMessagesAndEnqueueContactCreationService', () => {
  let service: MessagingSaveMessagesAndEnqueueContactCreationService;
  let messageQueueService: MessageQueueService;
  let messageService: MessagingMessageService;
  let messageParticipantService: MessagingMessageParticipantService;
  let campaignReplyEvidencePort: {
    reconcileInboundMessageInTransaction: jest.Mock;
  };
  let triageService: MyahInboxContactTriageService;
  let receiptService: MyahInboxContactTriageReceiptService;

  let datasourceInstance: { transaction: jest.Mock };
  let transactionManager: Record<string, never>;
  let commitTransaction: jest.Mock;
  let rollbackTransaction: jest.Mock;
  let baselineReceipt: jest.Mock;
  let verifyLiveReceipt: jest.Mock;
  let heldWork: jest.Mock;

  const workspaceId = '00000000-0000-4000-8000-000000000001';

  const mockConnectedAccount: ConnectedAccountEntity = {
    id: 'connected-account-id',
    handle: 'test@example.com',
    handleAliases: ['alias1@example.com', 'alias2@example.com'],
  } as ConnectedAccountEntity;

  const mockMessageChannel: MessageChannelEntity = {
    id: 'message-channel-id',
    isContactAutoCreationEnabled: true,
    contactAutoCreationPolicy:
      MessageChannelContactAutoCreationPolicy.SENT_AND_RECEIVED,
    excludeNonProfessionalEmails: true,
    excludeGroupEmails: true,
  } as MessageChannelEntity;

  const mockMessages: MessageWithParticipants[] = [
    {
      externalId: 'message-1',
      headerMessageId: 'header-message-id-1',
      subject: 'Test Subject 1',
      text: 'Test content 1',
      receivedAt: new Date(),
      attachments: [],
      isDraft: false,
      messageThreadExternalId: 'thread-1',
      direction: MessageDirection.OUTGOING,
      participants: [
        {
          role: MessageParticipantRole.FROM,
          handle: 'test@example.com',
          displayName: 'Test User',
        },
        {
          role: MessageParticipantRole.TO,
          handle: 'contact@company.com',
          displayName: 'Contact',
        },
      ],
    },
    {
      externalId: 'message-2',
      headerMessageId: 'header-message-id-2',
      subject: 'Test Subject 2',
      text: 'Test content 2',
      receivedAt: new Date(),
      attachments: [],
      isDraft: false,
      messageThreadExternalId: 'thread-1',
      direction: MessageDirection.INCOMING,
      participants: [
        {
          role: MessageParticipantRole.FROM,
          handle: 'contact@company.com',
          displayName: 'Contact',
        },
        {
          role: MessageParticipantRole.TO,
          handle: 'test@example.com',
          displayName: 'Test User',
        },
        {
          role: MessageParticipantRole.TO,
          handle: 'personal@gmail.com',
          displayName: 'Personal',
        },
        {
          role: MessageParticipantRole.TO,
          handle: 'team@lists.company.com',
          displayName: 'Group email',
        },
      ],
    },
  ];

  beforeEach(async () => {
    transactionManager = {};
    commitTransaction = jest.fn();
    rollbackTransaction = jest.fn();
    baselineReceipt = jest.fn();
    verifyLiveReceipt = jest.fn().mockResolvedValue(new Set());
    heldWork = jest.fn().mockResolvedValue('HELD');
    campaignReplyEvidencePort = {
      reconcileInboundMessageInTransaction: jest.fn(),
    };
    datasourceInstance = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        try {
          const result = await callback(transactionManager);

          commitTransaction();
          return result;
        } catch (error) {
          rollbackTransaction();
          throw error;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingSaveMessagesAndEnqueueContactCreationService,
        {
          provide: MessagingEmailBaselineService,
          useValue: {
            recordDispositionsInTransaction: (...args: unknown[]) =>
              baselineReceipt(...args),
            verifyLiveInTransaction: (...args: unknown[]) =>
              verifyLiveReceipt(...args),
          },
        },
        {
          provide: CampaignEmailInboundHeldWorkService,
          useValue: {
            recordInTransaction: (...args: unknown[]) => heldWork(...args),
          },
        },
        {
          provide: MessageQueueService,
          useValue: {
            add: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getQueueToken(MessageQueue.contactCreationQueue),
          useValue: {
            add: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(ObjectMetadataEntity),
          useValue: {
            findOneOrFail: jest.fn(),
          },
        },
        {
          provide: MessagingMessageService,
          useValue: {
            saveMessagesWithinTransaction: jest.fn().mockResolvedValue({
              messageExternalIdsAndIdsMap: new Map([
                ['message-1', 'db-message-id-1'],
                ['message-2', 'db-message-id-2'],
              ]),
              messageExternalIdToMessageThreadIdMap: new Map([
                ['message-1', 'db-thread-id-1'],
                ['message-2', 'db-thread-id-1'],
              ]),
              messageExternalIdToPersistenceInfoMap: new Map([
                [
                  'message-1',
                  {
                    createdAt: '2026-09-15T10:00:00.000Z',
                    direction: MessageDirection.OUTGOING,
                    wasInserted: true,
                    messageThreadId: 'db-thread-id-1',
                  },
                ],
                [
                  'message-2',
                  {
                    createdAt: '2026-09-15T10:00:01.000Z',
                    direction: MessageDirection.INCOMING,
                    wasInserted: true,
                    messageThreadId: 'db-thread-id-1',
                  },
                ],
              ]),
              createdMessages: [
                { id: 'db-message-id-1' },
                { id: 'db-message-id-2' },
              ],
            }),
          },
        },
        {
          provide: CAMPAIGN_REPLY_EVIDENCE_PORT,
          useValue: campaignReplyEvidencePort,
        },
        {
          provide: MessagingMessageParticipantService,
          useValue: {
            saveMessageParticipants: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MessagingMessageFolderAssociationService,
          useValue: {
            saveMessageFolderAssociations: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: MyahInboxContactTriageService,
          useValue: {
            lockIdentityKeysInTransaction: jest
              .fn()
              .mockResolvedValue(undefined),
            ensureSourceContactInTransaction: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: MyahInboxContactTriageReceiptService,
          useValue: {
            isTriageSchemaProvisioned: jest.fn().mockResolvedValue(true),
            lockMigrationMarkerForSourcePersistenceInTransaction: jest
              .fn()
              .mockResolvedValue(true),
            recordInTransaction: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getGlobalWorkspaceDataSource: jest
              .fn()
              .mockResolvedValue(datasourceInstance),
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((fn: () => any, _authContext?: any) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get<MessagingSaveMessagesAndEnqueueContactCreationService>(
      MessagingSaveMessagesAndEnqueueContactCreationService,
    );
    messageQueueService = module.get<MessageQueueService>(
      getQueueToken(MessageQueue.contactCreationQueue),
    );
    messageService = module.get<MessagingMessageService>(
      MessagingMessageService,
    );
    messageParticipantService = module.get<MessagingMessageParticipantService>(
      MessagingMessageParticipantService,
    );
    triageService = module.get(MyahInboxContactTriageService);
    receiptService = module.get(MyahInboxContactTriageReceiptService);
  });

  it('records only a verified per-ID inbound in the canonical transaction, not Inbox LIVE mode', async () => {
    Object.assign(transactionManager, {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    });
    verifyLiveReceipt.mockResolvedValueOnce(new Set(['message-2']));
    const incoming = {
      ...mockMessages[1],
      providerOccurredAt: '2026-09-28T12:00:00Z',
    };
    await service.saveMessagesAndEnqueueContactCreation(
      [incoming],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      {
        mode: 'BACKFILL',
        generationId: 'inbox-only',
        liveBaselineGenerationId: 'ready-id',
        liveMessageExternalIds: ['message-2'],
      },
    );
    expect(heldWork).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'ready-id',
        providerMessageId: 'message-2',
        from: 'contact@company.com',
        to: 'test@example.com',
        messageId: 'db-message-id-2',
      }),
      transactionManager,
    );
    expect(commitTransaction).toHaveBeenCalledTimes(1);
    expect(messageQueueService.add).not.toHaveBeenCalledWith(
      'CampaignReplyJob',
      expect.anything(),
    );
    heldWork.mockClear();
    await service.saveMessagesAndEnqueueContactCreation(
      [incoming],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'inbox-only' },
    );
    expect(heldWork).not.toHaveBeenCalled();
  });

  it('rolls back canonical import if verified HELD persistence fails', async () => {
    Object.assign(transactionManager, {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    });
    verifyLiveReceipt.mockResolvedValueOnce(new Set(['message-2']));
    heldWork.mockRejectedValueOnce(new Error('held receipt unavailable'));
    await expect(
      service.saveMessagesAndEnqueueContactCreation(
        [{ ...mockMessages[1], providerOccurredAt: '2026-09-28T12:00:00Z' }],
        mockMessageChannel,
        mockConnectedAccount,
        workspaceId,
        {
          mode: 'LIVE',
          generationId: 'inbox-only',
          liveBaselineGenerationId: 'ready-id',
          liveMessageExternalIds: ['message-2'],
        },
      ),
    ).rejects.toThrow('held receipt unavailable');
    expect(rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(commitTransaction).not.toHaveBeenCalled();
  });

  it('records listed imported, filtered and missing IDs with canonical participants before commit; receipt failure rolls back', async () => {
    Object.assign(transactionManager, {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    });
    const source = {
      mode: 'BACKFILL' as const,
      generationId: 'polling',
      baselineGenerationId: 'baseline',
      listedIds: ['message-1', 'message-2', 'filtered', 'missing'],
      excludedIds: ['filtered'],
    };
    await service.saveMessagesAndEnqueueContactCreation(
      mockMessages,
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      source,
    );
    expect(baselineReceipt).toHaveBeenCalledWith(transactionManager, {
      generationId: 'baseline',
      workspaceId,
      messageChannelId: mockMessageChannel.id,
      connectedAccountId: mockConnectedAccount.id,
      listedIds: source.listedIds,
      importedIds: ['message-1', 'message-2'],
      excludedIds: ['filtered'],
    });
    expect(
      (messageParticipantService.saveMessageParticipants as jest.Mock).mock
        .invocationCallOrder[0],
    ).toBeLessThan(baselineReceipt.mock.invocationCallOrder[0]);
    expect(baselineReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      commitTransaction.mock.invocationCallOrder[0],
    );
    baselineReceipt.mockRejectedValueOnce(new Error('disposition failed'));
    await expect(
      service.saveMessagesAndEnqueueContactCreation(
        mockMessages,
        mockMessageChannel,
        mockConnectedAccount,
        workspaceId,
        source,
      ),
    ).rejects.toThrow('disposition failed');
    expect(rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rechecks READY under the canonical transaction lock before marking an inbound receipt LIVE', async () => {
    Object.assign(transactionManager, {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    });
    const source = {
      mode: 'BACKFILL' as const,
      generationId: 'polling',
      liveBaselineGenerationId: 'ready-generation',
      liveMessageExternalIds: ['message-2'],
    };
    await service.saveMessagesAndEnqueueContactCreation(
      mockMessages,
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      source,
    );
    expect(verifyLiveReceipt).toHaveBeenCalledWith(
      transactionManager,
      workspaceId,
      mockMessageChannel,
      'ready-generation',
      ['message-2'],
    );
    expect(
      (receiptService.recordInTransaction as jest.Mock).mock.calls.find(
        ([input]) => input.direction === 'INBOUND',
      )?.[0].mode,
    ).toBe('BACKFILL');
    verifyLiveReceipt.mockResolvedValue(new Set(['message-2']));
    await service.saveMessagesAndEnqueueContactCreation(
      mockMessages,
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      source,
    );
    expect(
      (receiptService.recordInTransaction as jest.Mock).mock.calls
        .filter(([input]) => input.direction === 'INBOUND')
        .slice(-1)[0]?.[0].mode,
    ).toBe('LIVE');
  });

  it('should save messages and enqueue contact creation', async () => {
    const result = await service.saveMessagesAndEnqueueContactCreation(
      mockMessages,
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
    );

    expect(messageService.saveMessagesWithinTransaction).toHaveBeenCalledWith(
      mockMessages,
      mockMessageChannel.id,
      expect.any(Object),
      workspaceId,
    );

    expect(
      messageParticipantService.saveMessageParticipants,
    ).toHaveBeenCalled();
    expect(messageQueueService.add).toHaveBeenCalled();

    expect(result?.messageExternalIdsAndIdsMap.get('message-1')).toBe(
      'db-message-id-1',
    );
    expect(result?.messageExternalIdToMessageThreadIdMap.get('message-1')).toBe(
      'db-thread-id-1',
    );
  });

  it('awaits ordinary incoming Campaign reconciliation before committing the import', async () => {
    let reconciliationAwaited = false;

    campaignReplyEvidencePort.reconcileInboundMessageInTransaction.mockImplementation(
      () => ({
        then: (resolve: () => void) => {
          expect(commitTransaction).not.toHaveBeenCalled();
          reconciliationAwaited = true;
          resolve();
        },
      }),
    );

    await expect(
      service.saveMessagesAndEnqueueContactCreation(
        [mockMessages[1]],
        mockMessageChannel,
        mockConnectedAccount,
        workspaceId,
      ),
    ).resolves.toEqual({
      messageExternalIdsAndIdsMap: expect.any(Map),
      messageExternalIdToMessageThreadIdMap: expect.any(Map),
      // Contact-wide triage adds durable persistence info and the contact
      // creation candidates to this result contract.
      messageExternalIdToPersistenceInfoMap: expect.any(Map),
      contactsToCreate: expect.any(Array),
    });
    expect(reconciliationAwaited).toBe(true);
    expect(
      campaignReplyEvidencePort.reconcileInboundMessageInTransaction,
    ).toHaveBeenCalledWith(
      {
        workspaceId,
        messageChannelId: mockMessageChannel.id,
        threadExternalId: mockMessages[1].messageThreadExternalId,
        fromHandle: 'contact@company.com',
        inboundEvidenceId: 'db-message-id-2',
      },
      transactionManager,
    );
    expect(commitTransaction).toHaveBeenCalledTimes(1);
    expect(rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rolls back the import when Campaign reconciliation rejects', async () => {
    const reconciliationError = new Error('reconciliation failed');

    campaignReplyEvidencePort.reconcileInboundMessageInTransaction.mockRejectedValue(
      reconciliationError,
    );

    await expect(
      service.saveMessagesAndEnqueueContactCreation(
        [mockMessages[1]],
        mockMessageChannel,
        mockConnectedAccount,
        workspaceId,
      ),
    ).rejects.toBe(reconciliationError);
    expect(rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(commitTransaction).not.toHaveBeenCalled();
    expect(messageQueueService.add).not.toHaveBeenCalled();
  });

  it('takes the migration marker before source persistence', async () => {
    const transactionManager = {
      internalContext: { workspaceId },
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    } as never;

    await service.saveMessagesAndEnqueueContactCreation(
      [mockMessages[0]],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'sent-email:message-1' },
      transactionManager,
    );

    expect(
      receiptService.lockMigrationMarkerForSourcePersistenceInTransaction,
    ).toHaveBeenCalledWith(transactionManager);
    expect(
      (
        receiptService.lockMigrationMarkerForSourcePersistenceInTransaction as jest.Mock
      ).mock.invocationCallOrder[0],
    ).toBeLessThan(
      (messageService.saveMessagesWithinTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('requests source locking inside message persistence before receipt recording', async () => {
    const transactionManager = {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    } as never;

    await service.saveMessagesAndEnqueueContactCreation(
      [mockMessages[0]],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'sent-email:message-1' },
      transactionManager,
    );

    expect(messageService.saveMessagesWithinTransaction).toHaveBeenCalledWith(
      [mockMessages[0]],
      mockMessageChannel.id,
      transactionManager,
      workspaceId,
      true,
    );
    expect(
      (messageService.saveMessagesWithinTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      (receiptService.recordInTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('persists messages without triage when the private triage schema is absent', async () => {
    (
      receiptService.lockMigrationMarkerForSourcePersistenceInTransaction as jest.Mock
    ).mockResolvedValueOnce(false);
    const transactionManager = {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    } as never;

    await service.saveMessagesAndEnqueueContactCreation(
      [mockMessages[0]],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'generation' },
      transactionManager,
    );

    // The batch still persists: without the private relations a triage write
    // would abort the whole import transaction.
    expect(messageService.saveMessagesWithinTransaction).toHaveBeenCalledWith(
      [mockMessages[0]],
      mockMessageChannel.id,
      transactionManager,
      workspaceId,
    );
    expect(receiptService.recordInTransaction).not.toHaveBeenCalled();
    expect(
      triageService.ensureSourceContactInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('records first-persistence receipts after the source-locked save returns', async () => {
    (
      messageService.saveMessagesWithinTransaction as jest.Mock
    ).mockResolvedValueOnce({
      messageExternalIdsAndIdsMap: new Map([
        ['message-1', 'db-message-id-1'],
        ['message-2', 'db-message-id-2'],
      ]),
      messageExternalIdToMessageChannelMessageAssociationIdMap: new Map(),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['message-1', 'db-thread-id-1'],
        ['message-2', 'db-thread-id-1'],
      ]),
      messageExternalIdToPersistenceInfoMap: new Map([
        [
          'message-1',
          {
            createdAt: '2026-09-15T10:00:00.000Z',
            direction: 'UNKNOWN',
            wasInserted: false,
            messageThreadId: 'db-thread-id-1',
          },
        ],
        [
          'message-2',
          {
            createdAt: '2026-09-15T10:00:01.000Z',
            direction: MessageDirection.INCOMING,
            wasInserted: true,
            messageThreadId: 'db-thread-id-1',
          },
        ],
      ]),
      createdMessages: [],
    });
    const transactionManager = {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    } as never;

    await service.saveMessagesAndEnqueueContactCreation(
      mockMessages,
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'generation' },
      transactionManager,
    );

    expect(receiptService.recordInTransaction).toHaveBeenCalledTimes(1);
    expect(
      (messageService.saveMessagesWithinTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      (receiptService.recordInTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('initializes a tuple and records a first outbound receipt in the sent source transaction', async () => {
    const transactionManager = {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    } as never;

    await service.saveMessagesAndEnqueueContactCreation(
      [mockMessages[0]],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'sent-email:message-1' },
      transactionManager,
    );

    expect(triageService.lockIdentityKeysInTransaction).toHaveBeenCalledWith({
      identityKeys: ['email-thread:db-thread-id-1'],
      manager: transactionManager,
    });
    expect(triageService.ensureSourceContactInTransaction).toHaveBeenCalledWith(
      {
        workspaceId,
        sourceType: 'EMAIL_THREAD',
        sourceRecordId: 'db-thread-id-1',
        initialDirection: 'OUTBOUND',
        manager: transactionManager,
      },
    );
    expect(receiptService.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        firstPersistence: true,
        mode: 'LIVE',
        persistedMessageId: 'db-message-id-1',
        sourceGenerationId: 'sent-email:message-1',
        sourceRecordId: 'db-thread-id-1',
      }),
      transactionManager,
    );
    expect(
      (receiptService.recordInTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      (triageService.lockIdentityKeysInTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    );
    expect(
      (triageService.lockIdentityKeysInTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      (triageService.ensureSourceContactInTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('records replayed Email evidence for provenance without marking it as first persistence', async () => {
    (
      messageService.saveMessagesWithinTransaction as jest.Mock
    ).mockResolvedValueOnce({
      messageExternalIdsAndIdsMap: new Map([['message-1', 'db-message-id-1']]),
      messageExternalIdToMessageChannelMessageAssociationIdMap: new Map(),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['message-1', 'db-thread-id-1'],
      ]),
      messageExternalIdToPersistenceInfoMap: new Map([
        [
          'message-1',
          {
            createdAt: '2026-09-15T10:00:00.000Z',
            direction: MessageDirection.OUTGOING,
            wasInserted: false,
            messageThreadId: 'db-thread-id-1',
          },
        ],
      ]),
      createdMessages: [],
    });
    const transactionManager = {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    } as never;

    await service.saveMessagesAndEnqueueContactCreation(
      [mockMessages[0]],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'sent-email:message-1' },
      transactionManager,
    );

    expect(receiptService.recordInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        persistedMessageId: 'db-message-id-1',
        firstPersistence: false,
      }),
      transactionManager,
    );
    expect(
      (messageService.saveMessagesWithinTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      (receiptService.recordInTransaction as jest.Mock).mock
        .invocationCallOrder[0],
    );
  });

  it('initializes a source contact without recording unknown-direction evidence', async () => {
    (
      messageService.saveMessagesWithinTransaction as jest.Mock
    ).mockResolvedValueOnce({
      messageExternalIdsAndIdsMap: new Map([['message-1', 'db-message-id-1']]),
      messageExternalIdToMessageChannelMessageAssociationIdMap: new Map(),
      messageExternalIdToMessageThreadIdMap: new Map([
        ['message-1', 'db-thread-id-1'],
      ]),
      messageExternalIdToPersistenceInfoMap: new Map([
        [
          'message-1',
          {
            createdAt: '2026-09-15T10:00:00.000Z',
            direction: 'UNKNOWN',
            wasInserted: false,
            messageThreadId: 'db-thread-id-1',
          },
        ],
      ]),
      createdMessages: [],
    });
    const transactionManager = {
      queryRunner: { query: jest.fn().mockResolvedValue([]) },
    } as never;

    await service.saveMessagesAndEnqueueContactCreation(
      [mockMessages[0]],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
      { mode: 'LIVE', generationId: 'sent-email:message-1' },
      transactionManager,
    );

    expect(triageService.ensureSourceContactInTransaction).toHaveBeenCalled();
    expect(receiptService.recordInTransaction).not.toHaveBeenCalled();
  });

  it('should not enqueue contact creation when it is disabled', async () => {
    await service.saveMessagesAndEnqueueContactCreation(
      mockMessages,
      {
        ...mockMessageChannel,
        isContactAutoCreationEnabled: false,
      },
      mockConnectedAccount,
      workspaceId,
    );

    expect(messageService.saveMessagesWithinTransaction).toHaveBeenCalled();
    expect(messageQueueService.add).not.toHaveBeenCalled();
  });

  it('should create external contacts', async () => {
    await service.saveMessagesAndEnqueueContactCreation(
      [
        {
          ...mockMessages[1],
          participants: [
            {
              role: MessageParticipantRole.FROM,
              handle: 'tim@apple.com',
              displayName: 'participant email',
            },
          ],
        },
      ],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
    );

    expect(messageQueueService.add).toHaveBeenCalledWith(
      CreateCompanyAndContactJob.name,
      {
        workspaceId,
        connectedAccount: mockConnectedAccount,
        source: FieldActorSource.EMAIL,
        contactsToCreate: [
          {
            handle: 'tim@apple.com',
            displayName: 'participant email',
            role: MessageParticipantRole.FROM,
            shouldCreateContact: true,
            messageId: 'db-message-id-2',
          },
        ],
      },
    );
  });

  it('should not create personal emails contacts', async () => {
    await service.saveMessagesAndEnqueueContactCreation(
      [
        {
          ...mockMessages[0],
          participants: [
            {
              role: MessageParticipantRole.FROM,
              handle: 'test@gmail.com',
              displayName: 'participant personal email',
            },
          ],
        },
      ],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
    );

    expect(messageQueueService.add).toHaveBeenCalledWith(
      CreateCompanyAndContactJob.name,
      {
        workspaceId,
        connectedAccount: mockConnectedAccount,
        source: FieldActorSource.EMAIL,
        contactsToCreate: [],
      },
    );
  });
  it('should not create contact if the participant is the connected account', async () => {
    const mockMessagesWithConnectedAccount = [
      {
        ...mockMessages[0],
        participants: [
          {
            role: MessageParticipantRole.FROM,
            handle: 'connected@account.com',
            displayName: 'participant that is the Connected Account',
          },
        ],
      },
    ];

    await service.saveMessagesAndEnqueueContactCreation(
      mockMessagesWithConnectedAccount,
      mockMessageChannel,
      {
        ...mockConnectedAccount,
        handle: 'connected@account.com',
      },
      workspaceId,
    );

    expect(messageQueueService.add).toHaveBeenCalledWith(
      CreateCompanyAndContactJob.name,
      {
        workspaceId,
        connectedAccount: {
          ...mockConnectedAccount,
          handle: 'connected@account.com',
        },
        source: FieldActorSource.EMAIL,
        contactsToCreate: [],
      },
    );
  });

  it('should not create contacts for unsent drafts', async () => {
    await service.saveMessagesAndEnqueueContactCreation(
      [
        {
          ...mockMessages[0],
          isDraft: true,
          participants: [
            {
              role: MessageParticipantRole.FROM,
              handle: 'test@example.com',
              displayName: 'Test User',
            },
            {
              role: MessageParticipantRole.TO,
              handle: 'prospect@company.com',
              displayName: 'Prospect',
            },
          ],
        },
      ],
      mockMessageChannel,
      mockConnectedAccount,
      workspaceId,
    );

    expect(messageQueueService.add).toHaveBeenCalledWith(
      CreateCompanyAndContactJob.name,
      {
        workspaceId,
        connectedAccount: mockConnectedAccount,
        source: FieldActorSource.EMAIL,
        contactsToCreate: [],
      },
    );
  });
});
