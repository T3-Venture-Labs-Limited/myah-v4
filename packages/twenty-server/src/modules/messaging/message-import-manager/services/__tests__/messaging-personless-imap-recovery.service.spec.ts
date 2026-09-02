import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { filterEmails } from 'src/modules/messaging/message-import-manager/utils/filter-emails.util';

import {
  ConnectedAccountProvider,
  MessageChannelContactAutoCreationPolicy,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageFolderImportPolicy,
  MessageFolderPendingSyncAction,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { BlocklistRepository } from 'src/modules/blocklist/repositories/blocklist.repository';
import { EmailAliasManagerService } from 'src/modules/connected-account/email-alias-manager/services/email-alias-manager.service';
import { MessageChannelSyncLockService } from 'src/modules/messaging/common/services/message-channel-sync-lock.service';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { MessagingMessageCleanerService } from 'src/modules/messaging/message-cleaner/services/messaging-message-cleaner.service';
import { SyncMessageFoldersService } from 'src/modules/messaging/message-folder-manager/services/sync-message-folders.service';
import { MessagingCursorService } from 'src/modules/messaging/message-import-manager/services/messaging-cursor.service';
import { MessagingGetMessageListService } from 'src/modules/messaging/message-import-manager/services/messaging-get-message-list.service';
import { MessagingGetMessagesService } from 'src/modules/messaging/message-import-manager/services/messaging-get-messages.service';
import { MessageImportExceptionHandlerService } from 'src/modules/messaging/message-import-manager/services/messaging-import-exception-handler.service';
import { MessagingMessageListFetchJob } from 'src/modules/messaging/message-import-manager/jobs/messaging-message-list-fetch.job';
import { MessagingMessageListFetchService } from 'src/modules/messaging/message-import-manager/services/messaging-message-list-fetch.service';
import { MessagingMessagesImportService } from 'src/modules/messaging/message-import-manager/services/messaging-messages-import.service';
import { MessagingPendingSyncCursorService } from 'src/modules/messaging/message-import-manager/services/messaging-pending-sync-cursor.service';
import { MessagingProcessFolderActionsService } from 'src/modules/messaging/message-import-manager/services/messaging-process-folder-actions.service';
import { MessagingProcessGroupEmailActionsService } from 'src/modules/messaging/message-import-manager/services/messaging-process-group-email-actions.service';
import { MessagingSaveMessagesAndEnqueueContactCreationService } from 'src/modules/messaging/message-import-manager/services/messaging-save-messages-and-enqueue-contact-creation.service';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message';
import {
  getAcknowledgedMessageSyncIdsCacheKey,
  getPendingMessageSyncCursorsCacheKey,
  getPendingMessageSyncGenerationCacheKey,
} from 'src/modules/messaging/message-import-manager/utils/get-message-sync-cache-keys.util';
import { MessagingMonitoringService } from 'src/modules/messaging/monitoring/services/messaging-monitoring.service';

const workspaceId = 'workspace-id';
const messageChannelId = 'message-channel-id';
const mailboxHandle = 'mailbox@example.com';

const folderDefinitions = [
  { externalId: 'INBOX', id: 'inbox-folder-id', name: 'INBOX' },
  { externalId: 'Sent', id: 'sent-folder-id', name: 'Sent' },
  { externalId: 'Drafts', id: 'drafts-folder-id', name: 'Drafts' },
  { externalId: 'Archive', id: 'archive-folder-id', name: 'Archive' },
];

const fullMessageLists = folderDefinitions.map((folder) => ({
  folderId: folder.id,
  messageExternalIds: [`${folder.externalId}:1`],
  messageExternalIdsToDelete: [],
  nextSyncCursor: `${folder.name.toLowerCase()}-next`,
  previousSyncCursor: null,
}));

const externalIds = fullMessageLists.flatMap(
  (messageList) => messageList.messageExternalIds,
);

const buildMessage = (
  externalId: string,
  index: number,
): MessageWithParticipants => ({
  attachments: [],
  direction:
    index === 1 ? MessageDirection.OUTGOING : MessageDirection.INCOMING,
  externalId,
  headerMessageId: `header-${externalId}`,
  isDraft: externalId.startsWith('Drafts:'),
  messageFolderExternalIds: [externalId.split(':')[0]],
  messageThreadExternalId: `thread-${externalId}`,
  participants: [
    {
      displayName: 'Sender',
      handle: externalId.startsWith('Archive:')
        ? 'team@lists.company.com'
        : 'creator@company.com',
      role: MessageParticipantRole.FROM,
    },
    {
      displayName: 'Mailbox',
      handle: mailboxHandle,
      role: MessageParticipantRole.TO,
    },
  ],
  receivedAt: new Date('2026-09-02T10:00:00.000Z'),
  subject: `Subject ${externalId}`,
  text: `Body ${externalId}`,
});

describe('Person-less multi-folder IMAP recovery pipeline', () => {
  it('retries a failed full import, commits four cursors, and avoids duplicate replay work', async () => {
    const loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const candidateMessages = externalIds.map((id, index) =>
      buildMessage(id, index),
    );

    expect(
      filterEmails(mailboxHandle, [], candidateMessages, [], true, false),
    ).toHaveLength(3);
    const values = new Map<string, unknown>();
    const sets = new Map<string, Set<string>>();
    const cache = {
      del: jest.fn().mockImplementation(async (key: string) => {
        values.delete(key);
        sets.delete(key);
      }),
      get: jest.fn().mockImplementation(async (key: string) => values.get(key)),
      getSetLength: jest
        .fn()
        .mockImplementation(async (key: string) => sets.get(key)?.size ?? 0),
      mdel: jest.fn().mockImplementation(async (keys: string[]) => {
        for (const key of keys) {
          values.delete(key);
          sets.delete(key);
        }
      }),
      set: jest.fn().mockImplementation(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      setAdd: jest
        .fn()
        .mockImplementation(async (key: string, ids: string[]) => {
          const set = sets.get(key) ?? new Set<string>();

          for (const id of ids) set.add(id);
          sets.set(key, set);
        }),
      setPop: jest
        .fn()
        .mockImplementation(async (key: string, size: number) => {
          const set = sets.get(key) ?? new Set<string>();
          const popped = [...set].slice(0, size);

          for (const id of popped) set.delete(id);
          sets.set(key, set);

          return popped;
        }),
    };
    let providerLists = fullMessageLists;
    let savedAssociations: string[] = [];
    let successfulSaveCount = 0;
    const associationRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockImplementation(async () =>
        savedAssociations.length > 0
          ? {
              id: 'association-0',
              messageExternalId: savedAssociations[0],
            }
          : null,
      ),
      find: jest.fn().mockImplementation(async () =>
        savedAssociations.map((messageExternalId, index) => ({
          id: `association-${index}`,
          messageExternalId,
        })),
      ),
    };
    const updateCursor = jest.fn().mockResolvedValue(undefined);
    const saveMessages = jest
      .fn()
      .mockRejectedValueOnce(new Error('simulated first import failure'))
      .mockImplementation(async (messages: MessageWithParticipants[]) => {
        successfulSaveCount += 1;
        savedAssociations = messages.map((message) => message.externalId);

        return undefined;
      });
    const connectedAccount = {
      handle: mailboxHandle,
      handleAliases: [],
      id: 'connected-account-id',
      provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
      userWorkspaceId: 'user-workspace-id',
    } as unknown as ConnectedAccountEntity;
    const messageChannel = {
      connectedAccount,
      connectedAccountId: connectedAccount.id,
      contactAutoCreationPolicy: MessageChannelContactAutoCreationPolicy.NONE,
      excludeGroupEmails: true,
      excludeNonProfessionalEmails: true,
      handle: mailboxHandle,
      id: messageChannelId,
      isContactAutoCreationEnabled: true,
      messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
      messageFolders: folderDefinitions.map((folder) => ({
        ...folder,
        isSynced: true,
        messageChannelId,
        pendingSyncAction: MessageFolderPendingSyncAction.NONE,
        syncCursor: null,
      })),
      pendingGroupEmailsAction: MessageChannelPendingGroupEmailsAction.NONE,
      syncCursor: '',
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
    } as MessageChannelEntity;
    const messageChannelRepository = {
      findOne: jest.fn().mockResolvedValue(messageChannel),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const messageChannelSyncStatusService = {
      markAsMessageSyncCompleted: jest.fn().mockResolvedValue(undefined),
      markAsMessagesImportOngoing: jest.fn().mockResolvedValue(undefined),
      markAsMessagesImportPending: jest.fn().mockResolvedValue(undefined),
      markAsMessagesImportScheduled: jest.fn().mockResolvedValue(undefined),
      markAsMessagesListFetchOngoing: jest.fn().mockResolvedValue(undefined),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation((callback: () => unknown) => callback()),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        hasMetadata: jest.fn().mockImplementation((name) => name !== 'person'),
        manager: {},
      }),
      getRepository: jest
        .fn()
        .mockImplementation(async (_workspaceId: string, name: string) => {
          if (name === 'messageChannelMessageAssociation') {
            return associationRepository;
          }
          if (name === 'workspaceMember') {
            return {
              findOne: jest
                .fn()
                .mockResolvedValue({ id: 'workspace-member-id' }),
            };
          }
          throw new Error(`Unexpected repository ${name}`);
        }),
    };
    const handleDriverException = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingMessageListFetchService,
        MessagingMessageListFetchJob,
        MessagingMessagesImportService,
        MessagingPendingSyncCursorService,
        {
          provide: MessageChannelSyncLockService,
          useValue: {
            withLock: jest
              .fn()
              .mockImplementation(
                async (_scope: unknown, operation: () => Promise<unknown>) =>
                  operation(),
              ),
          },
        },
        {
          provide: CacheStorageNamespace.ModuleMessaging,
          useValue: cache,
        },
        {
          provide: MessageChannelSyncStatusService,
          useValue: messageChannelSyncStatusService,
        },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: globalWorkspaceOrmManager,
        },
        {
          provide: getRepositoryToken(MessageChannelEntity),
          useValue: messageChannelRepository,
        },
        {
          provide: MessagingGetMessageListService,
          useValue: {
            getMessageLists: jest
              .fn()
              .mockImplementation(async () => providerLists),
          },
        },
        {
          provide: MessagingGetMessagesService,
          useValue: {
            getMessages: jest
              .fn()
              .mockImplementation(async (ids: string[]) =>
                ids.map((id, index) => buildMessage(id, index)),
              ),
          },
        },
        {
          provide: MessagingSaveMessagesAndEnqueueContactCreationService,
          useValue: { saveMessagesAndEnqueueContactCreation: saveMessages },
        },
        {
          provide: MessagingCursorService,
          useValue: { updateCursor },
        },
        {
          provide: MessageImportExceptionHandlerService,
          useValue: { handleDriverException },
        },
        {
          provide: MessagingMessageCleanerService,
          useValue: {
            deleteMessagesChannelMessageAssociationsAndRelatedOrphans: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: SyncMessageFoldersService,
          useValue: {
            syncMessageFolders: jest
              .fn()
              .mockResolvedValue(messageChannel.messageFolders),
          },
        },
        {
          provide: MessagingProcessGroupEmailActionsService,
          useValue: { processGroupEmailActions: jest.fn() },
        },
        {
          provide: MessagingProcessFolderActionsService,
          useValue: { processFolderActions: jest.fn() },
        },
        {
          provide: MessagingMonitoringService,
          useValue: { track: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: BlocklistRepository,
          useValue: { getByWorkspaceMemberId: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: 'BlocklistRepository',
          useValue: { getByWorkspaceMemberId: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: EmailAliasManagerService,
          useValue: { refreshHandleAliases: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ userId: 'user-id' }),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue({ isInternalMessagesImportEnabled: false }),
          },
        },
        {
          provide: TwentyConfigService,
          useValue: { get: jest.fn().mockReturnValue(400) },
        },
      ],
    }).compile();
    const listFetchJob = await module.resolve(MessagingMessageListFetchJob);

    await listFetchJob.handle({ messageChannelId, workspaceId });

    expect(updateCursor).not.toHaveBeenCalled();
    expect(handleDriverException).toHaveBeenCalledTimes(1);
    expect(handleDriverException.mock.calls[0][0]).toEqual(
      new Error('simulated first import failure'),
    );
    const firstGeneration = values.get(
      getPendingMessageSyncGenerationCacheKey({
        messageChannelId,
        workspaceId,
      }),
    ) as string;
    const firstState = values.get(
      getPendingMessageSyncCursorsCacheKey({
        generationId: firstGeneration,
        messageChannelId,
        workspaceId,
      }),
    ) as { expectedMessageExternalIds: string[] };
    expect(firstState.expectedMessageExternalIds).toEqual(externalIds);
    expect(
      sets.get(
        getAcknowledgedMessageSyncIdsCacheKey({
          generationId: firstGeneration,
          messageChannelId,
          workspaceId,
        }),
      )?.size ?? 0,
    ).toBe(0);

    await listFetchJob.handle({ messageChannelId, workspaceId });

    expect(saveMessages).toHaveBeenCalledTimes(2);
    expect(successfulSaveCount).toBe(1);
    expect(updateCursor).toHaveBeenCalledTimes(4);
    expect(savedAssociations).toHaveLength(3);
    expect(new Set(savedAssociations).size).toBe(3);

    const importInvocationCount = saveMessages.mock.calls.length;
    await listFetchJob.handle({ messageChannelId, workspaceId });

    expect(saveMessages).toHaveBeenCalledTimes(importInvocationCount);
    expect(savedAssociations).toHaveLength(3);
    expect(new Set(savedAssociations).size).toBe(3);
    loggerErrorSpy.mockRestore();
  });
});
