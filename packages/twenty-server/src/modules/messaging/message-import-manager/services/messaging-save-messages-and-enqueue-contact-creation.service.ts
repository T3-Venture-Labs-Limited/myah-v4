import { Injectable, Optional } from '@nestjs/common';

import { type MyahInboxTriageMode } from 'src/engine/core-modules/myah-inbox/types/myah-inbox-contact-triage.types';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { ModuleRef } from '@nestjs/core';

import {
  FieldActorSource,
  MessageChannelContactAutoCreationPolicy,
  MessageParticipantRole,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import {
  CreateCompanyAndContactJob,
  type CreateCompanyAndContactJobData,
} from 'src/modules/contact-creation-manager/jobs/create-company-and-contact.job';
import {
  type Participant,
  type ParticipantWithMessageId,
} from 'src/modules/messaging/message-import-manager/drivers/gmail/types/gmail-message.type';
import {
  type MessageChannelMessageAssociationFolderAssociation,
  MessagingMessageFolderAssociationService,
} from 'src/modules/messaging/message-import-manager/services/messaging-message-folder-association.service';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message';
import { MessagingMessageParticipantService } from 'src/modules/messaging/message-participant-manager/services/messaging-message-participant.service';
import { CAMPAIGN_REPLY_EVIDENCE_PORT } from 'src/modules/campaign-execution/constants/campaign-execution-di-tokens';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { isWorkEmail } from 'src/utils/is-work-email';

@Injectable()
export class MessagingSaveMessagesAndEnqueueContactCreationService {
  constructor(
    @InjectMessageQueue(MessageQueue.contactCreationQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly messageService: MessagingMessageService,
    private readonly messageParticipantService: MessagingMessageParticipantService,
    private readonly messageFolderAssociationService: MessagingMessageFolderAssociationService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly myahInboxContactTriageService: MyahInboxContactTriageService,
    private readonly myahInboxContactTriageReceiptService: MyahInboxContactTriageReceiptService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async saveMessagesAndEnqueueContactCreation(
    messagesToSave: MessageWithParticipants[],
    messageChannel: MessageChannelEntity,
    connectedAccount: ConnectedAccountEntity,
    workspaceId: string,
    source?: { mode: MyahInboxTriageMode; generationId: string },
    suppliedTransactionManager?: WorkspaceEntityManager,
  ): Promise<
    | {
        messageExternalIdsAndIdsMap: Map<string, string>;
        messageExternalIdToMessageThreadIdMap: Map<string, string>;
        messageExternalIdToPersistenceInfoMap: Map<
          string,
          {
            createdAt: string;
            direction: string;
            wasInserted: boolean;
            messageThreadId: string;
          }
        >;
        contactsToCreate: (ParticipantWithMessageId & {
          shouldCreateContact: boolean;
        })[];
      }
    | undefined
  > {
    const handleAliases = connectedAccount.handleAliases || [];
    const authContext = buildSystemAuthContext(workspaceId);

    const saveWithinTransaction = async (
      transactionManager: WorkspaceEntityManager,
    ) => {
      if (source) {
        // Migration marker ownership precedes every source advisory/row lock.
        await this.myahInboxContactTriageReceiptService.lockMigrationMarkerForSourcePersistenceInTransaction(
          transactionManager,
        );
      }

      const {
        messageExternalIdsAndIdsMap,
        messageExternalIdToMessageChannelMessageAssociationIdMap,
        messageExternalIdToMessageThreadIdMap,
        messageExternalIdToPersistenceInfoMap,
      } = await this.messageService.saveMessagesWithinTransaction(
        messagesToSave,
        messageChannel.id,
        transactionManager,
        workspaceId,
        ...(source ? ([true] as const) : []),
      );

      for (const message of messagesToSave) {
        if (message.direction !== MessageDirection.INCOMING) continue;
        const inboundEvidenceId = messageExternalIdsAndIdsMap.get(
          message.externalId,
        );
        const fromHandle = message.participants.find(
          (participant) => participant.role === MessageParticipantRole.FROM,
        )?.handle;
        if (!inboundEvidenceId || !fromHandle) continue;
        await this.moduleRef
          ?.get<{
            reconcileInboundMessageInTransaction: (
              input: {
                workspaceId: string;
                messageChannelId: string;
                threadExternalId: string;
                fromHandle: string;
                inboundEvidenceId: string;
              },
              manager: WorkspaceEntityManager,
            ) => Promise<void>;
          }>(CAMPAIGN_REPLY_EVIDENCE_PORT, { strict: false })
          ?.reconcileInboundMessageInTransaction(
            {
              workspaceId,
              messageChannelId: messageChannel.id,
              threadExternalId: message.messageThreadExternalId,
              fromHandle,
              inboundEvidenceId,
            },
            transactionManager,
          );
      }

      const participantsWithMessageId: (ParticipantWithMessageId & {
        shouldCreateContact: boolean;
      })[] = messagesToSave.flatMap((message) => {
        const messageId = messageExternalIdsAndIdsMap.get(message.externalId);

        return messageId
          ? message.participants.map((participant: Participant) => {
              const fromHandle =
                message.participants.find(
                  (p) => p.role === MessageParticipantRole.FROM,
                )?.handle || '';

              const isMessageSentByConnectedAccount =
                handleAliases.includes(fromHandle) ||
                fromHandle === connectedAccount.handle;

              const isParticipantConnectedAccount =
                handleAliases.includes(participant.handle) ||
                participant.handle === connectedAccount.handle;

              const isExcludedByNonProfessionalEmails =
                messageChannel.excludeNonProfessionalEmails &&
                !isWorkEmail(participant.handle);

              // Drafts are outgoing, so don't turn recipients of an
              // unsent email into CRM contacts.
              const shouldCreateContact =
                !message.isDraft &&
                !!participant.handle &&
                !isParticipantConnectedAccount &&
                !isExcludedByNonProfessionalEmails &&
                (messageChannel.contactAutoCreationPolicy ===
                  MessageChannelContactAutoCreationPolicy.SENT_AND_RECEIVED ||
                  (messageChannel.contactAutoCreationPolicy ===
                    MessageChannelContactAutoCreationPolicy.SENT &&
                    isMessageSentByConnectedAccount));

              return {
                ...participant,
                messageId,
                shouldCreateContact,
              };
            })
          : [];
      });

      await this.messageParticipantService.saveMessageParticipants(
        participantsWithMessageId,
        workspaceId,
        transactionManager,
      );

      const folderAssociations: MessageChannelMessageAssociationFolderAssociation[] =
        messagesToSave.flatMap((message) => {
          const messageFolderIds = message.messageFolderIds ?? [];

          if (messageFolderIds.length === 0) {
            return [];
          }

          const associationId =
            messageExternalIdToMessageChannelMessageAssociationIdMap.get(
              message.externalId,
            );

          if (!isDefined(associationId)) {
            return [];
          }

          return [
            {
              messageChannelMessageAssociationId: associationId,
              messageFolderIds,
            },
          ];
        });

      await this.messageFolderAssociationService.saveMessageFolderAssociations(
        folderAssociations,
        workspaceId,
        transactionManager,
      );

      if (source) {
        const persistedSourceMessages = messagesToSave.flatMap((message) => {
          const messageId = messageExternalIdsAndIdsMap.get(message.externalId);
          const persistence = messageExternalIdToPersistenceInfoMap.get(
            message.externalId,
          );
          const threadId = persistence?.messageThreadId;
          if (!messageId || !threadId || !persistence) return [];

          const direction =
            persistence.direction === MessageDirection.INCOMING
              ? ('INBOUND' as const)
              : persistence.direction === MessageDirection.OUTGOING
                ? ('OUTBOUND' as const)
                : ('UNKNOWN' as const);

          return [{ direction, message, messageId, persistence, threadId }];
        });

        // Message persistence already holds marker, source-advisory, and
        // source-row locks. Re-imports can attach an existing
        // header-deduplicated message to another channel, so they must extend
        // durable visibility provenance even though they do not create a new
        // transition receipt.
        for (const sourceMessage of persistedSourceMessages) {
          if (sourceMessage.direction === 'UNKNOWN') {
            continue;
          }
          await this.myahInboxContactTriageReceiptService.recordInTransaction(
            {
              channel: 'EMAIL',
              persistedMessageId: sourceMessage.messageId,
              sourceRecordId: sourceMessage.threadId,
              sourceGenerationId: source.generationId,
              mode: source.mode,
              direction: sourceMessage.direction,
              providerOccurredAt:
                sourceMessage.message.providerOccurredAt ?? null,
              originalCreatedAt: sourceMessage.persistence.createdAt,
              firstPersistence: sourceMessage.persistence.wasInserted,
            },
            transactionManager,
          );
        }

        const sourceRecordIds = [
          ...new Set(
            persistedSourceMessages.map(
              (sourceMessage) => sourceMessage.threadId,
            ),
          ),
        ].sort();
        const query = transactionManager.queryRunner?.query.bind(
          transactionManager.queryRunner,
        );
        if (!query) {
          throw new Error(
            'Email triage identity preparation requires an active transaction manager',
          );
        }
        const sourceRows = (await query(
          'SELECT id, "creatorId" FROM "messageThread" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [sourceRecordIds],
        )) as Array<{ id: string; creatorId: string | null }>;
        const creatorIdBySourceId = new Map(
          sourceRows.map((sourceRow) => [sourceRow.id, sourceRow.creatorId]),
        );
        await this.myahInboxContactTriageService.lockIdentityKeysInTransaction({
          identityKeys: sourceRecordIds.flatMap((sourceRecordId) => {
            const creatorId = creatorIdBySourceId.get(sourceRecordId);

            return [
              `email-thread:${sourceRecordId}`,
              ...(creatorId ? [`creator:${creatorId}`] : []),
            ];
          }),
          manager: transactionManager,
        });

        for (const sourceMessage of persistedSourceMessages) {
          await this.myahInboxContactTriageService.ensureSourceContactInTransaction(
            {
              workspaceId,
              sourceType: 'EMAIL_THREAD',
              sourceRecordId: sourceMessage.threadId,
              initialDirection: sourceMessage.direction,
              manager: transactionManager,
            },
          );
        }
      }

      return {
        participantsWithMessageId,
        messageExternalIdsAndIdsMap,
        messageExternalIdToMessageThreadIdMap,
        messageExternalIdToPersistenceInfoMap,
        contactsToCreate: participantsWithMessageId.filter(
          (participant) => participant.shouldCreateContact,
        ),
      };
    };
    const savedMessagesResult = suppliedTransactionManager
      ? await saveWithinTransaction(suppliedTransactionManager)
      : await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => {
            const workspaceDataSource =
              await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
            return workspaceDataSource?.transaction(saveWithinTransaction);
          },
          authContext,
          { lite: true },
        );

    if (
      suppliedTransactionManager === undefined &&
      messageChannel.isContactAutoCreationEnabled &&
      savedMessagesResult
    ) {
      await this.enqueueContactCreation({
        workspaceId,
        connectedAccount,
        contactsToCreate: savedMessagesResult.contactsToCreate,
      });
    }

    if (!isDefined(savedMessagesResult)) {
      return undefined;
    }

    return {
      messageExternalIdsAndIdsMap:
        savedMessagesResult.messageExternalIdsAndIdsMap,
      messageExternalIdToMessageThreadIdMap:
        savedMessagesResult.messageExternalIdToMessageThreadIdMap,
      messageExternalIdToPersistenceInfoMap:
        savedMessagesResult.messageExternalIdToPersistenceInfoMap,
      contactsToCreate: savedMessagesResult.contactsToCreate,
    };
  }

  async enqueueContactCreation({
    workspaceId,
    connectedAccount,
    contactsToCreate,
  }: {
    workspaceId: string;
    connectedAccount: ConnectedAccountEntity;
    contactsToCreate: (ParticipantWithMessageId & {
      shouldCreateContact: boolean;
    })[];
  }): Promise<void> {
    await this.messageQueueService.add<CreateCompanyAndContactJobData>(
      CreateCompanyAndContactJob.name,
      {
        workspaceId,
        connectedAccount,
        contactsToCreate,
        source: FieldActorSource.EMAIL,
      },
    );
  }
}
