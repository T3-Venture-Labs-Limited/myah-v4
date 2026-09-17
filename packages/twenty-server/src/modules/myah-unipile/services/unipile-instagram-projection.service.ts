import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { FieldActorSource } from 'twenty-shared/types';

import { type RawAuthContext } from 'src/engine/core-modules/auth/types/raw-auth-context.type';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import {
  buildMyahInboxSourceKey,
  MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramAccountFinalizationLockService } from 'src/modules/myah-unipile/services/unipile-instagram-account-finalization-lock.service';
import {
  hasContradictoryUnipileInstagramSenderEvidence,
  type UnipileInstagramChat,
  type UnipileInstagramMessage,
  unipileInstagramMessageDirection,
} from 'src/modules/myah-unipile/types/unipile-v1.type';

type WorkspaceIdentity = {
  id: string;
};

type DeliveryState = 'UNKNOWN' | 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ';
type MessageDirection = 'INBOUND' | 'OUTBOUND' | 'UNKNOWN';

type ConversationRecord = {
  id: string;
};
type WorkspaceQueryExecutor = Pick<GlobalWorkspaceDataSource, 'query'> & {
  manager: WorkspaceEntityManager;
};

type MessageRecord = {
  id: string;
  createdAt: Date | string;
  deliveryState: DeliveryState | null;
  deliveryStateUpdatedAt: Date | string | null;
};

export type UnipileInstagramProjectionBinding = Pick<
  UnipileInstagramAccountBindingEntity,
  | 'id'
  | 'workspaceId'
  | 'workspaceInstagramAccountRecordId'
  | 'unipileAccountId'
  | 'instagramUserId'
  | 'status'
  | 'deactivatedAt'
>;

export type UnipileInstagramChatProjectionInput = {
  workspace: WorkspaceIdentity;
  binding: UnipileInstagramProjectionBinding;
  chat: UnipileInstagramChat;
};

export type UnipileInstagramMessageProjectionInput =
  UnipileInstagramChatProjectionInput & {
    conversationRecordId: string;
    message: UnipileInstagramMessage;
    deliveryState?: DeliveryState;
    deliveryStateUpdatedAt?: string | null;
    sourceGenerationId?: string;
    triageMode?: 'LIVE' | 'BACKFILL';
  };

export type UnipileInstagramCompletedMessageSyncInput = {
  workspace: WorkspaceIdentity;
  binding: UnipileInstagramProjectionBinding;
  conversationRecordId: string;
  completedMessageSyncAt: string;
};

export type UnipileInstagramCompletedChatSyncInput = {
  workspace: WorkspaceIdentity;
  workspaceInstagramAccountRecordId: string;
  binding: UnipileInstagramProjectionBinding;
  completedChatSyncAt: string;
};

const queryOptions = { shouldBypassPermissionChecks: true };
const deliveryRank: Record<DeliveryState, number> = {
  UNKNOWN: 0,
  RECEIVED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
};

@Injectable()
export class UnipileInstagramProjectionService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly accountFinalizationLock: UnipileInstagramAccountFinalizationLockService,
    private readonly myahInboxContactTriageService: MyahInboxContactTriageService,
    private readonly myahInboxContactTriageReceiptService: MyahInboxContactTriageReceiptService,
  ) {}

  async upsertVerifiedChat(
    input: UnipileInstagramChatProjectionInput,
  ): Promise<{ conversationRecordId: string }> {
    this.assertVerifiedChat(input);

    return this.withActiveBinding(input, () =>
      this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(input.workspace.id);
        return this.inTransaction(dataSource, async (querySource) => {
          await querySource.query(
            'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
            [
              input.binding.workspaceInstagramAccountRecordId,
              input.chat.chatId,
            ],
            undefined,
            queryOptions,
          );
          const lockSource = async (conversationRecordId: string) =>
            querySource.query(
              MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
              [
                buildMyahInboxSourceKey(
                  'INSTAGRAM_CONVERSATION',
                  conversationRecordId,
                ),
              ],
              undefined,
              queryOptions,
            );
          const initializeSourceContact = async (
            conversationRecordId: string,
          ) => {
            await this.myahInboxContactTriageService.ensureSourceContactInTransaction(
              {
                sourceType: 'INSTAGRAM_CONVERSATION',
                sourceRecordId: conversationRecordId,
                initialDirection: null,
                manager: querySource.manager,
              },
            );

            return { conversationRecordId };
          };

          const activeRecords = await querySource.query<ConversationRecord[]>(
            `
            SELECT "id"
            FROM "${schemaName}"."_myahSocialConversation"
            WHERE "provider" = $1
              AND "instagramAccountId" = $2
              AND "providerConversationId" = $3
              AND "deletedAt" IS NULL
            LIMIT 2
          `,
            [
              'UNIPILE',
              input.binding.workspaceInstagramAccountRecordId,
              input.chat.chatId,
            ],
            undefined,
            queryOptions,
          );

          if (activeRecords.length > 1) {
            throw new ConflictException('Instagram conversation is ambiguous');
          }

          if (activeRecords.length === 1) {
            const [record] = activeRecords;

            await lockSource(record.id);
            await this.updateConversation(
              querySource,
              schemaName,
              record.id,
              input,
            );

            return initializeSourceContact(record.id);
          }

          const deletedRecords = await querySource.query<ConversationRecord[]>(
            `
            SELECT "id"
            FROM "${schemaName}"."_myahSocialConversation"
            WHERE "provider" = $1
              AND "instagramAccountId" = $2
              AND "providerConversationId" = $3
              AND "deletedAt" IS NOT NULL
            LIMIT 2
          `,
            [
              'UNIPILE',
              input.binding.workspaceInstagramAccountRecordId,
              input.chat.chatId,
            ],
            undefined,
            queryOptions,
          );

          if (deletedRecords.length > 1) {
            throw new ConflictException(
              'Deleted Instagram conversation is ambiguous',
            );
          }

          if (deletedRecords.length === 1) {
            const [record] = deletedRecords;

            await lockSource(record.id);
            await this.restoreConversation(
              querySource,
              schemaName,
              record.id,
              input,
            );

            return initializeSourceContact(record.id);
          }

          const conversationRecordId = randomUUID();
          const displayName = input.chat.name ?? input.chat.attendeeProviderId;

          await lockSource(conversationRecordId);
          // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
          // pi-lens-ignore: sql-injection
          await querySource.query(
            `
            INSERT INTO "${schemaName}"."_myahSocialConversation" (
              "id", "name", "label", "provider", "lifecycle",
              "providerConversationId", "recipientIgsid", "recipientDisplayName",
              "instagramAccountId", "createdBySource", "createdByWorkspaceMemberId",
              "createdByName", "createdByContext", "updatedBySource",
              "updatedByWorkspaceMemberId", "updatedByName", "updatedByContext"
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17
            )
          `,
            [
              conversationRecordId,
              displayName,
              displayName,
              'UNIPILE',
              'ACTIVE',
              input.chat.chatId,
              input.chat.attendeeProviderId,
              input.chat.name,
              input.binding.workspaceInstagramAccountRecordId,
              FieldActorSource.SYSTEM,
              null,
              'System',
              {},
              FieldActorSource.SYSTEM,
              null,
              'System',
              {},
            ],
            undefined,
            queryOptions,
          );

          return initializeSourceContact(conversationRecordId);
        });
      }, this.systemContext(input.workspace)),
    );
  }

  async upsertVerifiedMessage(
    input: UnipileInstagramMessageProjectionInput,
  ): Promise<{
    messageRecordId: string;
    conversationRecordId: string;
    wasInserted: boolean;
    originalCreatedAt: string;
    direction: MessageDirection;
    deliveryState: DeliveryState;
  }> {
    this.assertVerifiedMessage(input);
    const direction = this.messageDirection(input);
    const requestedDeliveryState =
      input.deliveryState ?? this.defaultDeliveryState(direction);
    const requestedDeliveryStateUpdatedAt =
      input.deliveryStateUpdatedAt ?? input.message.timestamp;

    return this.withActiveBinding(input, () =>
      this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(input.workspace.id);
        return this.inTransaction(dataSource, async (querySource) => {
          await querySource.query(
            'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
            [input.conversationRecordId, input.message.messageId],
            undefined,
            queryOptions,
          );

          // Recognized message persistence follows marker -> source advisory ->
          // source-row/FK locks. Replays take the same locks so a concurrent
          // first persistence cannot choose the opposite order.
          if (direction !== 'UNKNOWN' && input.sourceGenerationId) {
            await this.myahInboxContactTriageReceiptService.lockMigrationMarkerForSourcePersistenceInTransaction(
              querySource.manager,
            );
            await querySource.query(
              MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
              [
                buildMyahInboxSourceKey(
                  'INSTAGRAM_CONVERSATION',
                  input.conversationRecordId,
                ),
              ],
              undefined,
              queryOptions,
            );
          }

          const conversations = await querySource.query<ConversationRecord[]>(
            `
            SELECT "id"
            FROM "${schemaName}"."_myahSocialConversation"
            WHERE "id" = $1
              AND "instagramAccountId" = $2
              AND "provider" = $3
              AND "providerConversationId" = $4
              AND "deletedAt" IS NULL
            LIMIT 2
            FOR UPDATE
          `,
            [
              input.conversationRecordId,
              input.binding.workspaceInstagramAccountRecordId,
              'UNIPILE',
              input.chat.chatId,
            ],
            undefined,
            queryOptions,
          );

          if (conversations.length !== 1) {
            throw new ConflictException(
              'Instagram conversation is not verified',
            );
          }

          const activeRecords = await querySource.query<MessageRecord[]>(
            `
            SELECT "id", "createdAt", "deliveryState", "deliveryStateUpdatedAt"
            FROM "${schemaName}"."_myahSocialMessage"
            WHERE "conversationId" = $1
              AND "provider" = $2
              AND "providerMessageId" = $3
              AND "deletedAt" IS NULL
            LIMIT 2
          `,
            [input.conversationRecordId, 'UNIPILE', input.message.messageId],
            undefined,
            queryOptions,
          );

          if (activeRecords.length > 1) {
            throw new ConflictException('Instagram message is ambiguous');
          }

          if (activeRecords.length === 1) {
            const [record] = activeRecords;
            const deliveryState = this.nextDeliveryState(
              record,
              requestedDeliveryState,
              requestedDeliveryStateUpdatedAt,
            );
            const deliveryStateUpdatedAt =
              deliveryState !== record.deliveryState
                ? requestedDeliveryStateUpdatedAt
                : record.deliveryStateUpdatedAt;

            await this.updateMessage(
              querySource,
              schemaName,
              record.id,
              input,
              direction,
              deliveryState,
              deliveryStateUpdatedAt,
            );

            return {
              messageRecordId: record.id,
              conversationRecordId: input.conversationRecordId,
              wasInserted: false,
              originalCreatedAt: this.toIsoString(record.createdAt),
              direction,
              deliveryState,
            };
          }

          const deletedRecords = await querySource.query<MessageRecord[]>(
            `
            SELECT "id", "createdAt", "deliveryState", "deliveryStateUpdatedAt"
            FROM "${schemaName}"."_myahSocialMessage"
            WHERE "conversationId" = $1
              AND "provider" = $2
              AND "providerMessageId" = $3
              AND "deletedAt" IS NOT NULL
            LIMIT 2
          `,
            [input.conversationRecordId, 'UNIPILE', input.message.messageId],
            undefined,
            queryOptions,
          );

          if (deletedRecords.length > 1) {
            throw new ConflictException(
              'Deleted Instagram message is ambiguous',
            );
          }

          if (deletedRecords.length === 1) {
            const [record] = deletedRecords;
            const deliveryState = this.nextDeliveryState(
              record,
              requestedDeliveryState,
              requestedDeliveryStateUpdatedAt,
            );
            const deliveryStateUpdatedAt =
              deliveryState !== record.deliveryState
                ? requestedDeliveryStateUpdatedAt
                : record.deliveryStateUpdatedAt;

            await this.restoreMessage(
              querySource,
              schemaName,
              record.id,
              input,
              direction,
              deliveryState,
              deliveryStateUpdatedAt,
            );

            return {
              messageRecordId: record.id,
              conversationRecordId: input.conversationRecordId,
              wasInserted: false,
              originalCreatedAt: this.toIsoString(record.createdAt),
              direction,
              deliveryState,
            };
          }

          const messageRecordId = randomUUID();

          const [insertedRecord] = await querySource.query<MessageRecord[]>(
            `
            INSERT INTO "${schemaName}"."_myahSocialMessage" (
              "id", "text", "conversationId", "direction", "sentVia", "provider",
              "providerMessageId", "providerCreatedAt", "deliveryState",
              "deliveryStateUpdatedAt", "hasAttachments", "attachmentCount",
              "createdBySource", "createdByWorkspaceMemberId", "createdByName",
              "createdByContext", "updatedBySource", "updatedByWorkspaceMemberId",
              "updatedByName", "updatedByContext"
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
              $17, $18, $19, $20
            ) RETURNING "id", "createdAt"
          `,
            [
              messageRecordId,
              input.message.text,
              input.conversationRecordId,
              direction,
              'UNIPILE',
              'UNIPILE',
              input.message.messageId,
              input.message.timestamp,
              requestedDeliveryState,
              requestedDeliveryStateUpdatedAt,
              input.message.hasAttachments,
              input.message.attachmentCount,
              FieldActorSource.SYSTEM,
              null,
              'System',
              {},
              FieldActorSource.SYSTEM,
              null,
              'System',
              {},
            ],
            undefined,
            queryOptions,
          );

          const result = {
            messageRecordId: insertedRecord?.id ?? messageRecordId,
            conversationRecordId: input.conversationRecordId,
            wasInserted: true,
            originalCreatedAt: this.toIsoString(
              insertedRecord?.createdAt ?? new Date(),
            ),
            direction,
            deliveryState: requestedDeliveryState,
          };

          await this.recordReceiptInTransaction(input, result, querySource);

          return result;
        });
      }, this.systemContext(input.workspace)),
    );
  }

  async markCompletedMessageSync(
    input: UnipileInstagramCompletedMessageSyncInput,
  ): Promise<void> {
    await this.withActiveBinding(input, () =>
      this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(input.workspace.id);

        // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
        // pi-lens-ignore: sql-injection
        await dataSource.query(
          `
            UPDATE "${schemaName}"."_myahSocialConversation"
            SET
              "completedMessageSyncAt" = $1,
              "updatedAt" = now(),
              "updatedBySource" = $2,
              "updatedByWorkspaceMemberId" = $3,
              "updatedByName" = $4,
              "updatedByContext" = $5
            WHERE "id" = $6
              AND "deletedAt" IS NULL
              AND ("completedMessageSyncAt" IS NULL OR "completedMessageSyncAt" <= $1)
          `,
          [
            input.completedMessageSyncAt,
            FieldActorSource.SYSTEM,
            null,
            'System',
            {},
            input.conversationRecordId,
          ],
          undefined,
          queryOptions,
        );
      }, this.systemContext(input.workspace)),
    );
  }

  async markCompletedChatSync(
    input: UnipileInstagramCompletedChatSyncInput,
  ): Promise<void> {
    await this.withActiveBinding(input, () =>
      this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(input.workspace.id);

        // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
        // pi-lens-ignore: sql-injection
        await dataSource.query(
          `
            UPDATE "${schemaName}"."_myahInstagramAccount"
            SET
              "completedChatSyncAt" = $1,
              "updatedAt" = now(),
              "updatedBySource" = $2,
              "updatedByWorkspaceMemberId" = $3,
              "updatedByName" = $4,
              "updatedByContext" = $5
            WHERE "id" = $6
              AND "status" = 'ACTIVE'
              AND "deletedAt" IS NULL
              AND ("completedChatSyncAt" IS NULL OR "completedChatSyncAt" <= $1)
          `,
          [
            input.completedChatSyncAt,
            FieldActorSource.SYSTEM,
            null,
            'System',
            {},
            input.workspaceInstagramAccountRecordId,
          ],
          undefined,
          queryOptions,
        );
      }, this.systemContext(input.workspace)),
    );
  }

  private async recordReceiptInTransaction(
    input: UnipileInstagramMessageProjectionInput,
    result: {
      messageRecordId: string;
      conversationRecordId: string;
      wasInserted: boolean;
      originalCreatedAt: string;
      direction: MessageDirection;
    },
    querySource: WorkspaceQueryExecutor,
  ): Promise<void> {
    if (
      !result.wasInserted ||
      result.direction === 'UNKNOWN' ||
      !input.sourceGenerationId
    ) {
      return;
    }

    // The caller already holds marker, source-advisory, and conversation-row
    // locks. Receipt insertion and tuple initialization are therefore reentrant
    // continuations of the canonical producer lock order.
    await this.myahInboxContactTriageReceiptService.recordInTransaction(
      {
        channel: 'INSTAGRAM',
        persistedMessageId: result.messageRecordId,
        sourceRecordId: result.conversationRecordId,
        sourceGenerationId: input.sourceGenerationId,
        mode: input.triageMode ?? 'BACKFILL',
        direction: result.direction,
        providerOccurredAt: input.message.timestamp,
        originalCreatedAt: result.originalCreatedAt,
        firstPersistence: true,
      },
      querySource.manager,
    );
    await this.myahInboxContactTriageService.ensureSourceContactInTransaction({
      sourceType: 'INSTAGRAM_CONVERSATION',
      sourceRecordId: result.conversationRecordId,
      initialDirection: result.direction,
      manager: querySource.manager,
    });
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private async withActiveBinding<T>(
    input: {
      workspace: WorkspaceIdentity;
      binding: UnipileInstagramProjectionBinding;
    },
    operation: () => Promise<T>,
  ): Promise<T> {
    const { binding } = input;

    if (binding.workspaceId !== input.workspace.id) {
      throw new ConflictException(
        'Instagram account binding workspace is invalid',
      );
    }

    return this.accountFinalizationLock.withLock(
      {
        workspaceId: binding.workspaceId,
        unipileAccountId: binding.unipileAccountId,
        instagramUserId: binding.instagramUserId,
      },
      async (manager) => {
        const activeBinding = await manager
          .getRepository(UnipileInstagramAccountBindingEntity)
          .findOne({
            where: {
              id: binding.id,
              workspaceId: binding.workspaceId,
              workspaceInstagramAccountRecordId:
                binding.workspaceInstagramAccountRecordId,
              unipileAccountId: binding.unipileAccountId,
              instagramUserId: binding.instagramUserId,
              status: UnipileInstagramAccountBindingStatus.ACTIVE,
              deactivatedAt: IsNull(),
            },
          });

        if (!activeBinding) {
          throw new ConflictException(
            'Instagram account binding is no longer active',
          );
        }

        return operation();
      },
    );
  }

  private async inTransaction<T>(
    dataSource: GlobalWorkspaceDataSource,
    callback: (querySource: WorkspaceQueryExecutor) => Promise<T>,
  ): Promise<T> {
    if (typeof dataSource.transaction !== 'function') {
      return callback({
        query: dataSource.query.bind(dataSource),
        manager: dataSource.manager as WorkspaceEntityManager,
      });
    }

    return dataSource.transaction((manager) =>
      callback({
        query: (query, parameters) =>
          dataSource.query(
            query,
            parameters,
            manager.queryRunner,
            queryOptions,
          ),
        manager: manager as WorkspaceEntityManager,
      }),
    );
  }

  private async updateConversation(
    dataSource: WorkspaceQueryExecutor,
    schemaName: string,
    id: string,
    input: UnipileInstagramChatProjectionInput,
  ): Promise<void> {
    const displayName = input.chat.name ?? input.chat.attendeeProviderId;

    // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
    // pi-lens-ignore: sql-injection
    await dataSource.query(
      `
        UPDATE "${schemaName}"."_myahSocialConversation"
        SET
          "recipientIgsid" = $1,
          "recipientDisplayName" = $2,
          "name" = $3,
          "label" = $4,
          "lifecycle" = $5,
          "updatedAt" = now(),
          "updatedBySource" = $6,
          "updatedByWorkspaceMemberId" = $7,
          "updatedByName" = $8,
          "updatedByContext" = $9
        WHERE "id" = $10
      `,
      [
        input.chat.attendeeProviderId,
        input.chat.name,
        displayName,
        displayName,
        'ACTIVE',
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        id,
      ],
      undefined,
      queryOptions,
    );
  }

  private async restoreConversation(
    dataSource: WorkspaceQueryExecutor,
    schemaName: string,
    id: string,
    input: UnipileInstagramChatProjectionInput,
  ): Promise<void> {
    const displayName = input.chat.name ?? input.chat.attendeeProviderId;

    // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
    // pi-lens-ignore: sql-injection
    await dataSource.query(
      `
        UPDATE "${schemaName}"."_myahSocialConversation"
        SET
          "deletedAt" = NULL,
          "recipientIgsid" = $1,
          "recipientDisplayName" = $2,
          "name" = $3,
          "label" = $4,
          "lifecycle" = $5,
          "updatedAt" = now(),
          "updatedBySource" = $6,
          "updatedByWorkspaceMemberId" = $7,
          "updatedByName" = $8,
          "updatedByContext" = $9
        WHERE "id" = $10
      `,
      [
        input.chat.attendeeProviderId,
        input.chat.name,
        displayName,
        displayName,
        'ACTIVE',
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        id,
      ],
      undefined,
      queryOptions,
    );
  }

  private async updateMessage(
    dataSource: WorkspaceQueryExecutor,
    schemaName: string,
    id: string,
    input: UnipileInstagramMessageProjectionInput,
    direction: MessageDirection,
    deliveryState: DeliveryState,
    deliveryStateUpdatedAt: Date | string | null,
  ): Promise<void> {
    // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
    // pi-lens-ignore: sql-injection
    await dataSource.query(
      `
        UPDATE "${schemaName}"."_myahSocialMessage"
        SET
          "text" = $1,
          "direction" = $2,
          "sentVia" = $3,
          "providerCreatedAt" = $4,
          "deliveryState" = $5,
          "deliveryStateUpdatedAt" = $6,
          "hasAttachments" = $7,
          "attachmentCount" = $8,
          "updatedAt" = now(),
          "updatedBySource" = $9,
          "updatedByWorkspaceMemberId" = $10,
          "updatedByName" = $11,
          "updatedByContext" = $12
        WHERE "id" = $13
      `,
      [
        input.message.text,
        direction,
        'UNIPILE',
        input.message.timestamp,
        deliveryState,
        deliveryStateUpdatedAt,
        input.message.hasAttachments,
        input.message.attachmentCount,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        id,
      ],
      undefined,
      queryOptions,
    );
  }

  private async restoreMessage(
    dataSource: WorkspaceQueryExecutor,
    schemaName: string,
    id: string,
    input: UnipileInstagramMessageProjectionInput,
    direction: MessageDirection,
    deliveryState: DeliveryState,
    deliveryStateUpdatedAt: Date | string | null,
  ): Promise<void> {
    // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
    // pi-lens-ignore: sql-injection
    await dataSource.query(
      `
        UPDATE "${schemaName}"."_myahSocialMessage"
        SET
          "deletedAt" = NULL,
          "text" = $1,
          "direction" = $2,
          "sentVia" = $3,
          "providerCreatedAt" = $4,
          "deliveryState" = $5,
          "deliveryStateUpdatedAt" = $6,
          "hasAttachments" = $7,
          "attachmentCount" = $8,
          "updatedAt" = now(),
          "updatedBySource" = $9,
          "updatedByWorkspaceMemberId" = $10,
          "updatedByName" = $11,
          "updatedByContext" = $12
        WHERE "id" = $13
      `,
      [
        input.message.text,
        direction,
        'UNIPILE',
        input.message.timestamp,
        deliveryState,
        deliveryStateUpdatedAt,
        input.message.hasAttachments,
        input.message.attachmentCount,
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        id,
      ],
      undefined,
      queryOptions,
    );
  }

  private assertVerifiedChat(input: UnipileInstagramChatProjectionInput): void {
    if (
      input.binding.workspaceId !== input.workspace.id ||
      input.binding.status !== 'ACTIVE' ||
      input.binding.deactivatedAt !== null ||
      input.chat.accountId !== input.binding.unipileAccountId ||
      input.chat.accountType !== 'INSTAGRAM' ||
      input.chat.type !== 'ONE_TO_ONE' ||
      !input.chat.chatId ||
      !input.chat.attendeeProviderId
    ) {
      throw new ConflictException('Instagram chat is not verified');
    }
  }

  private assertVerifiedMessage(
    input: UnipileInstagramMessageProjectionInput,
  ): void {
    this.assertVerifiedChat(input);

    if (
      input.message.accountId !== input.binding.unipileAccountId ||
      input.message.chatId !== input.chat.chatId ||
      !input.message.messageId ||
      !input.message.senderId ||
      hasContradictoryUnipileInstagramSenderEvidence(
        input.message,
        input.binding.instagramUserId,
        input.chat.attendeeProviderId,
      ) ||
      !Number.isInteger(input.message.attachmentCount) ||
      input.message.attachmentCount < 0
    ) {
      throw new ConflictException('Instagram message is not verified');
    }
  }

  private messageDirection(
    input: UnipileInstagramMessageProjectionInput,
  ): MessageDirection {
    return unipileInstagramMessageDirection(
      input.message,
      input.binding.instagramUserId,
      input.chat.attendeeProviderId,
    );
  }

  private defaultDeliveryState(direction: MessageDirection): DeliveryState {
    switch (direction) {
      case 'INBOUND':
        return 'RECEIVED';
      case 'OUTBOUND':
        return 'SENT';
      case 'UNKNOWN':
        return 'UNKNOWN';
    }
  }

  private nextDeliveryState(
    existing: MessageRecord,
    requested: DeliveryState,
    requestedUpdatedAt: string | null,
  ): DeliveryState {
    if (!existing.deliveryState) {
      return requested;
    }

    if (
      deliveryRank[requested] > deliveryRank[existing.deliveryState] &&
      this.isNotOlder(requestedUpdatedAt, existing.deliveryStateUpdatedAt)
    ) {
      return requested;
    }

    return existing.deliveryState;
  }

  private isNotOlder(
    incoming: string | null,
    existing: Date | string | null,
  ): boolean {
    if (!incoming) {
      return false;
    }

    if (!existing) {
      return true;
    }

    const incomingTime = new Date(incoming).getTime();
    const existingTime = new Date(existing).getTime();

    return (
      Number.isFinite(incomingTime) &&
      Number.isFinite(existingTime) &&
      incomingTime >= existingTime
    );
  }

  private systemContext(workspace: WorkspaceIdentity) {
    return buildSystemAuthContext({
      workspace: workspace as NonNullable<RawAuthContext['workspace']>,
    });
  }
}
