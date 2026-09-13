import { Injectable, Logger } from '@nestjs/common';

import { ConnectedAccountProvider } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In } from 'typeorm';
import { v4 } from 'uuid';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageThreadWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-thread.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type MessageWithParticipants } from 'src/modules/messaging/message-import-manager/types/message';

type MessageAccumulator = {
  existingMessageInDB?: MessageWorkspaceEntity;
  existingThreadInDB?: Pick<MessageThreadWorkspaceEntity, 'id'>;
  existingMessageChannelMessageAssociationInDB?: MessageChannelMessageAssociationWorkspaceEntity;
  messageToCreate?: Pick<
    MessageWorkspaceEntity,
    | 'id'
    | 'headerMessageId'
    | 'subject'
    | 'receivedAt'
    | 'text'
    | 'messageThreadId'
    | 'isDraft'
  >;
  threadToCreate?: Pick<MessageThreadWorkspaceEntity, 'id' | 'subject'>;
  messageChannelMessageAssociationToCreate?: Pick<
    MessageChannelMessageAssociationWorkspaceEntity,
    | 'id'
    | 'messageChannelId'
    | 'messageId'
    | 'messageExternalId'
    | 'messageThreadExternalId'
    | 'direction'
  >;
};
@Injectable()
export class MessagingMessageService {
  private readonly logger = new Logger(MessagingMessageService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  public async saveMessagesWithinTransaction(
    messages: MessageWithParticipants[],
    messageChannelId: string,
    transactionManager: WorkspaceEntityManager,
    workspaceId: string,
  ): Promise<{
    createdMessages: Partial<MessageWorkspaceEntity>[];
    messageExternalIdsAndIdsMap: Map<string, string>;
    messageExternalIdToMessageChannelMessageAssociationIdMap: Map<
      string,
      string
    >;
    messageExternalIdToMessageThreadIdMap: Map<string, string>;
  }> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const messageChannelMessageAssociationRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
            workspaceId,
            'messageChannelMessageAssociation',
          );

        const messageRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageWorkspaceEntity>(
            workspaceId,
            'message',
          );

        const messageThreadRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageThreadWorkspaceEntity>(
            workspaceId,
            'messageThread',
          );
        const messageParticipantRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageParticipantWorkspaceEntity>(
            workspaceId,
            'messageParticipant',
          );

        const messageAccumulatorMap = new Map<string, MessageAccumulator>();
        const expectedMessageIds = messages
          .map((message) => message.expectedMessageId)
          .filter(isDefined);
        if (
          expectedMessageIds.some(
            (id) =>
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
                id,
              ),
          ) ||
          new Set(expectedMessageIds).size !== expectedMessageIds.length
        ) {
          throw new Error('Expected Message identities are invalid');
        }
        const [messagesByHeader, messagesByExpectedId] = await Promise.all([
          messageRepository.find(
            {
              where: {
                headerMessageId: In(
                  messages
                    .map((message) => message.headerMessageId)
                    .filter(
                      (headerMessageId) =>
                        typeof headerMessageId === 'string' &&
                        headerMessageId.trim().length > 0,
                    ),
                ),
              },
            },
            transactionManager,
          ),
          expectedMessageIds.length === 0
            ? Promise.resolve([])
            : messageRepository.find(
                { where: { id: In(expectedMessageIds) } },
                transactionManager,
              ),
        ]);
        const existingMessagesInDB = [
          ...new Map(
            [...messagesByHeader, ...messagesByExpectedId].map((message) => [
              message.id,
              message,
            ]),
          ).values(),
        ];

        const messageChannelMessageAssociationsReferencingMessageThread =
          await messageChannelMessageAssociationRepository.find(
            {
              where: {
                messageThreadExternalId: In(
                  messages.map((message) => message.messageThreadExternalId),
                ),
                messageChannelId,
              },
              relations: ['message'],
            },
            transactionManager,
          );

        const existingMessageChannelMessageAssociations =
          await messageChannelMessageAssociationRepository.find(
            {
              where: {
                messageId: In(
                  existingMessagesInDB.map((message) => message.id),
                ),
                messageChannelId,
              },
            },
            transactionManager,
          );
        const existingParticipants = await messageParticipantRepository.find(
          {
            where: {
              messageId: In(messagesByExpectedId.map((message) => message.id)),
            },
          },
          transactionManager,
        );

        this.requireExactDeterministicReplayEvidence({
          associations: existingMessageChannelMessageAssociations,
          messages,
          messagesByExpectedId,
          messagesByHeader,
          participants: existingParticipants,
          threadAssociations:
            messageChannelMessageAssociationsReferencingMessageThread,
        });

        await this.enrichMessageAccumulatorWithExistingMessages(
          messages,
          messageAccumulatorMap,
          existingMessagesInDB,
        );

        await this.enrichMessageAccumulatorWithExistingMessageThreadIds(
          messages,
          messageAccumulatorMap,
          messageChannelMessageAssociationsReferencingMessageThread,
          workspaceId,
        );

        await this.enrichMessageAccumulatorWithExistingMessageChannelMessageAssociations(
          messages,
          messageAccumulatorMap,
          existingMessageChannelMessageAssociations,
        );

        await this.enrichMessageAccumulatorWithMessageThreadToCreate(
          messages,
          messageAccumulatorMap,
        );

        for (const message of messages) {
          const messageAccumulator = messageAccumulatorMap.get(
            message.externalId,
          );

          if (!isDefined(messageAccumulator)) {
            throw new Error(
              `Message accumulator should reference the message, this should never happen`,
            );
          }

          const messageThreadId =
            messageAccumulator.threadToCreate?.id ??
            messageAccumulator.existingThreadInDB?.id;

          if (!isDefined(messageThreadId)) {
            throw new Error(
              `Message thread id should be defined, either in the threadToCreate or existingThreadInDB`,
            );
          }

          let newOrExistingMessageId: string;

          if (!isDefined(messageAccumulator.existingMessageInDB)) {
            newOrExistingMessageId = message.expectedMessageId ?? v4();

            const messageToCreate = {
              id: newOrExistingMessageId,
              headerMessageId: message.headerMessageId,
              subject: message.subject,
              receivedAt: message.receivedAt,
              text: message.text,
              messageThreadId,
              isDraft: message.isDraft,
            };

            messageAccumulator.messageToCreate = messageToCreate;
          } else {
            newOrExistingMessageId = messageAccumulator.existingMessageInDB.id;
          }

          if (
            !isDefined(
              messageAccumulator.existingMessageChannelMessageAssociationInDB,
            )
          ) {
            messageAccumulator.messageChannelMessageAssociationToCreate = {
              id: v4(),
              messageChannelId,
              messageId: newOrExistingMessageId,
              messageExternalId: message.externalId,
              messageThreadExternalId: message.messageThreadExternalId,
              direction: message.direction,
            };
          }

          messageAccumulatorMap.set(message.externalId, messageAccumulator);
        }

        const messageThreadsToCreate = Array.from(
          messageAccumulatorMap.values(),
        )
          .map((accumulator) => accumulator.threadToCreate)
          .filter(isDefined);

        const threadSubjectUpdates = new Map<
          string,
          { subject: string; receivedAt: number }
        >();

        for (const message of messages) {
          const messageAccumulator = messageAccumulatorMap.get(
            message.externalId,
          );

          if (!isDefined(messageAccumulator)) {
            continue;
          }

          if (
            isDefined(messageAccumulator.existingThreadInDB) &&
            isDefined(messageAccumulator.messageToCreate) &&
            isDefined(message.subject)
          ) {
            const threadId = messageAccumulator.existingThreadInDB.id;
            const existing = threadSubjectUpdates.get(threadId);
            const receivedAt = message.receivedAt?.getTime() ?? 0;

            if (!isDefined(existing) || receivedAt > existing.receivedAt) {
              threadSubjectUpdates.set(threadId, {
                subject: message.subject,
                receivedAt,
              });
            }
          }
        }

        if (messageThreadsToCreate.length > 0) {
          await messageThreadRepository.insert(
            messageThreadsToCreate,
            transactionManager,
          );
        }

        if (threadSubjectUpdates.size > 0) {
          await messageThreadRepository.upsert(
            Array.from(threadSubjectUpdates.entries()).map(
              ([id, { subject }]) => ({ id, subject }),
            ),
            ['id'],
            transactionManager,
          );
        }

        const messagesToCreate = Array.from(messageAccumulatorMap.values())
          .map((accumulator) => accumulator.messageToCreate)
          .filter(isDefined);

        await messageRepository.insert(messagesToCreate, transactionManager);

        const messageChannelMessageAssociationsToCreate = Array.from(
          messageAccumulatorMap.values(),
        )
          .map(
            (accumulator) =>
              accumulator.messageChannelMessageAssociationToCreate,
          )
          .filter(isDefined);

        await messageChannelMessageAssociationRepository.insert(
          messageChannelMessageAssociationsToCreate,
          transactionManager,
        );

        const messageExternalIdsAndIdsMap = new Map<string, string>();
        const messageExternalIdToMessageChannelMessageAssociationIdMap =
          new Map<string, string>();
        const messageExternalIdToMessageThreadIdMap = new Map<string, string>();

        for (const [
          externalId,
          accumulator,
        ] of messageAccumulatorMap.entries()) {
          if (isDefined(accumulator.messageToCreate)) {
            messageExternalIdsAndIdsMap.set(
              externalId,
              accumulator.messageToCreate.id,
            );
          }

          if (isDefined(accumulator.existingMessageInDB)) {
            messageExternalIdsAndIdsMap.set(
              externalId,
              accumulator.existingMessageInDB.id,
            );
          }

          const messageThreadId =
            accumulator.messageToCreate?.messageThreadId ??
            accumulator.existingMessageInDB?.messageThreadId;

          if (isDefined(messageThreadId)) {
            messageExternalIdToMessageThreadIdMap.set(
              externalId,
              messageThreadId,
            );
          }

          const createdAssociationId =
            accumulator.messageChannelMessageAssociationToCreate?.id;
          const existingAssociationId =
            accumulator.existingMessageChannelMessageAssociationInDB?.id;
          const associationId = createdAssociationId ?? existingAssociationId;

          if (isDefined(associationId)) {
            messageExternalIdToMessageChannelMessageAssociationIdMap.set(
              externalId,
              associationId,
            );
          }
        }

        return {
          createdMessages: messagesToCreate,
          messageExternalIdsAndIdsMap,
          messageExternalIdToMessageChannelMessageAssociationIdMap,
          messageExternalIdToMessageThreadIdMap,
        };
      },
      authContext,
      { lite: true },
    );
  }

  public async reconcileMicrosoftCampaignHeaderInTransaction(
    input: {
      workspaceId: string;
      connectedAccountId: string;
      messageChannelId: string;
      providerMessageExternalId: string;
      trustedHeaderMessageId: string;
    },
    transactionManager: WorkspaceEntityManager,
  ): Promise<'UPDATED' | 'EXACT_REPLAY' | 'DEFERRED'> {
    const runner = transactionManager.queryRunner;
    if (!runner?.isTransactionActive || runner.manager !== transactionManager) {
      throw new Error(
        'Microsoft header reconciliation requires active manager',
      );
    }
    const providerExternalId = input.providerMessageExternalId.trim();
    const trustedHeader = input.trustedHeaderMessageId.trim();
    if (providerExternalId.length === 0 || trustedHeader.length === 0) {
      throw new Error('Microsoft header reconciliation evidence is invalid');
    }
    const attempts = await runner.query(
      `SELECT "attemptId", "projectedMessageId", "providerHeaderMessageId",
              "reconciledProviderHeaderMessageId"
         FROM core."outboundEmailAttempt"
        WHERE "workspaceId"=$1 AND "connectedAccountId"=$2
          AND "messageChannelId"=$3 AND provider=$4
          AND "providerMessageExternalId"=$5
          AND source='CAMPAIGN_SEQUENCE' AND "attemptState"='ACCEPTED'
        FOR UPDATE`,
      [
        input.workspaceId,
        input.connectedAccountId,
        input.messageChannelId,
        ConnectedAccountProvider.MICROSOFT,
        providerExternalId,
      ],
    );
    if (!Array.isArray(attempts) || attempts.length !== 1) return 'DEFERRED';
    const attempt = attempts[0];
    if (typeof attempt.projectedMessageId !== 'string') return 'DEFERRED';

    const workspaceSchema = getWorkspaceSchemaName(input.workspaceId);
    const associations = await runner.query(
      `SELECT id,"messageId","messageChannelId","messageExternalId"
         FROM "${workspaceSchema}"."messageChannelMessageAssociation"
        WHERE "messageChannelId"=$1 AND "messageExternalId"=$2
        ORDER BY id FOR UPDATE`,
      [input.messageChannelId, providerExternalId],
    );
    if (
      !Array.isArray(associations) ||
      associations.length !== 1 ||
      associations[0].messageId !== attempt.projectedMessageId ||
      associations[0].messageChannelId !== input.messageChannelId ||
      associations[0].messageExternalId !== providerExternalId
    )
      return 'DEFERRED';
    const projectedRows = await runner.query(
      `SELECT id,"headerMessageId" FROM "${workspaceSchema}".message
        WHERE id=$1 FOR UPDATE`,
      [attempt.projectedMessageId],
    );
    if (!Array.isArray(projectedRows) || projectedRows.length !== 1)
      return 'DEFERRED';
    const collisions = await runner.query(
      `SELECT id FROM "${workspaceSchema}".message
        WHERE "headerMessageId"=$1 ORDER BY id FOR UPDATE`,
      [trustedHeader],
    );
    if (
      !Array.isArray(collisions) ||
      collisions.some((message) => message.id !== attempt.projectedMessageId)
    )
      throw new Error('Trusted Microsoft header collides with another Message');
    const projected = projectedRows[0];
    if (
      typeof projected.headerMessageId === 'string' &&
      projected.headerMessageId.trim().length > 0
    ) {
      if (
        projected.headerMessageId === trustedHeader &&
        attempt.reconciledProviderHeaderMessageId === trustedHeader
      )
        return 'EXACT_REPLAY';
      throw new Error(
        'Trusted Microsoft header conflicts with stored evidence',
      );
    }
    const messageUpdateResult = await runner.query(
      `UPDATE "${workspaceSchema}".message SET "headerMessageId"=$2
        WHERE id=$1 AND ("headerMessageId" IS NULL OR btrim("headerMessageId")='')
        RETURNING id`,
      [attempt.projectedMessageId, trustedHeader],
      true,
    );
    const messageUpdates = Array.isArray(messageUpdateResult)
      ? messageUpdateResult
      : messageUpdateResult.records;
    if (!Array.isArray(messageUpdates) || messageUpdates.length !== 1)
      throw new Error('Microsoft header evidence CAS failed');
    const attemptUpdateResult = await runner.query(
      `UPDATE core."outboundEmailAttempt"
          SET "reconciledProviderHeaderMessageId"=$2, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "attemptId"=$1 AND ("reconciledProviderHeaderMessageId" IS NULL OR btrim("reconciledProviderHeaderMessageId")='')
        RETURNING "attemptId"`,
      [attempt.attemptId, trustedHeader],
      true,
    );
    const attemptUpdates = Array.isArray(attemptUpdateResult)
      ? attemptUpdateResult
      : attemptUpdateResult.records;
    if (!Array.isArray(attemptUpdates) || attemptUpdates.length !== 1)
      throw new Error('Microsoft header evidence CAS failed');
    return 'UPDATED';
  }

  private requireExactDeterministicReplayEvidence(input: {
    messages: MessageWithParticipants[];
    messagesByHeader: MessageWorkspaceEntity[];
    messagesByExpectedId: MessageWorkspaceEntity[];
    associations: MessageChannelMessageAssociationWorkspaceEntity[];
    threadAssociations: Pick<
      MessageChannelMessageAssociationWorkspaceEntity,
      'messageThreadExternalId' | 'message'
    >[];
    participants: MessageParticipantWorkspaceEntity[];
  }): void {
    const participantKey = (participant: {
      role: unknown;
      handle: unknown;
      displayName: unknown;
    }) =>
      JSON.stringify([
        participant.role,
        participant.handle ?? null,
        participant.displayName ?? null,
      ]);

    for (const message of input.messages) {
      if (message.expectedMessageId === undefined) continue;
      const headerOwners = input.messagesByHeader.filter(
        (persisted) => persisted.headerMessageId === message.headerMessageId,
      );
      if (
        headerOwners.some(
          (persisted) => persisted.id !== message.expectedMessageId,
        )
      ) {
        throw new Error(
          'Expected Message identity conflicts with header identity',
        );
      }
      const expectedRows = input.messagesByExpectedId.filter(
        (persisted) => persisted.id === message.expectedMessageId,
      );
      if (expectedRows.length === 0) continue;
      if (expectedRows.length !== 1) {
        throw new Error('Expected Message identity is not unique');
      }
      const expected = expectedRows[0];
      if (
        expected.headerMessageId !== message.headerMessageId ||
        expected.subject !== message.subject ||
        expected.text !== message.text ||
        expected.isDraft !== message.isDraft ||
        expected.receivedAt?.getTime() !== message.receivedAt?.getTime()
      ) {
        throw new Error(
          'Expected Message exact replay conflicts with persisted content',
        );
      }
      const associations = input.associations.filter(
        (association) => association.messageId === message.expectedMessageId,
      );
      if (
        associations.length !== 1 ||
        associations[0].messageExternalId !== message.externalId ||
        associations[0].messageThreadExternalId !==
          message.messageThreadExternalId ||
        associations[0].direction !== message.direction
      ) {
        throw new Error(
          'Expected Message association conflicts with persisted identity',
        );
      }
      const threadAssociations = input.threadAssociations.filter(
        (association) =>
          association.messageThreadExternalId ===
            message.messageThreadExternalId &&
          association.message?.id === message.expectedMessageId,
      );
      if (
        threadAssociations.length !== 1 ||
        threadAssociations[0].message?.messageThreadId !==
          expected.messageThreadId
      ) {
        throw new Error('Expected Message thread evidence conflicts');
      }
      const expectedParticipants = message.participants
        .map(participantKey)
        .sort();
      const persistedParticipants = input.participants
        .filter(
          (participant) => participant.messageId === message.expectedMessageId,
        )
        .map(participantKey)
        .sort();
      if (
        JSON.stringify(expectedParticipants) !==
        JSON.stringify(persistedParticipants)
      ) {
        throw new Error('Expected Message participant evidence conflicts');
      }
    }
  }

  private async enrichMessageAccumulatorWithExistingMessages(
    messages: MessageWithParticipants[],
    messageAccumulatorMap: Map<string, MessageAccumulator>,
    existingMessagesInDB: MessageWorkspaceEntity[],
  ) {
    for (const message of messages) {
      const expected =
        message.expectedMessageId === undefined
          ? undefined
          : existingMessagesInDB.find(
              (existingMessage) =>
                existingMessage.id === message.expectedMessageId,
            );
      const byHeader = existingMessagesInDB.find(
        (existingMessage) =>
          typeof message.headerMessageId === 'string' &&
          message.headerMessageId.trim().length > 0 &&
          existingMessage.headerMessageId === message.headerMessageId,
      );
      if (
        message.expectedMessageId !== undefined &&
        byHeader !== undefined &&
        message.expectedMessageId !== byHeader.id
      ) {
        throw new Error(
          'Expected Message identity conflicts with header identity',
        );
      }
      const existingMessage = expected ?? byHeader;
      if (
        expected !== undefined &&
        (expected.headerMessageId !== message.headerMessageId ||
          expected.subject !== message.subject ||
          expected.text !== message.text ||
          expected.isDraft !== message.isDraft ||
          expected.receivedAt?.getTime() !== message.receivedAt?.getTime())
      ) {
        throw new Error(
          'Expected Message exact replay conflicts with persisted content',
        );
      }

      if (!isDefined(existingMessage)) {
        messageAccumulatorMap.set(message.externalId, {});
        continue;
      }

      messageAccumulatorMap.set(message.externalId, {
        existingMessageInDB: existingMessage,
      });
    }
  }

  private async enrichMessageAccumulatorWithExistingMessageThreadIds(
    messages: MessageWithParticipants[],
    messageAccumulatorMap: Map<string, MessageAccumulator>,
    messageChannelMessageAssociationsReferencingMessageThread: Pick<
      MessageChannelMessageAssociationWorkspaceEntity,
      'messageThreadExternalId' | 'message'
    >[],
    workspaceId: string,
  ) {
    for (const message of messages) {
      const messageAccumulator = messageAccumulatorMap.get(message.externalId);

      if (!isDefined(messageAccumulator)) {
        throw new Error(
          `Message accumulator should reference the message, this should never happen`,
        );
      }

      const messageChannelMessageAssociationReferencingMessageThread =
        messageChannelMessageAssociationsReferencingMessageThread.find(
          (association) =>
            association.messageThreadExternalId ===
            message.messageThreadExternalId,
        );

      const existingThreadIdInDBIfMessageIsExistingInDB =
        messageAccumulator.existingMessageInDB?.messageThreadId;
      const existingThreadIdInDBIfMessageIsReferencedInMessageChannelMessageAssociation =
        messageChannelMessageAssociationReferencingMessageThread?.message
          ?.messageThreadId;

      if (isDefined(existingThreadIdInDBIfMessageIsExistingInDB)) {
        messageAccumulator.existingThreadInDB = {
          id: existingThreadIdInDBIfMessageIsExistingInDB,
        };
      }

      if (
        isDefined(
          existingThreadIdInDBIfMessageIsReferencedInMessageChannelMessageAssociation,
        )
      ) {
        messageAccumulator.existingThreadInDB = {
          id: existingThreadIdInDBIfMessageIsReferencedInMessageChannelMessageAssociation,
        };
      }

      if (
        isDefined(existingThreadIdInDBIfMessageIsExistingInDB) &&
        isDefined(
          existingThreadIdInDBIfMessageIsReferencedInMessageChannelMessageAssociation,
        ) &&
        existingThreadIdInDBIfMessageIsExistingInDB !==
          existingThreadIdInDBIfMessageIsReferencedInMessageChannelMessageAssociation
      ) {
        this.logger.warn(
          `
          WorkspaceId: ${workspaceId} /
          Message ExternalId: ${message.externalId} /
          Message HeaderId: ${message.headerMessageId} /
          Message Thread ExternalId: ${message.messageThreadExternalId} /
          Message Thread Id in DB: ${existingThreadIdInDBIfMessageIsExistingInDB} /
          Message Thread Id in Message Channel Message Association: ${existingThreadIdInDBIfMessageIsReferencedInMessageChannelMessageAssociation} /
          Message Subject: ${message.subject} /
          Message Received At: ${message.receivedAt} /
          Thread inter channel detected`,
        );
      }

      messageAccumulatorMap.set(message.externalId, messageAccumulator);
    }
  }

  private async enrichMessageAccumulatorWithExistingMessageChannelMessageAssociations(
    messages: MessageWithParticipants[],
    messageAccumulatorMap: Map<string, MessageAccumulator>,
    existingMessageChannelMessageAssociations: MessageChannelMessageAssociationWorkspaceEntity[],
  ) {
    for (const message of messages) {
      const messageAccumulator = messageAccumulatorMap.get(message.externalId);

      if (!isDefined(messageAccumulator)) {
        throw new Error(
          `Message accumulator should reference the message, this should never happen`,
        );
      }

      const existingMessage = messageAccumulator.existingMessageInDB;

      if (!isDefined(existingMessage)) {
        continue;
      }

      const existingMessageChannelMessageAssociation =
        existingMessageChannelMessageAssociations.find(
          (association) => association.messageId === existingMessage.id,
        );

      if (existingMessageChannelMessageAssociation) {
        if (
          message.expectedMessageId !== undefined &&
          (existingMessageChannelMessageAssociation.messageExternalId !==
            message.externalId ||
            existingMessageChannelMessageAssociation.messageThreadExternalId !==
              message.messageThreadExternalId)
        ) {
          throw new Error(
            'Expected Message association conflicts with persisted identity',
          );
        }
        messageAccumulator.existingMessageChannelMessageAssociationInDB =
          existingMessageChannelMessageAssociation;
      }
    }
  }

  private async enrichMessageAccumulatorWithMessageThreadToCreate(
    messages: MessageWithParticipants[],
    messageAccumulatorMap: Map<string, MessageAccumulator>,
  ) {
    for (const [index, message] of messages.entries()) {
      const messageAccumulator = messageAccumulatorMap.get(message.externalId);

      if (!isDefined(messageAccumulator)) {
        throw new Error(
          `Message accumulator should reference the message, this should never happen`,
        );
      }

      const previousMessageWithSameThreadExternalId = messages.find(
        (otherMessage, otherMessageIndex) =>
          otherMessage.messageThreadExternalId ===
            message.messageThreadExternalId && otherMessageIndex < index,
      );

      let newOrExistingMessageThreadId: string | undefined;

      if (isDefined(messageAccumulator.existingThreadInDB)) {
        newOrExistingMessageThreadId = messageAccumulator.existingThreadInDB.id;
      }

      if (isDefined(previousMessageWithSameThreadExternalId)) {
        const previousMessageAccumulator = messageAccumulatorMap.get(
          previousMessageWithSameThreadExternalId.externalId,
        );

        const previousMessageThreadId =
          previousMessageAccumulator?.threadToCreate?.id ??
          previousMessageAccumulator?.existingThreadInDB?.id;

        if (!isDefined(previousMessageThreadId)) {
          throw new Error(
            `Previous message should have a thread id, either in the messageToCreate or existingMessageInDB`,
          );
        }

        newOrExistingMessageThreadId = previousMessageThreadId;
        messageAccumulator.existingThreadInDB = {
          id: previousMessageThreadId,
        };
      }

      if (!isDefined(newOrExistingMessageThreadId)) {
        newOrExistingMessageThreadId = v4();

        messageAccumulator.threadToCreate = {
          id: newOrExistingMessageThreadId,
          subject: message.subject,
        };
      }

      messageAccumulatorMap.set(message.externalId, messageAccumulator);
    }
  }
}
