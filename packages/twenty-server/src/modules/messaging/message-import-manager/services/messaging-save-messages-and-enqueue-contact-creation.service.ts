import { ConflictException, Injectable, Optional } from '@nestjs/common';

import { type MyahInboxTriageMode } from 'src/engine/core-modules/myah-inbox/types/myah-inbox-contact-triage.types';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
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
    private readonly myahInboxContactTriageLifecycleService: MyahInboxContactTriageLifecycleService,
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
      // A source is only actionable when this workspace already has the private
      // triage schema. Without it every triage write would fail, which would
      // abort message persistence itself, so the import stays schema-agnostic
      // until the 2.20 command has provisioned the workspace.
      const recordTriageSource = source
        ? await this.myahInboxContactTriageReceiptService.lockMigrationMarkerForSourcePersistenceInTransaction(
            transactionManager,
          )
        : false;

      const replyEvidence = this.moduleRef?.get<{
        prepareInboundCandidateCreatorsInTransaction: (
          input: {
            workspaceId: string;
            messageChannelId: string;
            candidates: Array<{
              threadExternalId: string;
              normalizedSender: string;
            }>;
          },
          manager: WorkspaceEntityManager,
        ) => Promise<string[]>;
        reconcileInboundMessageInTransaction: (
          input: {
            workspaceId: string;
            messageChannelId: string;
            threadExternalId: string;
            fromHandle: string;
            inboundEvidenceId: string;
            inboundMessageThreadId: string;
            inReplyToTokens?: string[];
            coveredCreatorIds?: string[];
          },
          manager: WorkspaceEntityManager,
        ) => Promise<void>;
      }>(CAMPAIGN_REPLY_EVIDENCE_PORT, { strict: false });
      const candidates = messagesToSave.flatMap((message) => {
        if (message.direction !== MessageDirection.INCOMING) return [];
        const from = message.participants
          .find(
            (participant) => participant.role === MessageParticipantRole.FROM,
          )
          ?.handle?.trim()
          .toLowerCase();
        return from && message.messageThreadExternalId.trim()
          ? [
              {
                threadExternalId: message.messageThreadExternalId,
                normalizedSender: from,
              },
            ]
          : [];
      });
      let coveredCreatorIds: string[] = [];
      if (recordTriageSource && candidates.length > 0) {
        const attemptCreatorIds = replyEvidence
          ? await replyEvidence.prepareInboundCandidateCreatorsInTransaction(
              { workspaceId, messageChannelId: messageChannel.id, candidates },
              transactionManager,
            )
          : [];
        const query = transactionManager.queryRunner?.query.bind(
          transactionManager.queryRunner,
        );
        if (!query)
          throw new Error(
            'Creator source preflight requires an active transaction',
          );
        await query("SELECT set_config('search_path', $1, true)", [
          getWorkspaceSchemaName(workspaceId),
        ]);
        const currentSourceCreators = (await query(
          `SELECT DISTINCT thread."creatorId" FROM "messageThread" thread
            WHERE thread."creatorId" IS NOT NULL AND (
              thread.id=ANY($1::uuid[])
              OR thread.id IN (SELECT "messageThreadId" FROM "message"
                WHERE "headerMessageId"=ANY($2::text[]) OR id=ANY($3::uuid[]))
              OR thread.id IN (SELECT message."messageThreadId"
                FROM "messageChannelMessageAssociation" association
                JOIN "message" message ON message.id=association."messageId"
                WHERE association."messageChannelId"=$4
                  AND association."messageThreadExternalId"=ANY($5::text[]))
            )`,
          [
            messagesToSave
              .map((message) => message.deliveryTargetId)
              .filter(isDefined),
            messagesToSave
              .map((message) => message.headerMessageId)
              .filter(isDefined),
            messagesToSave
              .map((message) => message.expectedMessageId)
              .filter(isDefined),
            messageChannel.id,
            messagesToSave.map((message) => message.messageThreadExternalId),
          ],
        )) as Array<{ creatorId: string }>;
        coveredCreatorIds = [
          ...new Set([
            ...attemptCreatorIds,
            ...currentSourceCreators.map((source) => source.creatorId),
          ]),
        ].sort();
      }

      const persist = () =>
        this.messageService.saveMessagesWithinTransaction(
          messagesToSave,
          messageChannel.id,
          transactionManager,
          workspaceId,
          ...(recordTriageSource ? ([true] as const) : []),
        );
      const {
        messageExternalIdsAndIdsMap,
        messageExternalIdToMessageChannelMessageAssociationIdMap,
        messageExternalIdToMessageThreadIdMap,
        messageExternalIdToPersistenceInfoMap,
      } =
        recordTriageSource && candidates.length > 0
          ? await this.myahInboxContactTriageLifecycleService.withCreatorMutationLocksInTransaction(
              {
                creatorIds: coveredCreatorIds,
                manager: transactionManager,
                mutate: persist,
              },
            )
          : await persist();

      let lockedSourceRows:
        | Array<{ id: string; creatorId: string | null }>
        | undefined;
      if (recordTriageSource && candidates.length > 0) {
        const query = transactionManager.queryRunner!.query.bind(
          transactionManager.queryRunner,
        );
        lockedSourceRows = (await query(
          'SELECT id, "creatorId" FROM "messageThread" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [[...new Set(messageExternalIdToMessageThreadIdMap.values())].sort()],
        )) as Array<{ id: string; creatorId: string | null }>;
        this.myahInboxContactTriageLifecycleService.assertCreatorMutationLockCoverage(
          {
            anticipatedCreatorIds: lockedSourceRows.flatMap((source) =>
              source.creatorId ? [source.creatorId] : [],
            ),
            coveredCreatorIds,
          },
        );
      }

      for (const message of messagesToSave) {
        if (message.direction !== MessageDirection.INCOMING) continue;
        const inboundEvidenceId = messageExternalIdsAndIdsMap.get(
          message.externalId,
        );
        const fromHandle = message.participants.find(
          (participant) => participant.role === MessageParticipantRole.FROM,
        )?.handle;
        if (!inboundEvidenceId || !fromHandle) continue;
        const inboundMessageThreadId =
          messageExternalIdToMessageThreadIdMap.get(message.externalId);
        if (!inboundMessageThreadId) {
          throw new Error('Persisted inbound Message must have a Thread');
        }
        await replyEvidence?.reconcileInboundMessageInTransaction(
          {
            workspaceId,
            messageChannelId: messageChannel.id,
            threadExternalId: message.messageThreadExternalId,
            fromHandle,
            inboundEvidenceId,
            inboundMessageThreadId,
            ...(message.inReplyToTokens === undefined
              ? {}
              : { inReplyToTokens: message.inReplyToTokens }),
            ...(recordTriageSource && candidates.length > 0
              ? { coveredCreatorIds }
              : {}),
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

      if (recordTriageSource && source) {
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
        const sourceRows =
          lockedSourceRows ??
          ((await query(
            'SELECT id, "creatorId" FROM "messageThread" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
            [sourceRecordIds],
          )) as Array<{ id: string; creatorId: string | null }>);
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
            if (!workspaceDataSource) return undefined;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                return await workspaceDataSource.transaction(
                  saveWithinTransaction,
                );
              } catch (error) {
                if (
                  !(error instanceof ConflictException) ||
                  error.message !==
                    'Inbox Creator lock coverage changed before source mutation' ||
                  attempt === 2
                )
                  throw error;
              }
            }
            return undefined;
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
