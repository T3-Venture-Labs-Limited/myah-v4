import { createHash, randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FieldActorSource } from 'twenty-shared/types';

import { type Repository } from 'typeorm';

import { InstagramReplyApprovalRequestEntity } from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-approval-request.entity';
import { InstagramReplyExecutionState } from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-execution-receipt.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  buildInstagramComposioUserId,
  MyahComposioService,
} from 'src/modules/myah-composio/services/myah-composio.service';

const COMPOSIO_API_BASE_URL = 'https://backend.composio.dev/api/v3.1';
const INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG = 'INSTAGRAM_LIST_ALL_MESSAGES';
const INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG = 'INSTAGRAM_SEND_TEXT_MESSAGE';
const OUTSIDE_MESSAGING_WINDOW_SUBCODE = '2534022';

type BoundInstagramReplyRecords = {
  draft: {
    id: string;
    body: string;
    sentAt: string | null;
  };
  conversation: {
    id: string;
    providerConversationId: string;
    recipientIgsid: string | null;
  };
};

type ComposioToolResponse = {
  data?: unknown;
  error?:
    | string
    | {
        message?: string;
        code?: string | number;
        error_subcode?: string | number;
      };
  message?: string;
  successful?: boolean;
  successfull?: boolean;
};

export class InstagramReplyExecutionError extends Error {
  constructor(
    message: string,
    readonly state: Exclude<
      InstagramReplyExecutionState,
      InstagramReplyExecutionState.PROCESSING
    >,
    readonly code: string,
  ) {
    super(message);
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

const getComposioApiKey = (): string | undefined => {
  const value = process.env.COMPOSIO_API_KEY?.trim();

  return value || undefined;
};

const extractProviderError = (
  body: ComposioToolResponse,
): {
  message: string;
  code: string;
} => {
  const error = body.error;
  const errorSubcode =
    typeof error === 'string' ? undefined : error?.error_subcode;

  return {
    message: 'Instagram provider request failed.',
    code:
      String(errorSubcode) === OUTSIDE_MESSAGING_WINDOW_SUBCODE
        ? OUTSIDE_MESSAGING_WINDOW_SUBCODE
        : 'PROVIDER_REQUEST_FAILED',
  };
};

const extractItems = (value: unknown): Record<string, unknown>[] => {
  const record = asRecord(value);

  if (!record) {
    return [];
  }

  const candidates = [record.data, record.items, asRecord(record.data)?.data];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.flatMap((item) => {
        const itemRecord = asRecord(item);

        return itemRecord ? [itemRecord] : [];
      });
    }
  }

  return [];
};

const hasInboundMessageFromRecipient = ({
  data,
  recipientIgsid,
}: {
  data: unknown;
  recipientIgsid: string;
}): boolean =>
  extractItems(data).some((message) => {
    const from = asRecord(message.from);
    const sender = asRecord(message.sender);
    const direction =
      typeof message.direction === 'string' ? message.direction : '';
    const senderId =
      (typeof from?.id === 'string' ? from.id : undefined) ??
      (typeof sender?.id === 'string' ? sender.id : undefined);

    return (
      senderId === recipientIgsid &&
      (direction === '' || direction.toUpperCase() === 'INBOUND')
    );
  });

const extractProviderMessageId = (value: unknown): string | undefined => {
  const record = asRecord(value);
  const data = asRecord(record?.data) ?? record;

  if (!data) {
    return undefined;
  }

  for (const key of ['message_id', 'messageId', 'id']) {
    if (typeof data[key] === 'string' && data[key].trim()) {
      return data[key].trim();
    }
  }

  return undefined;
};

@Injectable()
export class InstagramReplyExecutionService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly myahComposioService: MyahComposioService,
  ) {}

  async execute({
    workspaceId,
    approvalRequest,
  }: {
    workspaceId: string;
    approvalRequest: InstagramReplyApprovalRequestEntity;
  }): Promise<{ providerMessageId: string | null }> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });

    if (!workspace) {
      throw new InstagramReplyExecutionError(
        'Workspace is unavailable for the Instagram reply.',
        InstagramReplyExecutionState.FAILED,
        'WORKSPACE_NOT_FOUND',
      );
    }

    const records = await this.loadBoundRecords({
      workspace: workspace as unknown as FlatWorkspace,
      draftId: approvalRequest.draftId,
      conversationId: approvalRequest.conversationId,
    });
    const text = records.draft.body;

    if (
      !text.trim() ||
      createHash('sha256').update(text).digest('hex') !==
        approvalRequest.previewTextSha256
    ) {
      throw new InstagramReplyExecutionError(
        'The draft changed after approval and was not sent.',
        InstagramReplyExecutionState.FAILED,
        'APPROVAL_BINDING_MISMATCH',
      );
    }

    if (records.draft.sentAt) {
      throw new InstagramReplyExecutionError(
        'This Instagram reply draft has already been sent.',
        InstagramReplyExecutionState.FAILED,
        'DRAFT_ALREADY_SENT',
      );
    }

    if (!records.conversation.recipientIgsid?.trim()) {
      throw new InstagramReplyExecutionError(
        'The conversation has no verified Instagram recipient.',
        InstagramReplyExecutionState.FAILED,
        'RECIPIENT_NOT_FOUND',
      );
    }

    const account = await this.myahComposioService.getActiveInstagramAccount({
      workspaceId,
      connectedAccountId: approvalRequest.connectedAccountId,
    });
    if (account.connectedAccountId !== approvalRequest.connectedAccountId) {
      throw new InstagramReplyExecutionError(
        'The approved Instagram account is no longer the active account.',
        InstagramReplyExecutionState.FAILED,
        'APPROVAL_BINDING_MISMATCH',
      );
    }
    const verification = await this.executeComposioTool({
      workspaceId,
      connectedAccountId: account.connectedAccountId,
      toolSlug: INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
      arguments: {
        conversation_id: records.conversation.providerConversationId,
        limit: 25,
      },
    });

    if (
      !hasInboundMessageFromRecipient({
        data: verification,
        recipientIgsid: records.conversation.recipientIgsid,
      })
    ) {
      throw new InstagramReplyExecutionError(
        'The provider could not verify an inbound message for this recipient.',
        InstagramReplyExecutionState.FAILED,
        'INBOUND_MESSAGE_NOT_VERIFIED',
      );
    }

    const response = await this.executeComposioTool({
      workspaceId,
      connectedAccountId: account.connectedAccountId,
      toolSlug: INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG,
      arguments: {
        recipient_id: records.conversation.recipientIgsid,
        text,
      },
    });
    const providerMessageId = extractProviderMessageId(response);

    if (!providerMessageId) {
      throw new InstagramReplyExecutionError(
        'Instagram provider delivery status is unknown; the draft was not marked sent.',
        InstagramReplyExecutionState.UNKNOWN,
        'PROVIDER_MESSAGE_ID_MISSING',
      );
    }

    await this.persistSentReply({
      workspace: workspace as unknown as FlatWorkspace,
      draftId: records.draft.id,
      text,
      providerMessageId,
    });

    return { providerMessageId };
  }

  private async loadBoundRecords({
    workspace,
    draftId,
    conversationId,
  }: {
    workspace: FlatWorkspace;
    draftId: string;
    conversationId: string;
  }): Promise<BoundInstagramReplyRecords> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);
        const [draft] = await dataSource.query<
          BoundInstagramReplyRecords['draft'][]
        >(
          `
            SELECT "id", "body", "sentAt"
            FROM "${schemaName}"."_myahInstagramReplyDraft"
            WHERE "id" = $1
              AND "deletedAt" IS NULL
          `,
          [draftId],
          undefined,
          { shouldBypassPermissionChecks: true },
        );
        const [conversation] = await dataSource.query<
          BoundInstagramReplyRecords['conversation'][]
        >(
          `
              SELECT "id", "providerConversationId", "recipientIgsid"
              FROM "${schemaName}"."_myahSocialConversation"
              WHERE "id" = $1
                AND "deletedAt" IS NULL
            `,
          [conversationId],
          undefined,
          { shouldBypassPermissionChecks: true },
        );

        if (!draft || !conversation) {
          throw new InstagramReplyExecutionError(
            'The approved Instagram reply records are no longer available.',
            InstagramReplyExecutionState.FAILED,
            'APPROVAL_RECORD_NOT_FOUND',
          );
        }

        return { draft, conversation };
      },
      buildSystemAuthContext({ workspace }),
    );
  }

  private async persistSentReply({
    workspace,
    draftId,
    text,
    providerMessageId,
  }: {
    workspace: FlatWorkspace;
    draftId: string;
    text: string;
    providerMessageId: string;
  }): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const dataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
      const schemaName = getWorkspaceSchemaName(workspace.id);
      const updateResult = await dataSource.query<{ id: string }[]>(
        `
            UPDATE "${schemaName}"."_myahInstagramReplyDraft"
            SET "status" = 'SENT', "sentAt" = NOW(), "updatedAt" = NOW()
            WHERE "id" = $1
              AND "body" = $2
              AND "sentAt" IS NULL
            RETURNING "id"
          `,
        [draftId, text],
        undefined,
        { shouldBypassPermissionChecks: true },
      );
      // TypeORM's PostgreSQL driver returns UPDATE ... RETURNING results as
      // [records, affectedRowCount], unlike SELECT which returns records.
      const [updatedDrafts] = updateResult as [{ id: string }[], number];

      if (updatedDrafts.length !== 1) {
        throw new InstagramReplyExecutionError(
          'The draft changed while sending and needs review.',
          InstagramReplyExecutionState.UNKNOWN,
          'DRAFT_CHANGED_DURING_SEND',
        );
      }

      await dataSource.query(
        `
            INSERT INTO "${schemaName}"."_myahSocialMessage" (
              "id",
              "text",
              "direction",
              "sentVia",
              "providerMessageId",
              "createdAt",
              "updatedAt",
              "createdBySource",
              "createdByWorkspaceMemberId",
              "createdByName",
              "createdByContext",
              "updatedBySource",
              "updatedByWorkspaceMemberId",
              "updatedByName",
              "updatedByContext"
            )
            VALUES (
              $1, $2, 'OUTBOUND', 'COMPOSIO', $3, NOW(), NOW(),
              $4, $5, $6, $7, $8, $9, $10, $11
            )
          `,
        [
          randomUUID(),
          text,
          providerMessageId,
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
        { shouldBypassPermissionChecks: true },
      );
    }, buildSystemAuthContext({ workspace }));
  }

  private async executeComposioTool({
    workspaceId,
    connectedAccountId,
    toolSlug,
    arguments: toolArguments,
  }: {
    workspaceId: string;
    connectedAccountId: string;
    toolSlug:
      | typeof INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG
      | typeof INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG;
    arguments: Record<string, string | number>;
  }): Promise<unknown> {
    const apiKey = getComposioApiKey();

    if (!apiKey) {
      throw new InstagramReplyExecutionError(
        'Instagram provider access is not configured.',
        InstagramReplyExecutionState.FAILED,
        'COMPOSIO_NOT_CONFIGURED',
      );
    }

    let response: Response;

    try {
      response = await fetch(
        `${COMPOSIO_API_BASE_URL}/tools/execute/${toolSlug}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            connected_account_id: connectedAccountId,
            user_id: buildInstagramComposioUserId(workspaceId),
            arguments: toolArguments,
          }),
        },
      );
    } catch {
      throw new InstagramReplyExecutionError(
        'Instagram provider connectivity is unknown; the reply was not retried.',
        InstagramReplyExecutionState.UNKNOWN,
        'PROVIDER_TRANSPORT_UNKNOWN',
      );
    }

    let body: ComposioToolResponse;

    try {
      body = (await response.json()) as ComposioToolResponse;
    } catch {
      throw new InstagramReplyExecutionError(
        'Instagram provider returned an invalid response.',
        InstagramReplyExecutionState.UNKNOWN,
        'PROVIDER_RESPONSE_UNKNOWN',
      );
    }

    if (
      !response.ok ||
      body.error ||
      body.successful === false ||
      body.successfull === false
    ) {
      const providerError = extractProviderError(body);
      const state =
        providerError.code === OUTSIDE_MESSAGING_WINDOW_SUBCODE
          ? InstagramReplyExecutionState.BLOCKED
          : InstagramReplyExecutionState.FAILED;

      throw new InstagramReplyExecutionError(
        providerError.message,
        state,
        providerError.code,
      );
    }

    return body.data ?? body;
  }
}
