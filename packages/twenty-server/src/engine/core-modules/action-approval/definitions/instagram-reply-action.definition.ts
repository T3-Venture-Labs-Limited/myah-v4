import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type ObjectRecord } from 'twenty-shared/types';
import { z } from 'zod';

import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import {
  type ExpectedActionBindingWithWorkspace,
  type ActionEvidenceLinkInput,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { type FlatUser } from 'src/engine/core-modules/user/types/flat-user.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

import { In, type Repository } from 'typeorm';

const INSTAGRAM_ACCOUNT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '2d357469-831a-4629-ad4b-47335900e883';
const SOCIAL_CONVERSATION_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '36817464-855f-42db-9fbb-f8853643f8d6';
const INSTAGRAM_REPLY_DRAFT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '85762d24-541b-407f-9d6a-cdf89552c665';
const SOCIAL_MESSAGE_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '7241bd44-e474-4904-8636-339276b3feff';

export const InstagramReplyActionProposalInputZodSchema = z
  .object({ draftId: z.string().uuid() })
  .strict();

export type InstagramReplyActionProposalInput = z.infer<
  typeof InstagramReplyActionProposalInputZodSchema
>;

type InstagramReplyDraftRecord = ObjectRecord & {
  id: string;
  body: string | null;
  title: string | null;
  name: string | null;
  sentAt: string | null;
  status: string;
  conversationId: string;
};

type InstagramSocialConversationRecord = ObjectRecord & {
  id: string;
  label: string | null;
  name: string | null;
  providerConversationId: string | null;
  recipientIgsid: string | null;
  instagramAccountId: string;
};

type InstagramSocialMessageRecord = ObjectRecord & {
  id: string;
  conversationId: string;
  providerMessageId: string | null;
  direction: string;
  createdAt: Date;
};

type InstagramAccountRecord = ObjectRecord & {
  id: string;
  label: string | null;
  name: string | null;
  status: string;
  connectedAccountId: string | null;
  composioUserId: string | null;
  igUserId: string | null;
};

type InstagramReplyEvidenceObjectMetadataIds = {
  account: string;
  conversation: string;
  draft: string;
  inboundMessage: string;
};

export type CanonicalInstagramReplyGraph = {
  draftId: string;
  draftBody: string;
  conversationId: string;
  providerConversationId: string;
  recipientIgsid: string;
  inboundRecordId: string;
  inboundMessageId: string;
  inboundSenderIgsid: string;
  inboundDirection: 'INBOUND';
  inboundReceivedAt: Date;
  account: {
    id: string;
    label: string;
    connectedAccountId: string;
    composioUserId: string;
    igUserId: string;
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

export type InstagramReplyActionApprovalProposal = {
  action: string;
  actionVersion: number;
  body: string;
  recipientLabel: string;
  sendingAccountLabel: string;
  state: string;
  expiresAt: Date;
  occurredAt: Date;
  evidenceLinks: {
    objectMetadataId: string;
    recordId: string;
    role: string;
  }[];
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
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly workspaceCacheService: WorkspaceCacheService,
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
    const graph = await this.loadCanonicalGraph(
      workspaceId,
      input.draftId,
      initiatorUserWorkspaceId,
    );
    const evidenceObjectMetadataIds =
      await this.resolveEvidenceObjectMetadataIds(workspaceId);
    const expectedActionBinding = this.buildExpectedActionBinding({
      workspaceId,
      initiatorUserWorkspaceId,
      threadId,
      graph,
      evidenceObjectMetadataIds,
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
    const graph = await this.loadCanonicalGraph(
      workspaceId,
      binding.draftId,
      binding.initiatorUserWorkspaceId,
    );
    const evidenceObjectMetadataIds =
      await this.resolveEvidenceObjectMetadataIds(workspaceId);
    const expectedActionBinding = this.buildExpectedActionBinding({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      threadId: binding.threadId,
      graph,
      evidenceObjectMetadataIds,
    });

    if (!this.matchesBinding(binding, expectedActionBinding)) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    return { expectedActionBinding, canonicalGraph: graph };
  }

  async getProposal({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: ActionApprovalBindingEntity;
  }): Promise<InstagramReplyActionApprovalProposal> {
    const graph = await this.loadCanonicalGraph(
      workspaceId,
      binding.draftId,
      binding.initiatorUserWorkspaceId,
    );
    const evidenceObjectMetadataIds =
      await this.resolveEvidenceObjectMetadataIds(workspaceId);
    const expectedActionBinding = this.buildExpectedActionBinding({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      threadId: binding.threadId,
      graph,
      evidenceObjectMetadataIds,
    });
    const actualActionBinding: ExpectedActionBindingWithWorkspace = {
      workspaceId: binding.workspaceId,
      actionName: binding.actionName as 'send_instagram_reply',
      actionVersion: binding.actionVersion as 1,
      draftId: binding.draftId,
      contentDigest: binding.contentDigest,
      recipientFingerprint: binding.recipientFingerprint ?? '',
      sendingAccountFingerprint: binding.sendingAccountFingerprint ?? '',
      inboundMessageId: binding.inboundMessageId ?? '',
      inboundSenderIgsid: binding.inboundSenderIgsid ?? '',
      inboundDirection:
        binding.inboundDirection === 'INBOUND'
          ? binding.inboundDirection
          : 'INBOUND',
      inboundReceivedAt: binding.inboundReceivedAt ?? new Date(0),
      threadId: binding.threadId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      evidenceLinks: binding.evidenceLinks,
    };
    if (!this.matchesBinding(actualActionBinding, expectedActionBinding)) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    return {
      action: binding.actionName,
      actionVersion: binding.actionVersion,
      body: graph.draftBody,
      recipientLabel: graph.conversationLabel,
      sendingAccountLabel: graph.account.label,
      state: binding.state,
      expiresAt: binding.expiresAt,
      occurredAt: binding.decidedAt ?? binding.createdAt,
      evidenceLinks: binding.evidenceLinks.map(
        ({ objectMetadataId, recordId, role }) => ({
          objectMetadataId,
          recordId,
          role,
        }),
      ),
    };
  }

  private buildExpectedActionBinding({
    workspaceId,
    initiatorUserWorkspaceId,
    threadId,
    graph,
    evidenceObjectMetadataIds,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    graph: CanonicalInstagramReplyGraph & {
      draftLabel: string;
      conversationLabel: string;
    };
    evidenceObjectMetadataIds: InstagramReplyEvidenceObjectMetadataIds;
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
          graph.account.igUserId,
        ]),
      ),
      inboundMessageId: graph.inboundMessageId,
      inboundSenderIgsid: graph.inboundSenderIgsid,
      inboundDirection: graph.inboundDirection,
      inboundReceivedAt: graph.inboundReceivedAt,
      threadId,
      initiatorUserWorkspaceId,
      evidenceLinks: [
        {
          objectMetadataId: evidenceObjectMetadataIds.draft,
          recordId: graph.draftId,
          role: 'draft',
        },
        {
          objectMetadataId: evidenceObjectMetadataIds.conversation,
          recordId: graph.conversationId,
          role: 'conversation',
        },
        {
          objectMetadataId: evidenceObjectMetadataIds.account,
          recordId: graph.account.id,
          role: 'sending_account',
        },
        {
          objectMetadataId: evidenceObjectMetadataIds.inboundMessage,
          recordId: graph.inboundRecordId,
          role: 'inbound_message',
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
      actual.inboundMessageId !== expected.inboundMessageId ||
      actual.inboundSenderIgsid !== expected.inboundSenderIgsid ||
      actual.inboundDirection !== expected.inboundDirection ||
      actual.inboundReceivedAt.getTime() !==
        expected.inboundReceivedAt.getTime() ||
      actual.threadId !== expected.threadId ||
      actual.initiatorUserWorkspaceId !== expected.initiatorUserWorkspaceId
    ) {
      return false;
    }

    const toComparableEvidence = (
      evidence: readonly ActionEvidenceLinkInput[],
    ) =>
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

  private async resolveEvidenceObjectMetadataIds(
    workspaceId: string,
  ): Promise<InstagramReplyEvidenceObjectMetadataIds> {
    const metadata = await this.objectMetadataRepository.find({
      where: {
        workspaceId,
        universalIdentifier: In([
          INSTAGRAM_REPLY_DRAFT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          SOCIAL_CONVERSATION_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          INSTAGRAM_ACCOUNT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          SOCIAL_MESSAGE_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
        ]),
      },
      select: { id: true, universalIdentifier: true },
    });
    const draft = metadata.find(
      ({ universalIdentifier }) =>
        universalIdentifier ===
        INSTAGRAM_REPLY_DRAFT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    )?.id;
    const conversation = metadata.find(
      ({ universalIdentifier }) =>
        universalIdentifier ===
        SOCIAL_CONVERSATION_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    )?.id;
    const account = metadata.find(
      ({ universalIdentifier }) =>
        universalIdentifier ===
        INSTAGRAM_ACCOUNT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    )?.id;
    const inboundMessage = metadata.find(
      ({ universalIdentifier }) =>
        universalIdentifier ===
        SOCIAL_MESSAGE_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    )?.id;

    if (!draft || !conversation || !account || !inboundMessage) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    return { draft, conversation, account, inboundMessage };
  }

  private async loadCanonicalGraph(
    workspaceId: string,
    draftId: string,
    initiatorUserWorkspaceId: string,
  ): Promise<
    CanonicalInstagramReplyGraph & {
      draftLabel: string;
      conversationLabel: string;
    }
  > {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });
    if (!workspace) {
      throw new Error('Instagram reply source graph is unavailable');
    }
    const authContext = await this.buildInitiatorAuthContext(
      workspace,
      initiatorUserWorkspaceId,
    );
    const graph =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const draftRepository =
            await this.globalWorkspaceOrmManager.getRepository<InstagramReplyDraftRecord>(
              workspaceId,
              'myahInstagramReplyDraft',
            );
          const conversationRepository =
            await this.globalWorkspaceOrmManager.getRepository<InstagramSocialConversationRecord>(
              workspaceId,
              'myahSocialConversation',
            );
          const accountRepository =
            await this.globalWorkspaceOrmManager.getRepository<InstagramAccountRecord>(
              workspaceId,
              'myahInstagramAccount',
            );
          const socialMessageRepository =
            await this.globalWorkspaceOrmManager.getRepository<InstagramSocialMessageRecord>(
              workspaceId,
              'myahSocialMessage',
            );
          const draft = await draftRepository.findOneBy({ id: draftId });
          if (!draft) {
            return null;
          }
          const conversation = await conversationRepository.findOneBy({
            id: draft.conversationId,
          });
          if (!conversation) {
            return null;
          }
          const [account, activeAccounts, inboundMessages] = await Promise.all([
            accountRepository.findOneBy({
              id: conversation.instagramAccountId,
              status: 'ACTIVE',
            }),
            accountRepository.find({ where: { status: 'ACTIVE' } }),
            socialMessageRepository.find({
              where: { conversationId: conversation.id, direction: 'INBOUND' },
              order: { createdAt: 'DESC' },
              take: 1,
            }),
          ]);
          if (
            !account ||
            activeAccounts.length !== 1 ||
            inboundMessages.length !== 1
          ) {
            return null;
          }

          return {
            draft,
            conversation,
            account,
            inboundMessage: inboundMessages[0],
          };
        },
        authContext,
      );
    if (!graph) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    const expectedComposioUserId = `workspace:${workspaceId}:instagram`;
    const draftLabel = (graph.draft.title ?? graph.draft.name)?.trim();
    const conversationLabel = (
      graph.conversation.label ?? graph.conversation.name
    )?.trim();
    const accountLabel = (graph.account.label ?? graph.account.name)?.trim();
    const providerConversationId =
      graph.conversation.providerConversationId?.trim();
    const recipientIgsid = graph.conversation.recipientIgsid?.trim();
    const connectedAccountId = graph.account.connectedAccountId?.trim();
    const composioUserId = graph.account.composioUserId?.trim();
    const igUserId = graph.account.igUserId?.trim();
    const inboundMessageId = graph.inboundMessage.providerMessageId?.trim();
    const inboundReceivedAt = graph.inboundMessage.createdAt;
    if (
      graph.draft.sentAt ||
      graph.draft.status !== 'NEEDS_REVIEW' ||
      !graph.draft.body?.trim() ||
      !draftLabel ||
      !conversationLabel ||
      !accountLabel ||
      !providerConversationId ||
      !recipientIgsid ||
      !connectedAccountId ||
      composioUserId !== expectedComposioUserId ||
      !igUserId ||
      !inboundMessageId ||
      graph.inboundMessage.direction !== 'INBOUND' ||
      !(inboundReceivedAt instanceof Date) ||
      Number.isNaN(inboundReceivedAt.getTime())
    ) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    return {
      draftId: graph.draft.id,
      draftBody: graph.draft.body,
      draftLabel,
      conversationId: graph.conversation.id,
      conversationLabel,
      providerConversationId,
      recipientIgsid,
      inboundRecordId: graph.inboundMessage.id,
      inboundMessageId,
      inboundSenderIgsid: recipientIgsid,
      inboundDirection: 'INBOUND',
      inboundReceivedAt,
      account: {
        id: graph.account.id,
        label: accountLabel,
        connectedAccountId,
        composioUserId,
        igUserId,
      },
    };
  }

  private async buildInitiatorAuthContext(
    workspace: WorkspaceEntity,
    userWorkspaceId: string,
  ) {
    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { id: userWorkspaceId, workspaceId: workspace.id },
      relations: { user: true },
    });
    if (!userWorkspace?.user) {
      throw new Error('Instagram reply source graph is unavailable');
    }
    const { flatWorkspaceMemberMaps } =
      await this.workspaceCacheService.getOrRecompute(workspace.id, [
        'flatWorkspaceMemberMaps',
      ]);
    const workspaceMemberId =
      flatWorkspaceMemberMaps.idByUserId[userWorkspace.user.id];
    const workspaceMember = workspaceMemberId
      ? flatWorkspaceMemberMaps.byId[workspaceMemberId]
      : undefined;
    if (!workspaceMemberId || !workspaceMember) {
      throw new Error('Instagram reply source graph is unavailable');
    }

    return buildUserAuthContext({
      workspace: workspace as unknown as FlatWorkspace,
      userWorkspaceId,
      user: userWorkspace.user as unknown as FlatUser,
      workspaceMemberId,
      workspaceMember,
    });
  }
}
