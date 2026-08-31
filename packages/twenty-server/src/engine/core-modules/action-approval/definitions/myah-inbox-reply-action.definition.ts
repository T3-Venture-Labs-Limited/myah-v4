import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';
import { emailSchema } from 'twenty-shared/utils';
import { In, type Repository } from 'typeorm';

import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { resolveMyahInboxReplyRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-myah-inbox-reply-recipient.util';
import {
  buildMyahInboxReplyExpectedActionBinding,
  matchesMyahInboxReplyBinding,
} from 'src/engine/core-modules/action-approval/utils/myah-inbox-reply-action-binding.util';
import {
  type CanonicalMyahInboxReplyGraph,
  type InboxMessageThreadRecord,
  type InboxParentMessageRecord,
  type MyahInboxReplyActionAuthority,
  type MyahInboxReplyEvidenceObjectMetadataIds,
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
import { ManagedEmailCampaignEligibilityService } from 'src/engine/core-modules/managed-email/services/managed-email-campaign-eligibility.service';
import { type FlatUser } from 'src/engine/core-modules/user/types/flat-user.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

const isValidMessageId = (value: string): boolean => {
  const match = /^<([^@<>]+)@([^@<>]+)>$/.exec(value);
  if (!match) return false;
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(match[1]) &&
    match[2].split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
};

type LoadMode = 'execution' | 'projection';

@Injectable()
export class MyahInboxReplyActionDefinition {
  readonly actionName = 'send_inbox_reply' as const;
  readonly actionVersion = 1 as const;

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
    const workspace = await this.workspaceRepository.findOneBy({ id: workspaceId });
    if (!workspace) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }
    const authContext = await this.buildInitiatorAuthContext(
      workspace,
      initiatorUserWorkspaceId,
    );
    const messageThread = await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<InboxMessageThreadRecord>(
            workspaceId,
            'messageThread',
          );

        return repository.findOneBy({ id: messageThreadId });
      },
      authContext,
    );
    if (!messageThread || messageThread.id !== messageThreadId) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    const evidenceObjectMetadataIds =
      await this.resolveEvidenceObjectMetadataIds(workspaceId);

    return {
      revision: messageThread.myahReplyDraftRevision,
      body:
        messageThread.myahReplyDraftBodyMarkdown === null
          ? null
          : {
              markdown: messageThread.myahReplyDraftBodyMarkdown,
              blocknote: messageThread.myahReplyDraftBodyBlocknote,
            },
      messageThreadMetadataId: evidenceObjectMetadataIds.messageThread,
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
    if (binding.actionName !== this.actionName || binding.workspaceId !== workspaceId) {
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

    if (!matchesMyahInboxReplyBinding(binding, authority.expectedActionBinding)) {
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
      await this.resolveEvidenceObjectMetadataIds(workspaceId);

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


  private async resolveEvidenceObjectMetadataIds(
    workspaceId: string,
  ): Promise<MyahInboxReplyEvidenceObjectMetadataIds> {
    const metadata = await this.objectMetadataRepository.find({
      where: {
        workspaceId,
        universalIdentifier: In([
          STANDARD_OBJECTS.messageThread.universalIdentifier,
          STANDARD_OBJECTS.message.universalIdentifier,
        ]),
      },
      select: { id: true, workspaceId: true, universalIdentifier: true },
    });
    const messageThread = metadata.find(
      ({ workspaceId: itemWorkspaceId, universalIdentifier }) =>
        itemWorkspaceId === workspaceId &&
        universalIdentifier === STANDARD_OBJECTS.messageThread.universalIdentifier,
    )?.id;
    const message = metadata.find(
      ({ workspaceId: itemWorkspaceId, universalIdentifier }) =>
        itemWorkspaceId === workspaceId &&
        universalIdentifier === STANDARD_OBJECTS.message.universalIdentifier,
    )?.id;

    if (!messageThread || !message) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    return { messageThread, message };
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
    const workspace = await this.workspaceRepository.findOneBy({ id: workspaceId });

    if (!workspace) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    const authContext =
      mode === 'projection'
        ? buildSystemAuthContext(workspaceId)
        : await this.buildInitiatorAuthContext(workspace, initiatorUserWorkspaceId);
    const source = await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const messageThreadRepository =
          await this.globalWorkspaceOrmManager.getRepository<InboxMessageThreadRecord>(
            workspaceId,
            'messageThread',
          );
        const messageRepository =
          await this.globalWorkspaceOrmManager.getRepository<InboxParentMessageRecord>(
            workspaceId,
            'message',
          );
        const messageThread = await messageThreadRepository.findOneBy({
          id: messageThreadId,
        });
        const messages = await messageRepository.find({
          where: { messageThreadId, isDraft: false },
          relations: {
            messageParticipants: true,
            messageChannelMessageAssociations: true,
          },
          order: { receivedAt: 'DESC', id: 'DESC' },
          take: 1,
        });

        return { messageThread, parentMessage: messages[0] };
      },
      authContext,
    );

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
        source.messageThread.myahReplyDraftRevision !== expectedDraftRevision) ||
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

    if (!isNonEmptyString(headerMessageId) || !isValidMessageId(headerMessageId)) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    if (associations.length !== 1 || !isNonEmptyString(associations[0].messageChannelId)) {
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
        id: In(messageChannels.map(({ connectedAccountId }) => connectedAccountId)),
      },
    });
    const channel = messageChannels.find(
      ({ id, workspaceId: channelWorkspaceId }) =>
        id === associations[0].messageChannelId && channelWorkspaceId === workspaceId,
    );
    const account = channel
      ? connectedAccounts.find(
          ({ id, workspaceId: accountWorkspaceId }) =>
            id === channel.connectedAccountId && accountWorkspaceId === workspaceId,
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

    if (!emailSchema.safeParse(senderEmail).success || !senderHandles.has(senderEmail)) {
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
      providerMessageExternalId: associations[0].messageExternalId?.trim() || null,
      providerThreadExternalId:
        associations[0].messageThreadExternalId?.trim() || null,
      managedMailboxId,
      connectedAccount: account,
    };
  }

  private isSupportedProvider(provider: ConnectedAccountProvider): boolean {
    return [ConnectedAccountProvider.GOOGLE, ConnectedAccountProvider.MICROSOFT, ConnectedAccountProvider.IMAP_SMTP_CALDAV].includes(provider);
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
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
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
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
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
