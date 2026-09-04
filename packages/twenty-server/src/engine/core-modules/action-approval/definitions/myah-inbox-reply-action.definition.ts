import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';
import { emailSchema } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';
import { z } from 'zod';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { resolveMyahInboxReplyRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-myah-inbox-reply-recipient.util';
import {
  buildMyahInboxReplyExpectedActionBinding,
  matchesMyahInboxReplyBinding,
} from 'src/engine/core-modules/action-approval/utils/myah-inbox-reply-action-binding.util';
import { normalizeMyahInboxReplyDraft } from 'src/engine/core-modules/action-approval/utils/normalize-myah-inbox-reply-draft.util';
import {
  type CanonicalMyahInboxReplyGraph,
  type MyahInboxReplyActionApprovalProposal,
  type MyahInboxReplyActionAuthority,
  type MyahInboxReplyActionProposal,
  type MyahInboxReplyExpectedActionBindingWithWorkspace,
  type MyahInboxReplyReadableDraftSnapshot,
  MyahInboxReplyUnavailableCode,
  MyahInboxReplyUnavailableError,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
export {
  MyahInboxReplyUnavailableCode,
  MyahInboxReplyUnavailableError,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
export type {
  CanonicalMyahInboxReplyGraph,
  MyahInboxReplyActionApprovalProposal,
  MyahInboxReplyActionAuthority,
  MyahInboxReplyActionProposal,
  MyahInboxReplyReadableDraftSnapshot,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
import { MyahInboxReplyAuthorityContextService } from 'src/engine/core-modules/action-approval/services/myah-inbox-reply-authority-context.service';
import { ManagedEmailCampaignEligibilityService } from 'src/engine/core-modules/managed-email/services/managed-email-campaign-eligibility.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';

const isValidMessageId = (value: string): boolean => {
  const match = /^<([^@<>]+)@([^@<>]+)>$/.exec(value);
  if (!match) return false;
  return (
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(
      match[1],
    ) &&
    match[2]
      .split('.')
      .every((label) =>
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
      )
  );
};

export const MyahInboxReplyActionProposalInputZodSchema = z
  .object({
    messageThreadId: z.string().uuid(),
    expectedDraftRevision: z.number().int().min(0),
  })
  .strict();

export type MyahInboxReplyActionProposalInput = z.infer<
  typeof MyahInboxReplyActionProposalInputZodSchema
>;

type LoadMode = 'execution' | 'projection';

@Injectable()
export class MyahInboxReplyActionDefinition {
  readonly actionName = 'send_inbox_reply' as const;
  readonly actionVersion = 1 as const;
  readonly proposalInputSchema = MyahInboxReplyActionProposalInputZodSchema;

  constructor(
    private readonly authorityContextService: MyahInboxReplyAuthorityContextService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    private readonly managedEmailCampaignEligibilityService: ManagedEmailCampaignEligibilityService,
    private readonly messagingMessageOutboundService: MessagingMessageOutboundService,
  ) {}

  async buildAuthority({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    expectedDraftRevision,
    agentChatThreadId,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    expectedDraftRevision?: number;
    agentChatThreadId?: string;
  }): Promise<MyahInboxReplyActionAuthority> {
    const graph = await this.loadCanonicalGraph({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId,
      expectedDraftRevision,
      mode: 'execution',
    });

    return this.toAuthority({
      workspaceId,
      initiatorUserWorkspaceId,
      graph,
      agentChatThreadId,
    });
  }

  async propose({
    workspaceId,
    initiatorUserWorkspaceId,
    agentChatThreadId,
    input,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    agentChatThreadId: string;
    input: MyahInboxReplyActionProposalInput;
  }): Promise<MyahInboxReplyActionProposal> {
    const authority = await this.buildAuthority({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId: input.messageThreadId,
      expectedDraftRevision: input.expectedDraftRevision,
      agentChatThreadId,
    });
    const graph = authority.canonicalGraph;
    const targetLabel = `${graph.recipientLabel} <${graph.recipientEmail}>`;

    return {
      ...authority,
      proposal: {
        title: graph.subject,
        preview: {
          format: 'text',
          content: `From: ${this.toSendingAccountLabel(graph)}\nTo: ${targetLabel}\nSubject: ${graph.subject}\n\n${graph.draftBody.markdown}`,
        },
        targetLabel,
      },
    };
  }

  async getReadableDraftSnapshot({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
  }): Promise<MyahInboxReplyReadableDraftSnapshot> {
    return this.authorityContextService.getReadableDraftSnapshot({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId,
    });
  }

  async getProposal({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: ActionApprovalBindingEntity;
  }): Promise<MyahInboxReplyActionApprovalProposal> {
    const authority = await this.rebuildProjectionAuthority({
      workspaceId,
      binding: this.toExpectedBinding(binding),
    });
    const graph = authority.canonicalGraph;

    return {
      action: 'send_inbox_reply',
      actionVersion: 1,
      body: graph.draftBody.markdown,
      recipientLabel: `${graph.recipientLabel} <${graph.recipientEmail}>`,
      sendingAccountLabel: this.toSendingAccountLabel(graph),
      subject: graph.subject,
      draftRevision: graph.draftRevision,
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

  async rebuildExecutionAuthority({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
  }): Promise<MyahInboxReplyActionAuthority> {
    return this.rebuildAuthority({ workspaceId, binding, mode: 'execution' });
  }

  async rebuildProjectionAuthority({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
  }): Promise<MyahInboxReplyActionAuthority> {
    return this.rebuildAuthority({ workspaceId, binding, mode: 'projection' });
  }

  private async rebuildAuthority({
    workspaceId,
    binding,
    mode,
  }: {
    workspaceId: string;
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
    mode: LoadMode;
  }): Promise<MyahInboxReplyActionAuthority> {
    if (
      binding.actionName !== this.actionName ||
      binding.workspaceId !== workspaceId
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }
    const projectionParentMessageId =
      mode === 'projection'
        ? binding.evidenceLinks.find(({ role }) => role === 'thread_parent')
            ?.recordId
        : undefined;
    if (mode === 'projection' && !isNonEmptyString(projectionParentMessageId)) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    const graph = await this.loadCanonicalGraph({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      messageThreadId: binding.draftId,
      mode,
      parentMessageId: projectionParentMessageId,
    });
    const authority = await this.toAuthority({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      graph,
      agentChatThreadId: binding.threadId,
    });

    const bindingForComparison =
      mode === 'projection'
        ? {
            ...binding,
            sendingAccountFingerprint:
              authority.expectedActionBinding.sendingAccountFingerprint,
          }
        : binding;
    if (
      !matchesMyahInboxReplyBinding(
        bindingForComparison,
        authority.expectedActionBinding,
      )
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    return authority;
  }

  private async toAuthority({
    workspaceId,
    initiatorUserWorkspaceId,
    graph,
    agentChatThreadId,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    graph: CanonicalMyahInboxReplyGraph;
    agentChatThreadId?: string;
  }): Promise<MyahInboxReplyActionAuthority> {
    const evidenceObjectMetadataIds =
      await this.authorityContextService.resolveEvidenceObjectMetadataIds(
        workspaceId,
      );

    return {
      canonicalGraph: graph,
      expectedActionBinding: buildMyahInboxReplyExpectedActionBinding({
        workspaceId,
        initiatorUserWorkspaceId,
        graph,
        evidenceObjectMetadataIds,
        agentChatThreadId,
      }),
    };
  }

  private async loadCanonicalGraph({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    expectedDraftRevision,
    parentMessageId,
    mode,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    expectedDraftRevision?: number;
    mode: LoadMode;
    parentMessageId?: string;
  }): Promise<CanonicalMyahInboxReplyGraph> {
    const source = await this.authorityContextService.loadAuthoritySource({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId,
      mode,
      parentMessageId,
    });

    const draftBody = source.messageThread
      ? normalizeMyahInboxReplyDraft(source.messageThread)
      : null;
    const parentMessage = source.parentMessage;
    const parentSubject = parentMessage?.subject?.trim() ?? '';

    if (
      !source.messageThread ||
      source.messageThread.id !== messageThreadId ||
      draftBody === null ||
      draftBody.markdown.trim().length === 0 ||
      (expectedDraftRevision !== undefined &&
        source.messageThread.myahReplyDraftRevision !==
          expectedDraftRevision) ||
      !parentMessage ||
      parentMessage.id === undefined ||
      parentMessage.messageThreadId !== messageThreadId ||
      parentMessage.isDraft !== false
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    const headerMessageId = parentMessage.headerMessageId?.trim();
    const associations = parentMessage.messageChannelMessageAssociations ?? [];

    if (
      !isNonEmptyString(headerMessageId) ||
      !isValidMessageId(headerMessageId)
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    if (
      associations.length !== 1 ||
      !isNonEmptyString(associations[0].messageChannelId)
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
      );
    }

    const messageChannels = await this.messageChannelRepository.find({
      where: {
        workspaceId,
        id: In([associations[0].messageChannelId]),
      },
    });
    const connectedAccounts = await this.connectedAccountRepository.find({
      where: {
        workspaceId,
        id: In(
          messageChannels.map(({ connectedAccountId }) => connectedAccountId),
        ),
      },
    });
    const channel = messageChannels.find(
      ({ id, workspaceId: channelWorkspaceId }) =>
        id === associations[0].messageChannelId &&
        channelWorkspaceId === workspaceId,
    );
    const account = channel
      ? connectedAccounts.find(
          ({ id, workspaceId: accountWorkspaceId }) =>
            id === channel.connectedAccountId &&
            accountWorkspaceId === workspaceId,
        )
      : undefined;

    if (
      !channel ||
      !account ||
      channel.connectedAccountId !== account.id ||
      ![MessageChannelType.EMAIL, MessageChannelType.EMAIL_GROUP].includes(
        channel.type,
      )
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
      );
    }

    const senderEmail = (
      channel.type === MessageChannelType.EMAIL_GROUP
        ? account.handle
        : channel.handle
    )
      .trim()
      .toLowerCase();
    const senderHandles = new Set(
      [account.handle, ...(account.handleAliases ?? [])]
        .map((handle) => handle.trim().toLowerCase())
        .filter((handle) => emailSchema.safeParse(handle).success),
    );

    if (
      !emailSchema.safeParse(senderEmail).success ||
      !senderHandles.has(senderEmail)
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
      );
    }

    if (mode === 'execution') {
      if (
        channel.visibility !== MessageChannelVisibility.SHARE_EVERYTHING &&
        account.userWorkspaceId !== initiatorUserWorkspaceId
      ) {
        throw new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
        );
      }

      if (
        account.archivedAt !== null ||
        !this.isSupportedProvider(account.provider)
      ) {
        throw new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
        );
      }

      if (
        !channel.isSyncEnabled ||
        channel.syncStatus !== MessageChannelSyncStatus.ACTIVE
      ) {
        throw new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED,
        );
      }

      try {
        await this.messagingMessageOutboundService.assertConnectedAccountSendable(
          account,
        );
      } catch {
        throw new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.MAILBOX_INELIGIBLE,
        );
      }
    }

    let recipient;
    try {
      recipient = resolveMyahInboxReplyRecipient({
        direction: associations[0].direction,
        participants: parentMessage.messageParticipants ?? [],
        senderHandles,
      });
    } catch {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.RECIPIENT_UNAVAILABLE,
      );
    }

    let managedMailboxId: string | null = null;
    try {
      const managedMailbox =
        mode === 'execution'
          ? await this.managedEmailCampaignEligibilityService.assertConnectedIdentityEligibleForFollowUp(
              {
                workspaceId,
                connectedAccountId: account.id,
                messageChannelId: channel.id,
              },
            )
          : await this.managedEmailCampaignEligibilityService.findConnectedIdentity(
              {
                workspaceId,
                connectedAccountId: account.id,
                messageChannelId: channel.id,
              },
            );
      managedMailboxId = managedMailbox?.id ?? null;
    } catch {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.MAILBOX_INELIGIBLE,
      );
    }

    return {
      messageThreadId,
      draftRevision: source.messageThread.myahReplyDraftRevision,
      draftBody: {
        markdown: draftBody.markdown,
        blocknote: draftBody.blocknote,
      },
      connectedAccountId: account.id,
      messageChannelId: channel.id,
      senderEmail,
      senderDisplayName: account.name?.trim() || null,
      recipientEmail: recipient.email,
      recipientLabel: recipient.label,
      subject: /^re:\s*/i.test(parentSubject)
        ? parentSubject
        : parentSubject === ''
          ? ''
          : `Re: ${parentSubject}`,
      inReplyTo: headerMessageId,
      parentMessageId: parentMessage.id,
      parentAssociationDirection: associations[0].direction,
      providerMessageExternalId:
        associations[0].messageExternalId?.trim() || null,
      providerThreadExternalId:
        associations[0].messageThreadExternalId?.trim() || null,
      managedMailboxId,
      connectedAccount: { ...account, handle: senderEmail },
    };
  }

  private toExpectedBinding(
    binding: ActionApprovalBindingEntity,
  ): MyahInboxReplyExpectedActionBindingWithWorkspace {
    if (
      binding.actionName !== this.actionName ||
      binding.actionVersion !== this.actionVersion ||
      binding.recipientFingerprint === null ||
      binding.sendingAccountFingerprint === null ||
      binding.actionContextFingerprint === null ||
      !Array.isArray(binding.evidenceLinks)
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    return {
      workspaceId: binding.workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      actionName: this.actionName,
      actionVersion: this.actionVersion,
      draftId: binding.draftId,
      contentDigest: binding.contentDigest,
      recipientFingerprint: binding.recipientFingerprint,
      sendingAccountFingerprint: binding.sendingAccountFingerprint,
      actionContextFingerprint: binding.actionContextFingerprint,
      threadId: binding.threadId,
      evidenceLinks: binding.evidenceLinks.map(
        ({ objectMetadataId, recordId, role }) => ({
          objectMetadataId,
          recordId,
          role,
        }),
      ),
    };
  }

  private toSendingAccountLabel({
    senderDisplayName,
    senderEmail,
  }: CanonicalMyahInboxReplyGraph): string {
    return senderDisplayName === null
      ? senderEmail
      : `${senderDisplayName} <${senderEmail}>`;
  }

  private isSupportedProvider(provider: ConnectedAccountProvider): boolean {
    return [
      ConnectedAccountProvider.GOOGLE,
      ConnectedAccountProvider.MICROSOFT,
      ConnectedAccountProvider.IMAP_SMTP_CALDAV,
      ConnectedAccountProvider.EMAIL_GROUP,
    ].includes(provider);
  }
}
