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

import { resolveMyahInboxReplyRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-myah-inbox-reply-recipient.util';
import {
  buildMyahInboxReplyExpectedActionBinding,
  matchesMyahInboxReplyBinding,
} from 'src/engine/core-modules/action-approval/utils/myah-inbox-reply-action-binding.util';
import {
  type CanonicalMyahInboxReplyGraph,
  type MyahInboxReplyActionAuthority,
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
  MyahInboxReplyActionAuthority,
  MyahInboxReplyReadableDraftSnapshot,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
import { MyahInboxReplyAuthorityContextService } from 'src/engine/core-modules/action-approval/services/myah-inbox-reply-authority-context.service';
import { ManagedEmailCampaignEligibilityService } from 'src/engine/core-modules/managed-email/services/managed-email-campaign-eligibility.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';

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

type LoadMode = 'execution' | 'projection';

@Injectable()
export class MyahInboxReplyActionDefinition {
  readonly actionName = 'send_inbox_reply' as const;
  readonly actionVersion = 1 as const;

  constructor(
    private readonly authorityContextService: MyahInboxReplyAuthorityContextService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    private readonly managedEmailCampaignEligibilityService: ManagedEmailCampaignEligibilityService,
  ) {}

  async buildAuthority({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    expectedDraftRevision,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    expectedDraftRevision?: number;
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
    });
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

    const graph = await this.loadCanonicalGraph({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      messageThreadId: binding.draftId,
      mode,
    });
    const authority = await this.toAuthority({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      graph,
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
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    graph: CanonicalMyahInboxReplyGraph;
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
      }),
    };
  }


  private async loadCanonicalGraph({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    expectedDraftRevision,
    mode,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    expectedDraftRevision?: number;
    mode: LoadMode;
  }): Promise<CanonicalMyahInboxReplyGraph> {
    const source = await this.authorityContextService.loadAuthoritySource({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId,
      mode,
    });

    const rawDraftMarkdown = source.messageThread?.myahReplyDraftBodyMarkdown;
    const subject = source.messageThread?.subject?.trim();
    const parentMessage = source.parentMessage;

    if (
      !source.messageThread ||
      source.messageThread.id !== messageThreadId ||
      typeof rawDraftMarkdown !== 'string' ||
      rawDraftMarkdown.trim().length === 0 ||
      !isNonEmptyString(subject) ||
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
      channel.type !== MessageChannelType.EMAIL
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
      );
    }

    const senderEmail = channel.handle.trim().toLowerCase();
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
        markdown: rawDraftMarkdown,
        blocknote: source.messageThread.myahReplyDraftBodyBlocknote,
      },
      connectedAccountId: account.id,
      messageChannelId: channel.id,
      senderEmail,
      senderDisplayName: account.name?.trim() || null,
      recipientEmail: recipient.email,
      recipientLabel: recipient.label,
      subject: /^re:\s*/i.test(subject) ? subject : `Re: ${subject}`,
      inReplyTo: headerMessageId,
      parentMessageId: parentMessage.id,
      providerMessageExternalId:
        associations[0].messageExternalId?.trim() || null,
      providerThreadExternalId:
        associations[0].messageThreadExternalId?.trim() || null,
      managedMailboxId,
      connectedAccount: account,
    };
  }

  private isSupportedProvider(provider: ConnectedAccountProvider): boolean {
    return [
      ConnectedAccountProvider.GOOGLE,
      ConnectedAccountProvider.MICROSOFT,
      ConnectedAccountProvider.IMAP_SMTP_CALDAV,
    ].includes(provider);
  }

}
