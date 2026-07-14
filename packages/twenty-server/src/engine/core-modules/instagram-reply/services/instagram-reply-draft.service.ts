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

export type PrepareInstagramReplyDraftInput = {
  workspaceId: string;
  userWorkspaceId: string;
  connectedAccountId: string;
  providerConversationId: string;
  recipientIgsid: string;
  recipientLabel: string;
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
};

type ConversationRecord = {
  id: string;
  recipientIgsid: string | null;
};

@Injectable()
export class InstagramReplyDraftService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async prepare(
    input: PrepareInstagramReplyDraftInput,
  ): Promise<PreparedInstagramReplyDraft> {
    const workspace = await this.getWorkspace(input.workspaceId);
    const body = input.body.trim();
    const recipientLabel = input.recipientLabel.trim();
    const providerConversationId = input.providerConversationId.trim();
    const recipientIgsid = input.recipientIgsid.trim();

    if (!body || !recipientLabel || !providerConversationId || !recipientIgsid) {
      throw new Error('Instagram reply draft details are incomplete.');
    }

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);
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

        if (activeAccounts.length !== 1) {
          throw new Error(
            'The selected Instagram account is not the workspace active account.',
          );
        }

        const conversations = await dataSource.query<ConversationRecord[]>(
          `
            SELECT "id", "recipientIgsid"
            FROM "${schemaName}"."_myahSocialConversation"
            WHERE "providerConversationId" = $1
              AND "deletedAt" IS NULL
            LIMIT 2
          `,
          [providerConversationId],
          undefined,
          { shouldBypassPermissionChecks: true },
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
        } else {
          conversationId = randomUUID();
          await dataSource.query(
            `
              INSERT INTO "${schemaName}"."_myahSocialConversation" (
                "id",
                "name",
                "label",
                "providerConversationId",
                "recipientIgsid",
                "createdBySource",
                "createdByWorkspaceMemberId",
                "createdByName",
                "createdByContext",
                "updatedBySource",
                "updatedByWorkspaceMemberId",
                "updatedByName",
                "updatedByContext"
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
              )
            `,
            [
              conversationId,
              recipientLabel,
              recipientLabel,
              providerConversationId,
              recipientIgsid,
              FieldActorSource.AGENT,
              input.userWorkspaceId,
              'Myah Agent',
              {},
              FieldActorSource.AGENT,
              input.userWorkspaceId,
              'Myah Agent',
              {},
            ],
            undefined,
            { shouldBypassPermissionChecks: true },
          );
        }

        const draftId = randomUUID();
        await dataSource.query(
          `
            INSERT INTO "${schemaName}"."_myahInstagramReplyDraft" (
              "id",
              "name",
              "title",
              "body",
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
              $1, $2, $3, $4, 'NEEDS_REVIEW', 'AI', NOW(),
              $5, $6, $7, $8, $9, $10, $11, $12
            )
          `,
          [
            draftId,
            `Reply to ${recipientLabel}`,
            `Reply to ${recipientLabel}`,
            body,
            FieldActorSource.AGENT,
            input.userWorkspaceId,
            'Myah Agent',
            {},
            FieldActorSource.AGENT,
            input.userWorkspaceId,
            'Myah Agent',
            {},
          ],
          undefined,
          { shouldBypassPermissionChecks: true },
        );

        return {
          connectedAccountId: input.connectedAccountId,
          conversationId,
          draftId,
          body,
        };
      },
      buildSystemAuthContext({ workspace }),
    );
  }

  async validateApprovalBinding(input: ApprovalBindingInput): Promise<void> {
    const workspace = await this.getWorkspace(input.workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);
        const [draft] = await dataSource.query<
          { body: string; sentAt: string | null }[]
        >(
          `
            SELECT "body", "sentAt"
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
            providerConversationId: string | null;
            recipientIgsid: string | null;
          }[]
        >(
          `
            SELECT "providerConversationId", "recipientIgsid"
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

        if (!draft || draft.sentAt || !draft.body.trim()) {
          throw new Error('The Instagram reply draft is unavailable for approval.');
        }

        if (
          createHash('sha256').update(draft.body).digest('hex') !==
          input.previewTextSha256
        ) {
          throw new Error(
            'The Instagram reply preview does not match the stored draft.',
          );
        }

        if (
          !conversation?.providerConversationId?.trim() ||
          !conversation.recipientIgsid?.trim()
        ) {
          throw new Error('The Instagram conversation is unavailable for approval.');
        }

        if (activeAccounts.length !== 1) {
          throw new Error(
            'The approved Instagram account is unavailable for approval.',
          );
        }
      },
      buildSystemAuthContext({ workspace }),
    );
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
