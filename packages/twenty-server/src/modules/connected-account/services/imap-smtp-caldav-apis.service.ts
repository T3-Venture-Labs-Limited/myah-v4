import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  CalendarChannelSyncStage,
  ConnectedAccountProvider,
  MessageChannelSyncStage,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { v4 } from 'uuid';

import { CreateCalendarChannelService } from 'src/engine/core-modules/auth/services/create-calendar-channel.service';
import { CreateMessageChannelService } from 'src/engine/core-modules/auth/services/create-message-channel.service';
import { NotFoundError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type PlaintextImapSmtpCaldavParams } from 'src/engine/core-modules/imap-smtp-caldav-connection/types/imap-smtp-caldav-connection.type';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import {
  CalendarEventListFetchJob,
  type CalendarEventListFetchJobData,
} from 'src/modules/calendar/calendar-event-import-manager/jobs/calendar-event-list-fetch.job';
import { CalendarChannelSyncStatusService } from 'src/modules/calendar/common/services/calendar-channel-sync-status.service';
import { WorkspaceSharedConnectedAccountConflictError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-conflict.error';
import { WorkspaceSharedConnectedAccountNotFoundError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-not-found.error';
import { AccountsToReconnectService } from 'src/modules/connected-account/services/accounts-to-reconnect.service';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import { SyncMessageFoldersService } from 'src/modules/messaging/message-folder-manager/services/sync-message-folders.service';
import {
  MessagingMessageListFetchJob,
  type MessagingMessageListFetchJobData,
} from 'src/modules/messaging/message-import-manager/jobs/messaging-message-list-fetch.job';

export type UpsertConnectedAccountInput = {
  handle: string;
  userWorkspaceId: string;
  workspaceId: string;
  // Caller has already validated the input through `ImapSmtpCaldavService`,
  // which produces plaintext passwords for immediate encryption.
  connectionParameters: PlaintextImapSmtpCaldavParams;
  existingAccount?: ConnectedAccountEntity | null;
  name?: string;
  visibility?: ConnectedAccountEntity['visibility'];
};

export type UpsertConnectedAccountResult = {
  connectedAccountId: string;
  messageChannelId: string | null;
};

@Injectable()
export class ImapSmtpCalDavAPIService {
  private readonly logger = new Logger(ImapSmtpCalDavAPIService.name);

  constructor(
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly messageQueueService: MessageQueueService,
    @InjectMessageQueue(MessageQueue.calendarQueue)
    private readonly calendarQueueService: MessageQueueService,
    private readonly createMessageChannelService: CreateMessageChannelService,
    private readonly createCalendarChannelService: CreateCalendarChannelService,
    private readonly syncMessageFoldersService: SyncMessageFoldersService,
    private readonly accountsToReconnectService: AccountsToReconnectService,
    private readonly messagingChannelSyncStatusService: MessageChannelSyncStatusService,
    private readonly calendarChannelSyncStatusService: CalendarChannelSyncStatusService,
    private readonly connectedAccountTokenEncryptionService: ConnectedAccountTokenEncryptionService,
  ) {}

  async upsertConnectedAccount(
    input: UpsertConnectedAccountInput,
  ): Promise<UpsertConnectedAccountResult> {
    const { handle, workspaceId, userWorkspaceId, visibility = 'user' } = input;

    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { id: userWorkspaceId, workspaceId },
    });

    if (!isDefined(userWorkspace)) {
      throw new NotFoundError(
        `UserWorkspace with id ${userWorkspaceId} not found in workspace ${workspaceId}`,
      );
    }

    if (
      input.existingAccount?.visibility === 'workspace' &&
      visibility !== 'workspace'
    ) {
      throw new WorkspaceSharedConnectedAccountConflictError();
    }

    const userScopedExistingAccount =
      visibility === 'user'
        ? (input.existingAccount ??
          (await this.connectedAccountRepository.findOne({
            where: { handle, userWorkspaceId, visibility: 'user', workspaceId },
          })))
        : null;
    const userScopedExistingMessageChannel = userScopedExistingAccount
      ? await this.messageChannelRepository.findOne({
          where: {
            connectedAccountId: userScopedExistingAccount.id,
            workspaceId,
          },
        })
      : null;
    const userScopedExistingCalendarChannel = userScopedExistingAccount
      ? await this.calendarChannelRepository.findOne({
          where: {
            connectedAccountId: userScopedExistingAccount.id,
            workspaceId,
          },
        })
      : null;

    const transactionResult =
      await this.connectedAccountRepository.manager.transaction(
        async (transactionManager: EntityManager) => {
          const connectedAccountRepository = transactionManager.getRepository(
            ConnectedAccountEntity,
          );
          const messageChannelRepository =
            transactionManager.getRepository(MessageChannelEntity);
          const calendarChannelRepository = transactionManager.getRepository(
            CalendarChannelEntity,
          );
          let existingAccount = userScopedExistingAccount;

          if (visibility === 'workspace') {
            await transactionManager.query(
              'SELECT pg_advisory_xact_lock(hashtext($1))',
              [`workspace-shared-imap-smtp:${workspaceId}`],
            );
            existingAccount = await connectedAccountRepository.findOne({
              lock: { mode: 'pessimistic_write' },
              where: {
                ...(isDefined(input.name)
                  ? { archivedAt: IsNull(), name: input.name }
                  : { handle }),
                provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
                visibility,
                workspaceId,
              },
            });
          }

          if (
            visibility === 'workspace' &&
            isDefined(input.existingAccount) &&
            existingAccount?.id !== input.existingAccount.id
          ) {
            throw new WorkspaceSharedConnectedAccountNotFoundError();
          }

          if (
            isDefined(input.name) &&
            isDefined(existingAccount) &&
            existingAccount.handle !== handle
          ) {
            throw new WorkspaceSharedConnectedAccountConflictError();
          }

          const existingMessageChannel =
            visibility === 'workspace' && isDefined(existingAccount)
              ? await messageChannelRepository.findOne({
                  where: {
                    connectedAccountId: existingAccount.id,
                    workspaceId,
                  },
                })
              : userScopedExistingMessageChannel;
          const existingCalendarChannel =
            visibility === 'workspace' && isDefined(existingAccount)
              ? await calendarChannelRepository.findOne({
                  where: {
                    connectedAccountId: existingAccount.id,
                    workspaceId,
                  },
                })
              : userScopedExistingCalendarChannel;
          const connectedAccountId = existingAccount?.id ?? v4();
          const encryptedConnectionParameters =
            this.connectedAccountTokenEncryptionService.encryptConnectionParameters(
              {
                connectionParameters: input.connectionParameters,
                workspaceId,
              },
            );

          await connectedAccountRepository.save({
            id: connectedAccountId,
            handle,
            ...(isDefined(input.name) ? { name: input.name } : {}),
            provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
            connectionParameters: encryptedConnectionParameters,
            userWorkspaceId:
              existingAccount?.userWorkspaceId ?? userWorkspaceId,
            workspaceId,
            visibility,
            authFailedAt: null,
          });

          const messageChannelId =
            existingMessageChannel?.id ??
            (isDefined(input.connectionParameters.IMAP)
              ? await this.createMessageChannelService.createMessageChannel({
                  workspaceId,
                  connectedAccountId,
                  handle,
                  transactionManager,
                })
              : null);

          if (
            !isDefined(existingCalendarChannel) &&
            isDefined(input.connectionParameters.CALDAV)
          ) {
            await this.createCalendarChannelService.createCalendarChannel({
              workspaceId,
              connectedAccountId,
              handle,
              transactionManager,
            });
          }

          return {
            connectedAccountId,
            existingAccount,
            existingCalendarChannel,
            existingMessageChannel,
            messageChannelId,
            shouldCreateMessageChannel:
              !isDefined(existingMessageChannel) &&
              isDefined(input.connectionParameters.IMAP),
          };
        },
      );
    const {
      connectedAccountId,
      existingAccount,
      existingCalendarChannel,
      existingMessageChannel,
      messageChannelId,
      shouldCreateMessageChannel,
    } = transactionResult;

    if (isDefined(existingAccount)) {
      const ownerUserWorkspace =
        existingAccount.userWorkspaceId === userWorkspaceId
          ? userWorkspace
          : await this.userWorkspaceRepository.findOne({
              where: {
                id: existingAccount.userWorkspaceId,
                workspaceId,
              },
            });

      if (isDefined(ownerUserWorkspace)) {
        await this.accountsToReconnectService.removeAccountToReconnect(
          ownerUserWorkspace.userId,
          workspaceId,
          connectedAccountId,
        );
      }
    }

    if (shouldCreateMessageChannel) {
      const newMessageChannel = await this.messageChannelRepository.findOne({
        where: {
          connectedAccountId,
          workspaceId,
        },
        relations: ['connectedAccount', 'messageFolders'],
      });

      if (isDefined(newMessageChannel)) {
        try {
          await this.syncMessageFoldersService.syncMessageFolders({
            messageChannel: newMessageChannel,
            workspaceId,
          });
        } catch {
          this.logger.warn(
            `Initial folder sync failed for account ${connectedAccountId}; retry scheduled`,
          );
        }
      }
    }

    if (
      isDefined(existingMessageChannel) &&
      isDefined(input.connectionParameters.IMAP) &&
      existingMessageChannel.syncStage !==
        MessageChannelSyncStage.PENDING_CONFIGURATION
    ) {
      await this.messagingChannelSyncStatusService.resetAndMarkAsMessagesListFetchPending(
        [existingMessageChannel.id],
        workspaceId,
      );

      await this.messageQueueService.add<MessagingMessageListFetchJobData>(
        MessagingMessageListFetchJob.name,
        { workspaceId, messageChannelId: existingMessageChannel.id },
      );
    }

    if (
      isDefined(existingCalendarChannel) &&
      isDefined(input.connectionParameters.CALDAV) &&
      existingCalendarChannel.syncStage !==
        CalendarChannelSyncStage.PENDING_CONFIGURATION
    ) {
      await this.calendarChannelSyncStatusService.resetAndMarkAsCalendarEventListFetchPending(
        [existingCalendarChannel.id],
        workspaceId,
      );

      await this.calendarQueueService.add<CalendarEventListFetchJobData>(
        CalendarEventListFetchJob.name,
        { workspaceId, calendarChannelId: existingCalendarChannel.id },
      );
    }

    return { connectedAccountId, messageChannelId };
  }
}
