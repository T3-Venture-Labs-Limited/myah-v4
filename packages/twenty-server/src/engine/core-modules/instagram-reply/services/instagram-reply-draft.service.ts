import { createHash, randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FieldActorSource } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
  MyahComposioService,
} from 'src/modules/myah-composio/services/myah-composio.service';

export type PrepareInstagramReplyDraftInput = {
  workspaceId: string;
  userWorkspaceId: string;
  connectedAccountId: string;
  providerConversationId: string;
  recipientIgsid: string;
  recipientLabel: string;
  inboundMessageId: string;
  body: string;
};

type PreparedInstagramReplyDraft = {
  connectedAccountId: string;
  conversationId: string;
  draftId: string;
  body: string;
};

type ApprovalBindingInput = {
  workspaceId: string;
  connectedAccountId: string;
  conversationId: string;
  draftId: string;
  previewTextSha256: string;
  providerConversationId: string;
  recipientIgsid: string;
};

type ApprovalDetailsInput = {
  workspaceId: string;
  connectedAccountId: string;
  conversationId: string;
  draftId: string;
};

export type InstagramReplyApprovalDetails = {
  body: string;
  draftLabel: string;
  conversationLabel: string;
  providerConversationId: string;
  recipientIgsid: string;
};

type ConversationRecord = {
  id: string;
  recipientIgsid: string | null;
};
type TrustedInboundMessage = {
  id: string;
  text: string;
  createdAt: Date;
  recipientIgsids: string[];
  direction?: string;
};

@Injectable()
export class InstagramReplyDraftService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly myahComposioService: MyahComposioService,
  ) {}

  async prepare(
    input: PrepareInstagramReplyDraftInput,
  ): Promise<PreparedInstagramReplyDraft> {
    const workspace = await this.getWorkspace(input.workspaceId);
    const body = input.body.trim();
    const recipientLabel = input.recipientLabel.trim();
    const providerConversationId = input.providerConversationId.trim();
    const recipientIgsid = input.recipientIgsid.trim();
    const inboundMessageId = input.inboundMessageId.trim();

    if (
      !body ||
      !recipientLabel ||
      !providerConversationId ||
      !recipientIgsid ||
      !inboundMessageId
    ) {
      throw new Error('Instagram reply draft details are incomplete.');
    }

    const inboundMessage = await this.loadTrustedInboundMessage({
      workspaceId: input.workspaceId,
      connectedAccountId: input.connectedAccountId,
      providerConversationId,
      recipientIgsid,
      inboundMessageId,
    });

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);

        return dataSource.transaction(async (manager) => {
          const activeAccounts = await manager.query<
            { id: string; igUserId: string | null }[]
          >(
            `
              SELECT "id", "igUserId"
              FROM "${schemaName}"."_myahInstagramAccount"
              WHERE "connectedAccountId" = $1
                AND "status" = 'ACTIVE'
                AND "deletedAt" IS NULL
              LIMIT 2
            `,
            [input.connectedAccountId],
          );

          if (activeAccounts.length !== 1) {
            throw new Error(
              'The selected Instagram account is not the workspace active account.',
            );
          }
          const [account] = activeAccounts;

          const conversations = await manager.query<ConversationRecord[]>(
            `
              SELECT "id", "recipientIgsid"
              FROM "${schemaName}"."_myahSocialConversation"
              WHERE "providerConversationId" = $1
                AND "instagramAccountId" = $2
                AND "deletedAt" IS NULL
              LIMIT 2
            `,
            [providerConversationId, account.id],
          );

          let conversationId: string;

          if (conversations.length > 1) {
            throw new Error('The Instagram conversation is ambiguous.');
          }

          if (conversations.length === 1) {
            const [conversation] = conversations;

            if (conversation.recipientIgsid !== recipientIgsid) {
              throw new Error(
                'The Instagram conversation recipient does not match the live read.',
              );
            }

            conversationId = conversation.id;
            await manager.query(
              `
                UPDATE "${schemaName}"."_myahSocialConversation"
                SET "name" = $2, "label" = $2, "updatedAt" = NOW()
                WHERE "id" = $1
              `,
              [conversationId, recipientLabel],
            );
          } else {
            conversationId = randomUUID();
            await manager.query(
              `
                INSERT INTO "${schemaName}"."_myahSocialConversation" (
                  "id",
                  "name",
                  "label",
                  "providerConversationId",
                  "recipientIgsid",
                  "instagramAccountId",
                  "createdBySource",
                  "createdByWorkspaceMemberId",
                  "createdByName",
                  "createdByContext",
                  "updatedBySource",
                  "updatedByWorkspaceMemberId",
                  "updatedByName",
                  "updatedByContext"
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                )
              `,
              [
                conversationId,
                recipientLabel,
                recipientLabel,
                providerConversationId,
                recipientIgsid,
                account.id,
                FieldActorSource.AGENT,
                input.userWorkspaceId,
                'Myah Agent',
                {},
                FieldActorSource.AGENT,
                input.userWorkspaceId,
                'Myah Agent',
                {},
              ],
            );
          }
          if (
            !account.igUserId ||
            !inboundMessage.recipientIgsids.includes(account.igUserId) ||
            (inboundMessage.direction && inboundMessage.direction !== 'INBOUND')
          ) {
            throw new Error(
              'The inbound Instagram message could not be verified.',
            );
          }

          const existingMessages = await manager.query<
            {
              id: string;
              direction: string;
              providerCreatedAt: Date | string | null;
            }[]
          >(
            `
              SELECT "id", "direction", "providerCreatedAt"
              FROM "${schemaName}"."_myahSocialMessage"
              WHERE "conversationId" = $1
                AND "providerMessageId" = $2
                AND "deletedAt" IS NULL
              LIMIT 2
            `,
            [conversationId, inboundMessage.id],
          );
          if (existingMessages.length > 1) {
            throw new Error('The inbound Instagram message is ambiguous.');
          }
          if (
            existingMessages.length === 1 &&
            (existingMessages[0].direction !== 'INBOUND' ||
              !existingMessages[0].providerCreatedAt ||
              new Date(existingMessages[0].providerCreatedAt).getTime() !==
                inboundMessage.createdAt.getTime())
          ) {
            throw new Error('The inbound Instagram message no longer matches.');
          }
          if (existingMessages.length === 0) {
            await manager.query(
              `
                INSERT INTO "${schemaName}"."_myahSocialMessage" (
                  "id", "text", "conversationId", "direction", "sentVia",
                  "providerMessageId", "providerCreatedAt", "createdAt", "updatedAt",
                  "createdBySource", "createdByWorkspaceMemberId", "createdByName", "createdByContext",
                  "updatedBySource", "updatedByWorkspaceMemberId", "updatedByName", "updatedByContext"
                ) VALUES (
                  $1, $2, $3, 'INBOUND', 'COMPOSIO', $4, $5, NOW(), NOW(),
                  $6, $7, 'Myah Agent', $8::jsonb, $6, $7, 'Myah Agent', $8::jsonb
                )
              `,
              [
                randomUUID(),
                inboundMessage.text,
                conversationId,
                inboundMessage.id,
                inboundMessage.createdAt,
                FieldActorSource.AGENT,
                input.userWorkspaceId,
                JSON.stringify({ providerConversationId }),
              ],
            );
          }

          const draftId = randomUUID();
          await manager.query(
            `
              INSERT INTO "${schemaName}"."_myahInstagramReplyDraft" (
                "id",
                "name",
                "title",
                "body",
                "conversationId",
                "status",
                "source",
                "generatedAt",
                "createdBySource",
                "createdByWorkspaceMemberId",
                "createdByName",
                "createdByContext",
                "updatedBySource",
                "updatedByWorkspaceMemberId",
                "updatedByName",
                "updatedByContext"
              ) VALUES (
                $1, $2, $3, $4, $5, 'NEEDS_REVIEW', 'AI', NOW(),
                $6, $7, $8, $9, $10, $11, $12, $13
              )
            `,
            [
              draftId,
              `Reply to ${recipientLabel}`,
              `Reply to ${recipientLabel}`,
              body,
              conversationId,
              FieldActorSource.AGENT,
              input.userWorkspaceId,
              'Myah Agent',
              {},
              FieldActorSource.AGENT,
              input.userWorkspaceId,
              'Myah Agent',
              {},
            ],
          );

          return {
            connectedAccountId: input.connectedAccountId,
            conversationId,
            draftId,
            body,
          };
        });
      },
      buildSystemAuthContext({ workspace }),
    );
  }

  async getApprovalDetails(
    input: ApprovalDetailsInput,
  ): Promise<InstagramReplyApprovalDetails> {
    const workspace = await this.getWorkspace(input.workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);
        const [draft] = await dataSource.query<
          {
            body: string;
            name: string | null;
            sentAt: string | null;
            title: string | null;
          }[]
        >(
          `
            SELECT "body", "sentAt", "title", "name"
            FROM "${schemaName}"."_myahInstagramReplyDraft"
            WHERE "id" = $1
              AND "deletedAt" IS NULL
          `,
          [input.draftId],
          undefined,
          { shouldBypassPermissionChecks: true },
        );
        const [conversation] = await dataSource.query<
          {
            label: string | null;
            name: string | null;
            providerConversationId: string | null;
            recipientIgsid: string | null;
          }[]
        >(
          `
            SELECT "providerConversationId", "recipientIgsid", "label", "name"
            FROM "${schemaName}"."_myahSocialConversation"
            WHERE "id" = $1
              AND "deletedAt" IS NULL
          `,
          [input.conversationId],
          undefined,
          { shouldBypassPermissionChecks: true },
        );
        const activeAccounts = await dataSource.query<{ id: string }[]>(
          `
            SELECT "id"
            FROM "${schemaName}"."_myahInstagramAccount"
            WHERE "connectedAccountId" = $1
              AND "status" = 'ACTIVE'
              AND "deletedAt" IS NULL
            LIMIT 2
          `,
          [input.connectedAccountId],
          undefined,
          { shouldBypassPermissionChecks: true },
        );

        const draftLabel = draft?.title?.trim() || draft?.name?.trim();
        const conversationLabel =
          conversation?.label?.trim() || conversation?.name?.trim();

        if (!draft || draft.sentAt || !draft.body.trim() || !draftLabel) {
          throw new Error(
            'The Instagram reply draft is unavailable for approval.',
          );
        }

        if (
          !conversation?.providerConversationId?.trim() ||
          !conversation.recipientIgsid?.trim() ||
          !conversationLabel
        ) {
          throw new Error(
            'The Instagram conversation is unavailable for approval.',
          );
        }

        if (activeAccounts.length !== 1) {
          throw new Error(
            'The approved Instagram account is unavailable for approval.',
          );
        }

        return {
          body: draft.body,
          draftLabel,
          conversationLabel,
          providerConversationId: conversation.providerConversationId,
          recipientIgsid: conversation.recipientIgsid,
        };
      },
      buildSystemAuthContext({ workspace }),
    );
  }

  async validateApprovalBinding(input: ApprovalBindingInput): Promise<void> {
    const details = await this.getApprovalDetails(input);

    if (
      createHash('sha256').update(details.body).digest('hex') !==
      input.previewTextSha256
    ) {
      throw new Error(
        'The Instagram reply preview does not match the stored draft.',
      );
    }

    if (
      details.providerConversationId !== input.providerConversationId ||
      details.recipientIgsid !== input.recipientIgsid
    ) {
      throw new Error(
        'The Instagram conversation no longer matches the approved recipient.',
      );
    }
  }

  private async loadTrustedInboundMessage({
    workspaceId,
    connectedAccountId,
    providerConversationId,
    recipientIgsid,
    inboundMessageId,
  }: Pick<
    PrepareInstagramReplyDraftInput,
    | 'workspaceId'
    | 'connectedAccountId'
    | 'providerConversationId'
    | 'recipientIgsid'
    | 'inboundMessageId'
  >): Promise<TrustedInboundMessage> {
    await this.myahComposioService.getActiveInstagramAccount({
      workspaceId,
      connectedAccountId,
    });
    const proof = await this.myahComposioService.executeInstagramTool({
      workspaceId,
      connectedAccountId,
      toolSlug: INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
      arguments: { conversation_id: providerConversationId, limit: 25 },
    });
    if (
      proof.kind !== 'success' ||
      !proof.data ||
      typeof proof.data !== 'object'
    ) {
      throw new Error('The inbound Instagram message is unavailable.');
    }

    const record = proof.data as Record<string, unknown>;
    const nestedData =
      record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>).data
        : undefined;
    const messages = [record.data, record.items, nestedData].find(
      Array.isArray,
    );
    const message = messages?.find(
      (candidate): candidate is Record<string, unknown> =>
        !!candidate &&
        typeof candidate === 'object' &&
        candidate.id === inboundMessageId,
    );
    const sender =
      message?.from && typeof message.from === 'object'
        ? (message.from as Record<string, unknown>)
        : undefined;
    const recipient =
      message?.to && typeof message.to === 'object'
        ? (message.to as Record<string, unknown>)
        : undefined;
    const recipientIgsids = [
      recipient?.id,
      ...(Array.isArray(recipient?.data)
        ? recipient.data.map((value) =>
            value && typeof value === 'object'
              ? (value as Record<string, unknown>).id
              : undefined,
          )
        : []),
    ].filter((id): id is string => typeof id === 'string');
    const createdAt =
      typeof message?.created_time === 'string'
        ? new Date(message.created_time)
        : undefined;
    const direction =
      typeof message?.direction === 'string'
        ? message.direction.toUpperCase()
        : undefined;
    if (
      !message ||
      sender?.id !== recipientIgsid ||
      !recipientIgsids.length ||
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      (direction && direction !== 'INBOUND')
    ) {
      throw new Error('The inbound Instagram message is unavailable.');
    }

    return {
      id: inboundMessageId,
      text: typeof message.message === 'string' ? message.message : '',
      createdAt,
      recipientIgsids,
      direction,
    };
  }

  private async getWorkspace(workspaceId: string): Promise<FlatWorkspace> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });

    if (!workspace) {
      throw new Error('Workspace is unavailable for the Instagram reply.');
    }

    return workspace as unknown as FlatWorkspace;
  }
}
