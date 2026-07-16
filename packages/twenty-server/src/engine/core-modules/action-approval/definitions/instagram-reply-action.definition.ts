import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { z } from 'zod';

import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import {
  type ExpectedActionBindingWithWorkspace,
  type ActionEvidenceLinkInput,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

import { type Repository } from 'typeorm';

const INSTAGRAM_ACCOUNT_OBJECT_METADATA_ID =
  '2d357469-831a-4629-ad4b-47335900e883';
const SOCIAL_CONVERSATION_OBJECT_METADATA_ID =
  '36817464-855f-42db-9fbb-f8853643f8d6';
const INSTAGRAM_REPLY_DRAFT_OBJECT_METADATA_ID =
  '85762d24-541b-407f-9d6a-cdf89552c665';

export const InstagramReplyActionProposalInputZodSchema = z
  .object({ draftId: z.string().uuid() })
  .strict();

export type InstagramReplyActionProposalInput = z.infer<
  typeof InstagramReplyActionProposalInputZodSchema
>;

type InstagramReplySourceGraphRow = {
  draftId: string;
  draftBody: string;
  draftLabel: string | null;
  draftSentAt: string | null;
  conversationId: string;
  conversationLabel: string | null;
  providerConversationId: string | null;
  recipientIgsid: string | null;
  accountId: string;
  accountLabel: string | null;
  connectedAccountId: string | null;
  composioUserId: string | null;
};

export type CanonicalInstagramReplyGraph = {
  draftId: string;
  draftBody: string;
  conversationId: string;
  providerConversationId: string;
  recipientIgsid: string;
  account: {
    id: string;
    connectedAccountId: string;
    composioUserId: string;
  };
};

export type InstagramReplyActionAuthority = {
  expectedActionBinding: ExpectedActionBindingWithWorkspace;
  canonicalGraph: CanonicalInstagramReplyGraph;
};

export type InstagramReplyActionProposal = InstagramReplyActionAuthority & {
  proposal: {
    title: string;
    preview: { format: 'text'; content: string };
    targetLabel: string;
  };
};

@Injectable()
export class InstagramReplyActionDefinition {
  readonly actionName = 'send_instagram_reply' as const;
  readonly actionVersion = 1 as const;
  readonly proposalInputSchema = InstagramReplyActionProposalInputZodSchema;

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async propose({
    workspaceId,
    initiatorUserWorkspaceId,
    threadId,
    input,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    input: InstagramReplyActionProposalInput;
  }): Promise<InstagramReplyActionProposal> {
    const graph = await this.loadCanonicalGraph(workspaceId, input.draftId);
    const expectedActionBinding = this.buildExpectedActionBinding({
      workspaceId,
      initiatorUserWorkspaceId,
      threadId,
      graph,
    });

    return {
      expectedActionBinding,
      canonicalGraph: graph,
      proposal: {
        title: graph.draftLabel,
        preview: { format: 'text', content: graph.draftBody },
        targetLabel: graph.conversationLabel,
      },
    };
  }

  async rebuildExecutionAuthority({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }): Promise<InstagramReplyActionAuthority> {
    const graph = await this.loadCanonicalGraph(workspaceId, binding.draftId);
    const expectedActionBinding = this.buildExpectedActionBinding({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      threadId: binding.threadId,
      graph,
    });

    if (!this.matchesBinding(binding, expectedActionBinding)) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    return { expectedActionBinding, canonicalGraph: graph };
  }

  private buildExpectedActionBinding({
    workspaceId,
    initiatorUserWorkspaceId,
    threadId,
    graph,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    graph: CanonicalInstagramReplyGraph & {
      draftLabel: string;
      conversationLabel: string;
    };
  }): ExpectedActionBindingWithWorkspace {
    return {
      workspaceId,
      actionName: this.actionName,
      actionVersion: this.actionVersion,
      draftId: graph.draftId,
      contentDigest: computeActionContentDigest(graph.draftBody),
      recipientFingerprint: computeActionContentDigest(graph.recipientIgsid),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          graph.account.id,
          graph.account.connectedAccountId,
          graph.account.composioUserId,
        ]),
      ),
      threadId,
      initiatorUserWorkspaceId,
      evidenceLinks: [
        {
          objectMetadataId: INSTAGRAM_REPLY_DRAFT_OBJECT_METADATA_ID,
          recordId: graph.draftId,
          role: 'draft',
        },
        {
          objectMetadataId: SOCIAL_CONVERSATION_OBJECT_METADATA_ID,
          recordId: graph.conversationId,
          role: 'conversation',
        },
        {
          objectMetadataId: INSTAGRAM_ACCOUNT_OBJECT_METADATA_ID,
          recordId: graph.account.id,
          role: 'sending_account',
        },
      ],
    };
  }

  private matchesBinding(
    actual: ExpectedActionBindingWithWorkspace,
    expected: ExpectedActionBindingWithWorkspace,
  ): boolean {
    if (
      actual.workspaceId !== expected.workspaceId ||
      actual.actionName !== expected.actionName ||
      actual.actionVersion !== expected.actionVersion ||
      actual.draftId !== expected.draftId ||
      actual.contentDigest !== expected.contentDigest ||
      actual.recipientFingerprint !== expected.recipientFingerprint ||
      actual.sendingAccountFingerprint !== expected.sendingAccountFingerprint ||
      actual.threadId !== expected.threadId ||
      actual.initiatorUserWorkspaceId !== expected.initiatorUserWorkspaceId
    ) {
      return false;
    }

    const toComparableEvidence = (evidence: readonly ActionEvidenceLinkInput[]) =>
      evidence
        .map(({ objectMetadataId, recordId, role }) =>
          JSON.stringify([objectMetadataId, recordId, role]),
        )
        .sort();

    return (
      JSON.stringify(toComparableEvidence(actual.evidenceLinks)) ===
      JSON.stringify(toComparableEvidence(expected.evidenceLinks))
    );
  }

  private async loadCanonicalGraph(
    workspaceId: string,
    draftId: string,
  ): Promise<
    CanonicalInstagramReplyGraph & {
      draftLabel: string;
      conversationLabel: string;
    }
  > {
    const workspace = await this.workspaceRepository.findOneBy({ id: workspaceId });
    if (!workspace) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    const rows = await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);

        return dataSource.query<InstagramReplySourceGraphRow[]>(
          `
            SELECT
              draft."id" AS "draftId",
              draft."body" AS "draftBody",
              COALESCE(draft."title", draft."name") AS "draftLabel",
              draft."sentAt" AS "draftSentAt",
              conversation."id" AS "conversationId",
              COALESCE(conversation."label", conversation."name") AS "conversationLabel",
              conversation."providerConversationId" AS "providerConversationId",
              conversation."recipientIgsid" AS "recipientIgsid",
              account."id" AS "accountId",
              COALESCE(account."label", account."name") AS "accountLabel",
              account."connectedAccountId" AS "connectedAccountId",
              account."composioUserId" AS "composioUserId"
            FROM "${schemaName}"."_myahInstagramReplyDraft" AS draft
            INNER JOIN "${schemaName}"."_myahSocialConversation" AS conversation
              ON conversation."id" = draft."conversationId"
              AND conversation."deletedAt" IS NULL
            INNER JOIN "${schemaName}"."_myahInstagramAccount" AS account
              ON account."id" = conversation."instagramAccountId"
              AND account."deletedAt" IS NULL
              AND account."status" = 'ACTIVE'
            WHERE draft."id" = $1
              AND draft."deletedAt" IS NULL
          `,
          [draftId],
          undefined,
          { shouldBypassPermissionChecks: true },
        );
      },
      buildSystemAuthContext({ workspace: workspace as unknown as FlatWorkspace }),
    );

    if (rows.length !== 1) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    const [row] = rows;
    const expectedComposioUserId = `workspace:${workspaceId}:instagram`;
    const draftLabel = row.draftLabel?.trim();
    const conversationLabel = row.conversationLabel?.trim();
    const providerConversationId = row.providerConversationId?.trim();
    const recipientIgsid = row.recipientIgsid?.trim();
    const connectedAccountId = row.connectedAccountId?.trim();
    const composioUserId = row.composioUserId?.trim();

    if (
      row.draftSentAt ||
      !row.draftBody?.trim() ||
      !draftLabel ||
      !conversationLabel ||
      !providerConversationId ||
      !recipientIgsid ||
      !connectedAccountId ||
      composioUserId !== expectedComposioUserId
    ) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    return {
      draftId: row.draftId,
      draftBody: row.draftBody,
      draftLabel,
      conversationId: row.conversationId,
      conversationLabel,
      providerConversationId,
      recipientIgsid,
      account: {
        id: row.accountId,
        connectedAccountId,
        composioUserId,
      },
    };
  }
}
