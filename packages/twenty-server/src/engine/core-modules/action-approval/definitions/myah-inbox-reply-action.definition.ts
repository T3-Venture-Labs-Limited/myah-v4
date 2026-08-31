import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
  type ObjectRecord,
} from 'twenty-shared/types';
import { emailSchema } from 'twenty-shared/utils';
import { In, type Repository } from 'typeorm';

import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import {
  type ActionEvidenceLinkInput,
  type MyahInboxReplyExpectedActionBinding,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { resolveMyahInboxReplyRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-myah-inbox-reply-recipient.util';
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

export enum MyahInboxReplyUnavailableCode {
  THREAD_UNAVAILABLE = 'THREAD_UNAVAILABLE',
  SENDER_UNAVAILABLE = 'SENDER_UNAVAILABLE',
  RECIPIENT_UNAVAILABLE = 'RECIPIENT_UNAVAILABLE',
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  MAILBOX_INELIGIBLE = 'MAILBOX_INELIGIBLE',
}

export class MyahInboxReplyUnavailableError extends Error {
  constructor(readonly code: MyahInboxReplyUnavailableCode) {
    super(code);
  }
}

type InboxMessageThreadRecord = ObjectRecord & {
  id: string;
  subject: string | null;
  myahReplyDraftBodyMarkdown: string | null;
  myahReplyDraftBodyBlocknote: string | null;
  myahReplyDraftRevision: number;
};

type InboxParentMessageRecord = MessageWorkspaceEntity & {
  messageParticipants: MessageParticipantWorkspaceEntity[];
  messageChannelMessageAssociations: MessageChannelMessageAssociationWorkspaceEntity[];
};

type MyahInboxReplyEvidenceObjectMetadataIds = {
  message: string;
  messageThread: string;
};

type MyahInboxReplyExpectedActionBindingWithWorkspace =
  MyahInboxReplyExpectedActionBinding & { workspaceId: string };

type LoadMode = 'execution' | 'projection';

export type CanonicalMyahInboxReplyGraph = {
  messageThreadId: string;
  draftRevision: number;
  draftBody: { markdown: string; blocknote: string | null };
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
  recipientEmail: string;
  recipientLabel: string;
  subject: string;
  inReplyTo: string;
  parentMessageId: string;
  providerMessageExternalId: string | null;
  providerThreadExternalId: string | null;
  managedMailboxId: string | null;
  connectedAccount: ConnectedAccountEntity;
};

export type MyahInboxReplyActionAuthority = {
  expectedActionBinding: MyahInboxReplyExpectedActionBindingWithWorkspace;
  canonicalGraph: CanonicalMyahInboxReplyGraph;
};

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
    expectedDraftRevision: number;
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

    if (!this.matchesBinding(binding, authority.expectedActionBinding)) {
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
      expectedActionBinding: this.buildExpectedActionBinding({
        workspaceId,
        initiatorUserWorkspaceId,
        graph,
        evidenceObjectMetadataIds,
      }),
    };
  }

  private buildExpectedActionBinding({
    workspaceId,
    initiatorUserWorkspaceId,
    graph,
    evidenceObjectMetadataIds,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    graph: CanonicalMyahInboxReplyGraph;
    evidenceObjectMetadataIds: MyahInboxReplyEvidenceObjectMetadataIds;
  }): MyahInboxReplyExpectedActionBindingWithWorkspace {
    const evidenceLinks: ActionEvidenceLinkInput[] = [
      {
        objectMetadataId: evidenceObjectMetadataIds.messageThread,
        recordId: graph.messageThreadId,
        role: 'draft',
      },
      {
        objectMetadataId: evidenceObjectMetadataIds.message,
        recordId: graph.parentMessageId,
        role: 'thread_parent',
      },
    ];

    return {
      workspaceId,
      actionName: this.actionName,
      actionVersion: this.actionVersion,
      draftId: graph.messageThreadId,
      contentDigest: computeActionContentDigest(
        JSON.stringify([graph.subject, graph.draftBody.markdown]),
      ),
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify([graph.recipientEmail]),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          graph.managedMailboxId,
          graph.connectedAccountId,
          graph.messageChannelId,
          graph.senderEmail,
          graph.senderDisplayName,
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          graph.draftRevision,
          graph.inReplyTo,
          graph.messageThreadId,
          graph.providerThreadExternalId,
          graph.providerMessageExternalId,
        ]),
      ),
      threadId: graph.messageThreadId,
      initiatorUserWorkspaceId,
      evidenceLinks,
    };
  }

  private matchesBinding(
    actual: MyahInboxReplyExpectedActionBindingWithWorkspace,
    expected: MyahInboxReplyExpectedActionBindingWithWorkspace,
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

    const comparableEvidence = (evidence: readonly ActionEvidenceLinkInput[]) =>
      evidence
        .map(({ objectMetadataId, recordId, role }) =>
          JSON.stringify([objectMetadataId, recordId, role]),
        )
        .sort();

    return (
      JSON.stringify(comparableEvidence(actual.evidenceLinks)) ===
      JSON.stringify(comparableEvidence(expected.evidenceLinks))
    );
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

    const draftMarkdown = source.messageThread?.myahReplyDraftBodyMarkdown?.trim();
    const subject = source.messageThread?.subject?.trim();
    const parentMessage = source.parentMessage;

    if (
      !source.messageThread ||
      source.messageThread.id !== messageThreadId ||
      !isNonEmptyString(draftMarkdown) ||
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

    if (!isNonEmptyString(headerMessageId)) {
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
      [account.handle, ...(account.handleAliases ?? []), channel.handle]
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
        markdown: draftMarkdown,
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
    return (
      provider === ConnectedAccountProvider.GOOGLE ||
      provider === ConnectedAccountProvider.MICROSOFT ||
      provider === ConnectedAccountProvider.IMAP_SMTP_CALDAV
    );
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
