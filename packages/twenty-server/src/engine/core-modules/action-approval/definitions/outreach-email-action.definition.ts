import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import {
  ConnectedAccountProvider,
  MessageChannelType,
  type ObjectRecord,
} from 'twenty-shared/types';
import { emailSchema } from 'twenty-shared/utils';
import { In, IsNull, type Repository } from 'typeorm';
import { z } from 'zod';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import {
  type ActionEvidenceLinkInput,
  type ExpectedActionBindingWithWorkspace,
  type OutreachEmailExpectedActionBinding,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { ManagedEmailCampaignEligibilityService } from 'src/engine/core-modules/managed-email/services/managed-email-campaign-eligibility.service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import {
  CampaignEmailAccountHealth,
  type CampaignEmailAccountDTO,
} from 'src/modules/myah-campaign/dtos/campaign-account.dto';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';
import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type FlatUser } from 'src/engine/core-modules/user/types/flat-user.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

const OUTREACH_ACTION_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  'b4459926-2c01-560a-8432-fa1974168439';
const CAMPAIGN_CREATOR_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a';
const CREATOR_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
const CAMPAIGN_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '9a09d54a-d464-5692-ac74-70527fb00ddd';
const MESSAGE_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '20202020-3f6b-4425-80ab-e468899ab4b2';
const CAMPAIGN_ACCOUNT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER =
  '5999e4dd-01a4-5ef5-8c95-754bf079defb';
const SOURCE_GRAPH_UNAVAILABLE = 'Outreach email source graph is unavailable';

export const OutreachEmailActionProposalInputZodSchema = z
  .object({ outreachActionId: z.uuid() })
  .strict();

export type OutreachEmailActionProposalInput = z.infer<
  typeof OutreachEmailActionProposalInputZodSchema
>;

type OutreachEmailActionRecord = ObjectRecord & {
  id: string;
  name: string;
  campaignCreatorId: string | null;
  channel: string | null;
  status: string | null;
  subject: string | null;
  body: string | null;
  contentDigest: string | null;
  recipientEmail: string | null;
  campaignAccountId: string | null;
  connectedAccountId: string | null;
  messageChannelId: string | null;
  senderEmail: string | null;
  senderDisplayName: string | null;
  approvalBindingId: string | null;
  executionReceiptId: string | null;
  providerDraftExternalId: string | null;
  sentHeaderMessageId: string | null;
  providerMessageExternalId: string | null;
  providerThreadExternalId: string | null;
  messageId: string | null;
  messageThreadId: string | null;
  inReplyTo: string | null;
  completedAt: Date | null;
};

type CampaignCreatorRecord = ObjectRecord & {
  id: string;
  creatorId: string | null;
  campaignId: string | null;
  selectedContactMethod: string | null;
  assignedManagedMailboxId: string | null;
};

type CreatorRecord = ObjectRecord & {
  id: string;
  name: string | null;
  email: string | null;
};

type CampaignRecord = ObjectRecord & {
  id: string;
  name: string | null;
};

type OutreachEmailEvidenceObjectMetadataIds = {
  outreachAction: string;
  campaignCreator: string;
  creator: string;
  campaign: string;
  message: string;
  campaignAccount: string;
};

type OutreachEmailExpectedActionBindingWithWorkspace =
  OutreachEmailExpectedActionBinding & { workspaceId: string };

export type CanonicalOutreachEmailGraph = {
  managedMailboxId: string | null;
  campaignAccountId: string | null;
  outreachActionId: string;
  campaignCreatorId: string;
  creatorId: string;
  campaignId: string;
  subject: string;
  body: string;
  recipientEmail: string;
  recipientLabel: string;
  campaignLabel: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
  providerDraftExternalId: string;
  providerThreadExternalId: string | null;
  messageThreadId: string | null;
  inReplyTo: string | null;
  parentMessageRecordId: string | null;
  connectedAccount: ConnectedAccountEntity;
};

export type OutreachEmailActionAuthority = {
  expectedActionBinding: ExpectedActionBindingWithWorkspace;
  canonicalGraph: CanonicalOutreachEmailGraph;
};

export type OutreachEmailActionProposal = OutreachEmailActionAuthority & {
  proposal: {
    title: string;
    preview: { format: 'text'; content: string };
    targetLabel: string;
  };
};

export type OutreachEmailActionApprovalProposal = {
  action: string;
  actionVersion: number;
  subject: string;
  body: string;
  recipientLabel: string;
  recipientEmail: string;
  senderEmail: string;
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
export class OutreachEmailActionDefinition {
  readonly actionName = 'send_outreach_email' as const;
  readonly actionVersion = 1 as const;
  readonly proposalInputSchema = OutreachEmailActionProposalInputZodSchema;

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly workspaceCacheService: WorkspaceCacheService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    private readonly managedEmailCampaignEligibilityService: ManagedEmailCampaignEligibilityService,
    private readonly campaignAccountService: CampaignAccountService,
    private readonly messagingMessageOutboundService: MessagingMessageOutboundService,
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
    input: OutreachEmailActionProposalInput;
  }): Promise<OutreachEmailActionProposal> {
    const graph = await this.loadCanonicalGraph(
      workspaceId,
      input.outreachActionId,
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
    const targetLabel = `${graph.recipientLabel} <${graph.recipientEmail}>`;

    return {
      expectedActionBinding,
      canonicalGraph: graph,
      proposal: {
        title: graph.subject,
        preview: {
          format: 'text',
          content: `From: ${graph.senderEmail}\nTo: ${targetLabel}\nSubject: ${graph.subject}\n\n${graph.body}`,
        },
        targetLabel,
      },
    };
  }

  async rebuildExecutionAuthority({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }): Promise<OutreachEmailActionAuthority> {
    if (binding.actionName !== this.actionName) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    const graph = await this.loadCanonicalGraph(
      workspaceId,
      binding.draftId,
      binding.initiatorUserWorkspaceId,
    );
    if (graph.managedMailboxId !== null) {
      await this.managedEmailCampaignEligibilityService.assertEligible({
        workspaceId,
        managedMailboxId: graph.managedMailboxId,
        connectedAccountId: graph.connectedAccountId,
        messageChannelId: graph.messageChannelId,
        isFollowUp: graph.inReplyTo !== null,
      });
    }
    await this.messagingMessageOutboundService.assertConnectedAccountSendable(
      graph.connectedAccount,
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

    if (
      !this.matchesBinding(
        binding as OutreachEmailExpectedActionBindingWithWorkspace,
        expectedActionBinding,
      )
    ) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    return { expectedActionBinding, canonicalGraph: graph };
  }

  async recordApprovalBinding({
    expectedActionBinding,
    approvalBindingId,
  }: {
    expectedActionBinding: ExpectedActionBindingWithWorkspace;
    approvalBindingId: string;
  }): Promise<void> {
    if (expectedActionBinding.actionName !== this.actionName) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    const { canonicalGraph: graph } = await this.rebuildExecutionAuthority({
      workspaceId: expectedActionBinding.workspaceId,
      binding: expectedActionBinding,
    });
    const result =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const actionRepository =
            await this.globalWorkspaceOrmManager.getRepository<OutreachEmailActionRecord>(
              expectedActionBinding.workspaceId,
              'outreachAction',
              { shouldBypassPermissionChecks: true },
            );

          return actionRepository.update(
            {
              id: graph.outreachActionId,
              channel: 'EMAIL',
              status: 'PENDING',
              subject: graph.subject,
              body: graph.body,
              contentDigest: expectedActionBinding.contentDigest,
              recipientEmail: graph.recipientEmail,
              campaignAccountId:
                graph.campaignAccountId === null
                  ? IsNull()
                  : graph.campaignAccountId,
              connectedAccountId: graph.connectedAccountId,
              messageChannelId: graph.messageChannelId,
              senderEmail: graph.senderEmail,
              senderDisplayName:
                graph.senderDisplayName === null
                  ? IsNull()
                  : graph.senderDisplayName,
              providerDraftExternalId: graph.providerDraftExternalId,
              providerThreadExternalId:
                graph.providerThreadExternalId === null
                  ? IsNull()
                  : graph.providerThreadExternalId,
              messageThreadId:
                graph.messageThreadId === null
                  ? IsNull()
                  : graph.messageThreadId,
              inReplyTo: graph.inReplyTo === null ? IsNull() : graph.inReplyTo,
              approvalBindingId: IsNull(),
              executionReceiptId: IsNull(),
              completedAt: IsNull(),
            },
            { approvalBindingId } as never,
          );
        },
        buildSystemAuthContext(expectedActionBinding.workspaceId),
      );

    if (result.affected !== 1) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }
  }

  async getProposal({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: ActionApprovalBindingEntity;
  }): Promise<OutreachEmailActionApprovalProposal> {
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
    const actualActionBinding: OutreachEmailExpectedActionBindingWithWorkspace =
      {
        workspaceId: binding.workspaceId,
        actionName: binding.actionName as 'send_outreach_email',
        actionVersion: binding.actionVersion as 1,
        draftId: binding.draftId,
        contentDigest: binding.contentDigest,
        recipientFingerprint: binding.recipientFingerprint ?? '',
        sendingAccountFingerprint: binding.sendingAccountFingerprint ?? '',
        actionContextFingerprint: binding.actionContextFingerprint ?? '',
        threadId: binding.threadId,
        initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
        evidenceLinks: binding.evidenceLinks,
      };

    if (!this.matchesBinding(actualActionBinding, expectedActionBinding)) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    return {
      action: binding.actionName,
      actionVersion: binding.actionVersion,
      subject: graph.subject,
      body: graph.body,
      recipientLabel: graph.recipientLabel,
      recipientEmail: graph.recipientEmail,
      senderEmail: graph.senderEmail,
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
    graph: CanonicalOutreachEmailGraph;
    evidenceObjectMetadataIds: OutreachEmailEvidenceObjectMetadataIds;
  }): OutreachEmailExpectedActionBindingWithWorkspace {
    const evidenceLinks: ActionEvidenceLinkInput[] = [
      {
        objectMetadataId: evidenceObjectMetadataIds.outreachAction,
        recordId: graph.outreachActionId,
        role: 'draft',
      },
      {
        objectMetadataId: evidenceObjectMetadataIds.campaignCreator,
        recordId: graph.campaignCreatorId,
        role: 'campaign_creator',
      },
      {
        objectMetadataId: evidenceObjectMetadataIds.creator,
        recordId: graph.creatorId,
        role: 'recipient',
      },
      {
        objectMetadataId: evidenceObjectMetadataIds.campaign,
        recordId: graph.campaignId,
        role: 'campaign',
      },
    ];

    if (graph.campaignAccountId !== null) {
      evidenceLinks.push({
        objectMetadataId: evidenceObjectMetadataIds.campaignAccount,
        recordId: graph.campaignAccountId,
        role: 'campaign_account',
      });
    }

    if (graph.parentMessageRecordId) {
      evidenceLinks.push({
        objectMetadataId: evidenceObjectMetadataIds.message,
        recordId: graph.parentMessageRecordId,
        role: 'thread_parent',
      });
    }

    return {
      workspaceId,
      actionName: this.actionName,
      actionVersion: this.actionVersion,
      draftId: graph.outreachActionId,
      contentDigest: computeActionContentDigest(
        JSON.stringify([graph.subject, graph.body]),
      ),
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify([graph.recipientEmail]),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          graph.managedMailboxId,
          graph.campaignAccountId,
          graph.connectedAccountId,
          graph.messageChannelId,
          graph.senderEmail,
          graph.senderDisplayName,
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          graph.providerDraftExternalId,
          graph.inReplyTo,
          graph.messageThreadId,
          graph.providerThreadExternalId,
        ]),
      ),
      threadId,
      initiatorUserWorkspaceId,
      evidenceLinks,
    };
  }

  private matchesBinding(
    actual: OutreachEmailExpectedActionBindingWithWorkspace,
    expected: OutreachEmailExpectedActionBindingWithWorkspace,
  ): boolean {
    if (
      actual.workspaceId !== expected.workspaceId ||
      actual.actionName !== expected.actionName ||
      actual.actionVersion !== expected.actionVersion ||
      actual.draftId !== expected.draftId ||
      actual.contentDigest !== expected.contentDigest ||
      actual.recipientFingerprint !== expected.recipientFingerprint ||
      actual.sendingAccountFingerprint !== expected.sendingAccountFingerprint ||
      actual.actionContextFingerprint !== expected.actionContextFingerprint ||
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
  ): Promise<OutreachEmailEvidenceObjectMetadataIds> {
    const metadata = await this.objectMetadataRepository.find({
      where: {
        workspaceId,
        universalIdentifier: In([
          OUTREACH_ACTION_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          CAMPAIGN_CREATOR_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          CREATOR_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          CAMPAIGN_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          MESSAGE_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
          CAMPAIGN_ACCOUNT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
        ]),
      },
      select: { id: true, workspaceId: true, universalIdentifier: true },
    });
    const findMetadataId = (universalIdentifier: string) =>
      metadata.find(
        (item) =>
          item.workspaceId === workspaceId &&
          item.universalIdentifier === universalIdentifier,
      )?.id;
    const outreachAction = findMetadataId(
      OUTREACH_ACTION_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    );
    const campaignCreator = findMetadataId(
      CAMPAIGN_CREATOR_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    );
    const creator = findMetadataId(
      CREATOR_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    );
    const campaign = findMetadataId(
      CAMPAIGN_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    );
    const message = findMetadataId(
      MESSAGE_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    );
    const campaignAccount = findMetadataId(
      CAMPAIGN_ACCOUNT_OBJECT_METADATA_UNIVERSAL_IDENTIFIER,
    );

    if (
      !outreachAction ||
      !campaignCreator ||
      !creator ||
      !campaign ||
      !message ||
      !campaignAccount
    ) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    return {
      outreachAction,
      campaignCreator,
      creator,
      campaign,
      message,
      campaignAccount,
    };
  }

  private async loadCanonicalGraph(
    workspaceId: string,
    outreachActionId: string,
    initiatorUserWorkspaceId: string,
  ): Promise<CanonicalOutreachEmailGraph> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });

    if (!workspace) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    const authContext = await this.buildInitiatorAuthContext(
      workspace,
      initiatorUserWorkspaceId,
    );
    const permissionOptions = await this.resolveUserPermissionOptions(
      workspaceId,
      authContext,
    );
    const graph =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const actionRepository =
            await this.globalWorkspaceOrmManager.getRepository<OutreachEmailActionRecord>(
              workspaceId,
              'outreachAction',
              permissionOptions,
            );
          const campaignCreatorRepository =
            await this.globalWorkspaceOrmManager.getRepository<CampaignCreatorRecord>(
              workspaceId,
              'campaignCreator',
              permissionOptions,
            );
          const creatorRepository =
            await this.globalWorkspaceOrmManager.getRepository<CreatorRecord>(
              workspaceId,
              'creator',
              permissionOptions,
            );
          const campaignRepository =
            await this.globalWorkspaceOrmManager.getRepository<CampaignRecord>(
              workspaceId,
              'campaign',
              permissionOptions,
            );
          const messageRepository =
            await this.globalWorkspaceOrmManager.getRepository<MessageWorkspaceEntity>(
              workspaceId,
              'message',
              permissionOptions,
            );
          const associationRepository =
            await this.globalWorkspaceOrmManager.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
              workspaceId,
              'messageChannelMessageAssociation',
              permissionOptions,
            );
          const action = await actionRepository.findOneBy({
            id: outreachActionId,
          });

          if (!action?.campaignCreatorId) {
            return null;
          }

          const campaignCreator = await campaignCreatorRepository.findOneBy({
            id: action.campaignCreatorId,
          });

          if (!campaignCreator?.creatorId || !campaignCreator.campaignId) {
            return null;
          }

          const [creator, campaign, connectedAccount, messageChannels] =
            await Promise.all([
              creatorRepository.findOneBy({ id: campaignCreator.creatorId }),
              campaignRepository.findOneBy({ id: campaignCreator.campaignId }),
              this.connectedAccountRepository.findOne({
                where: {
                  id: action.connectedAccountId ?? '',
                  workspaceId,
                  archivedAt: IsNull(),
                },
              }),
              this.messageChannelRepository.find({
                where: {
                  workspaceId,
                  connectedAccountId: action.connectedAccountId ?? '',
                  handle: action.senderEmail ?? '',
                  type: MessageChannelType.EMAIL,
                },
                take: 2,
              }),
            ]);

          if (
            !creator ||
            !campaign ||
            !connectedAccount ||
            messageChannels.length !== 1
          ) {
            return null;
          }

          const parentMessageRecordId = await this.resolveParentMessageRecordId(
            {
              action,
              messageRepository,
              associationRepository,
            },
          );

          if (parentMessageRecordId === undefined) {
            return null;
          }

          return {
            action,
            campaignCreator,
            creator,
            campaign,
            connectedAccount,
            messageChannel: messageChannels[0],
            parentMessageRecordId,
          };
        },
        authContext,
      );

    if (!graph) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    const subject = graph.action.subject?.trim();
    const body = graph.action.body?.trim();
    const recipientEmail = graph.action.recipientEmail?.trim();
    const senderEmail = graph.action.senderEmail?.trim();
    const senderDisplayName = graph.action.senderDisplayName?.trim() || null;
    const connectedAccountSenderDisplayName =
      graph.connectedAccount.name?.trim() || null;
    const providerDraftExternalId =
      graph.action.providerDraftExternalId?.trim();
    const providerThreadExternalId =
      graph.action.providerThreadExternalId?.trim() || null;
    const messageThreadId = graph.action.messageThreadId?.trim() || null;
    const inReplyTo = graph.action.inReplyTo?.trim() || null;
    const recipientLabel = graph.creator.name?.trim();
    const campaignLabel = graph.campaign.name?.trim();
    const rawAssignedManagedMailboxId =
      graph.campaignCreator.assignedManagedMailboxId as unknown;
    const campaignAccountId = graph.action.campaignAccountId?.trim() || null;
    const executionReceiptId = graph.action.executionReceiptId?.trim() || null;
    const sentHeaderMessageId =
      graph.action.sentHeaderMessageId?.trim() || null;
    const providerMessageExternalId =
      graph.action.providerMessageExternalId?.trim() || null;
    const messageId = graph.action.messageId?.trim() || null;
    const isManagedSender = rawAssignedManagedMailboxId !== null;
    const managedMailboxId =
      typeof rawAssignedManagedMailboxId === 'string'
        ? rawAssignedManagedMailboxId
        : null;
    const expectedContentDigest =
      isNonEmptyString(subject) && isNonEmptyString(body)
        ? computeActionContentDigest(JSON.stringify([subject, body]))
        : null;

    if (
      graph.action.id !== outreachActionId ||
      graph.action.channel !== 'EMAIL' ||
      graph.action.status !== 'PENDING' ||
      !isNonEmptyString(subject) ||
      !isNonEmptyString(body) ||
      graph.action.contentDigest !== expectedContentDigest ||
      !isNonEmptyString(recipientEmail) ||
      !emailSchema.safeParse(recipientEmail).success ||
      !isNonEmptyString(senderEmail) ||
      !emailSchema.safeParse(senderEmail).success ||
      senderDisplayName !== connectedAccountSenderDisplayName ||
      !isNonEmptyString(providerDraftExternalId) ||
      !isNonEmptyString(recipientLabel) ||
      !isNonEmptyString(campaignLabel) ||
      (isManagedSender &&
        (typeof managedMailboxId !== 'string' ||
          !z.uuid().safeParse(managedMailboxId).success ||
          campaignAccountId !== null)) ||
      (!isManagedSender &&
        (typeof campaignAccountId !== 'string' ||
          !z.uuid().safeParse(campaignAccountId).success)) ||
      executionReceiptId !== null ||
      sentHeaderMessageId !== null ||
      providerMessageExternalId !== null ||
      messageId !== null ||
      graph.action.completedAt !== null ||
      graph.campaignCreator.id !== graph.action.campaignCreatorId ||
      graph.campaignCreator.creatorId !== graph.creator.id ||
      graph.campaignCreator.campaignId !== graph.campaign.id ||
      graph.campaignCreator.selectedContactMethod?.trim().toUpperCase() !==
        'EMAIL' ||
      graph.creator.email?.trim() !== recipientEmail ||
      !this.isAvailableMailboxGraph({
        workspaceId,
        connectedAccountId: graph.action.connectedAccountId,
        messageChannelId: graph.action.messageChannelId,
        senderEmail,
        connectedAccount: graph.connectedAccount,
        messageChannel: graph.messageChannel,
      }) ||
      (inReplyTo === null &&
        (messageThreadId !== null || graph.parentMessageRecordId !== null)) ||
      (inReplyTo !== null &&
        (!messageThreadId ||
          !providerThreadExternalId ||
          !graph.parentMessageRecordId))
    ) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    const canonicalCampaignAccountId = campaignAccountId;

    if (canonicalCampaignAccountId !== null) {
      await this.assertLinkedCampaignDefault(
        {
          campaignId: graph.campaign.id,
          campaignAccountId: canonicalCampaignAccountId,
          connectedAccountId: graph.connectedAccount.id,
          messageChannelId: graph.messageChannel.id,
          senderEmail,
          senderDisplayName,
        },
        workspaceId,
      );
    }

    return {
      outreachActionId: graph.action.id,
      campaignCreatorId: graph.campaignCreator.id,
      creatorId: graph.creator.id,
      campaignId: graph.campaign.id,
      managedMailboxId,
      campaignAccountId: canonicalCampaignAccountId,
      subject,
      body,
      recipientEmail,
      recipientLabel,
      campaignLabel,
      connectedAccountId: graph.connectedAccount.id,
      messageChannelId: graph.messageChannel.id,
      senderEmail,
      senderDisplayName,
      providerDraftExternalId,
      providerThreadExternalId,
      messageThreadId,
      inReplyTo,
      parentMessageRecordId: graph.parentMessageRecordId,
      connectedAccount: graph.connectedAccount,
    };
  }

  private async assertLinkedCampaignDefault(
    graph: Pick<
      CanonicalOutreachEmailGraph,
      | 'campaignId'
      | 'campaignAccountId'
      | 'connectedAccountId'
      | 'messageChannelId'
      | 'senderEmail'
      | 'senderDisplayName'
    >,
    workspaceId: string,
  ): Promise<void> {
    if (graph.campaignAccountId === null) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    let defaultAccount: CampaignEmailAccountDTO;
    try {
      defaultAccount =
        await this.campaignAccountService.resolveDefaultEmailAccount(
          graph.campaignId,
          workspaceId,
        );
    } catch {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    if (
      !defaultAccount.isDefault ||
      defaultAccount.health !== CampaignEmailAccountHealth.AVAILABLE ||
      defaultAccount.id !== graph.campaignAccountId ||
      defaultAccount.connectedAccountId !== graph.connectedAccountId ||
      defaultAccount.messageChannelId !== graph.messageChannelId ||
      defaultAccount.senderEmail !== graph.senderEmail
    ) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }
  }

  private async resolveParentMessageRecordId({
    action,
    messageRepository,
    associationRepository,
  }: {
    action: OutreachEmailActionRecord;
    messageRepository: WorkspaceRepository<MessageWorkspaceEntity>;
    associationRepository: WorkspaceRepository<MessageChannelMessageAssociationWorkspaceEntity>;
  }): Promise<string | null | undefined> {
    const inReplyTo = action.inReplyTo?.trim();

    if (!isNonEmptyString(inReplyTo)) {
      return null;
    }

    const messageThreadId = action.messageThreadId?.trim();
    const providerThreadExternalId = action.providerThreadExternalId?.trim();

    if (
      !isNonEmptyString(messageThreadId) ||
      !isNonEmptyString(providerThreadExternalId) ||
      !isNonEmptyString(action.messageChannelId)
    ) {
      return undefined;
    }

    const messages = await messageRepository.find({
      where: { headerMessageId: inReplyTo, messageThreadId },
      take: 2,
    });

    if (
      messages.length !== 1 ||
      messages[0].headerMessageId !== inReplyTo ||
      messages[0].messageThreadId !== messageThreadId
    ) {
      return undefined;
    }

    const associations = await associationRepository.find({
      where: {
        messageId: messages[0].id,
        messageChannelId: action.messageChannelId,
        messageThreadExternalId: providerThreadExternalId,
      },
      take: 2,
    });

    if (
      associations.length !== 1 ||
      associations[0].messageId !== messages[0].id ||
      associations[0].messageChannelId !== action.messageChannelId ||
      associations[0].messageThreadExternalId !== providerThreadExternalId
    ) {
      return undefined;
    }

    return messages[0].id;
  }

  private isAvailableMailboxGraph({
    workspaceId,
    connectedAccountId,
    messageChannelId,
    senderEmail,
    connectedAccount,
    messageChannel,
  }: {
    workspaceId: string;
    connectedAccountId: string | null;
    messageChannelId: string | null;
    senderEmail: string;
    connectedAccount: ConnectedAccountEntity;
    messageChannel: MessageChannelEntity;
  }): boolean {
    if (
      connectedAccount.id !== connectedAccountId ||
      connectedAccount.workspaceId !== workspaceId ||
      connectedAccount.archivedAt !== null ||
      connectedAccount.handle !== senderEmail ||
      messageChannel.id !== messageChannelId ||
      messageChannel.workspaceId !== workspaceId ||
      messageChannel.connectedAccountId !== connectedAccount.id ||
      messageChannel.handle !== senderEmail
    ) {
      return false;
    }

    switch (connectedAccount.provider) {
      case ConnectedAccountProvider.GOOGLE:
      case ConnectedAccountProvider.MICROSOFT:
      case ConnectedAccountProvider.IMAP_SMTP_CALDAV:
        return true;
      default:
        return false;
    }
  }

  private async resolveUserPermissionOptions(
    workspaceId: string,
    authContext: Awaited<ReturnType<typeof buildUserAuthContext>>,
  ): Promise<RolePermissionConfig> {
    const { userWorkspaceRoleMap, apiKeyRoleMap } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'userWorkspaceRoleMap',
        'apiKeyRoleMap',
      ]);
    const permissionOptions = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap,
      apiKeyRoleMap,
    });

    if (!permissionOptions) {
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
    }

    return permissionOptions;
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
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
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
      throw new Error(SOURCE_GRAPH_UNAVAILABLE);
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
