import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import {
  ConnectedAccountProvider,
  type ObjectRecord,
} from 'twenty-shared/types';
import { emailSchema } from 'twenty-shared/utils';
import { IsNull, type Repository } from 'typeorm';

import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import {
  type OutreachPreparationAuthority,
  type PreparedOutreachEmailDraft,
} from 'src/engine/core-modules/outreach-email/types/outreach-email.type';
import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { type CreateDraftResult } from 'src/modules/messaging/message-outbound-manager/types/create-draft-result.type';

const INTERNAL_REPOSITORY_OPTIONS = {
  shouldBypassPermissionChecks: true,
} as const;

type CampaignCreatorRecord = ObjectRecord & {
  id: string;
  name: string;
  creatorId: string | null;
  campaignId: string | null;
  selectedContactMethod: string | null;
};

type CreatorRecord = ObjectRecord & {
  id: string;
  name: string;
  email: string | null;
};

type CampaignRecord = ObjectRecord & {
  id: string;
  name: string;
};

type OutreachActionRecord = ObjectRecord & {
  id: string;
  name: string;
  campaignCreatorId: string;
  channel: 'EMAIL';
  status: 'PENDING';
  subject: string;
  body: string;
  contentDigest: string;
  recipientEmail: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderEmail: string;
  senderDisplayName: string | null;
  providerDraftExternalId: string;
  providerThreadExternalId: string | null;
  messageThreadId: string | null;
  inReplyTo: string | null;
};

type ResolvePreparationAuthorityInput = {
  workspaceId: string;
  campaignCreatorId: string;
  connectedAccountId: string;
  inReplyTo?: string;
};

type LoadedPreparationAuthority = {
  authority: OutreachPreparationAuthority;
  connectedAccount: ConnectedAccountEntity;
};

@Injectable()
export class OutreachEmailDraftService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    private readonly messageOutboundService: MessagingMessageOutboundService,
  ) {}

  async resolvePreparationAuthority(
    input: ResolvePreparationAuthorityInput,
  ): Promise<OutreachPreparationAuthority> {
    const loaded = await this.loadPreparationAuthority({
      ...input,
      outreachActionId: randomUUID(),
    });

    return loaded.authority;
  }

  async persistPreparedDraft({
    authority,
    composedEmail,
  }: {
    authority: OutreachPreparationAuthority;
    composedEmail: ComposedEmail;
  }): Promise<PreparedOutreachEmailDraft> {
    const loaded = await this.loadPreparationAuthority({
      workspaceId: authority.workspaceId,
      campaignCreatorId: authority.campaignCreatorId,
      connectedAccountId: authority.mailboxSelection.connectedAccountId,
      inReplyTo: authority.inReplyTo ?? undefined,
      outreachActionId: authority.outreachActionId,
    });

    this.assertAuthorityUnchanged(authority, loaded.authority);
    this.assertComposedEmailMatchesAuthority(
      authority,
      composedEmail,
      loaded.connectedAccount,
    );

    let draftResult: CreateDraftResult;

    try {
      draftResult = await this.messageOutboundService.createDraft(
        {
          to: [authority.recipientEmail],
          subject: composedEmail.sanitizedSubject,
          body: composedEmail.plainTextBody,
          html: composedEmail.sanitizedHtmlBody,
          attachments: [],
          inReplyTo: authority.inReplyTo ?? undefined,
          threadExternalId: authority.messageThreadExternalId ?? undefined,
          references: composedEmail.references,
        },
        loaded.connectedAccount,
      );
    } catch {
      throw new Error('Provider draft creation failed');
    }

    try {
      const providerThreadExternalId = this.resolveProviderThreadExternalId(
        authority,
        draftResult,
      );
      const contentDigest = computeActionContentDigest(
        JSON.stringify([
          composedEmail.sanitizedSubject,
          composedEmail.plainTextBody,
        ]),
      );

      await this.persistOutreachAction({
        authority,
        composedEmail,
        draftResult,
        providerThreadExternalId,
        contentDigest,
      });

      return {
        workspaceId: authority.workspaceId,
        outreachActionId: authority.outreachActionId,
        campaignCreatorId: authority.campaignCreatorId,
        creatorId: authority.creatorId,
        campaignId: authority.campaignId,
        recipientEmail: authority.recipientEmail,
        recipientLabel: authority.recipientLabel,
        campaignLabel: authority.campaignLabel,
        connectedAccountId: authority.mailboxSelection.connectedAccountId,
        messageChannelId: authority.mailboxSelection.messageChannelId,
        senderEmail: authority.mailboxSelection.senderEmail,
        senderDisplayName: authority.mailboxSelection.senderDisplayName,
        subject: composedEmail.sanitizedSubject,
        body: composedEmail.plainTextBody,
        contentDigest,
        providerDraftExternalId: draftResult.draftExternalId,
        providerThreadExternalId,
        headerMessageId: draftResult.headerMessageId,
        inReplyTo: authority.inReplyTo,
        messageThreadId: authority.messageThreadId,
      };
    } catch (error) {
      try {
        await this.messageOutboundService.deleteDraft(
          draftResult.draftExternalId,
          loaded.connectedAccount,
        );
      } catch {
        // Preserve the original post-creation failure for safe recovery.
      }

      throw error;
    }
  }

  private async loadPreparationAuthority(
    input: ResolvePreparationAuthorityInput & { outreachActionId: string },
  ): Promise<LoadedPreparationAuthority> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const campaignCreatorRepository =
          await this.globalWorkspaceOrmManager.getRepository<CampaignCreatorRecord>(
            input.workspaceId,
            'campaignCreator',
            INTERNAL_REPOSITORY_OPTIONS,
          );
        const creatorRepository =
          await this.globalWorkspaceOrmManager.getRepository<CreatorRecord>(
            input.workspaceId,
            'creator',
            INTERNAL_REPOSITORY_OPTIONS,
          );
        const campaignRepository =
          await this.globalWorkspaceOrmManager.getRepository<CampaignRecord>(
            input.workspaceId,
            'campaign',
            INTERNAL_REPOSITORY_OPTIONS,
          );
        const messageRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageWorkspaceEntity>(
            input.workspaceId,
            'message',
            INTERNAL_REPOSITORY_OPTIONS,
          );
        const associationRepository =
          await this.globalWorkspaceOrmManager.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
            input.workspaceId,
            'messageChannelMessageAssociation',
            INTERNAL_REPOSITORY_OPTIONS,
          );

        const campaignCreator = await campaignCreatorRepository.findOne({
          where: { id: input.campaignCreatorId },
        });

        if (!campaignCreator) {
          throw new Error('Campaign Creator was not found in this workspace');
        }

        if (!campaignCreator.creatorId || !campaignCreator.campaignId) {
          throw new Error(
            'Campaign Creator must reference one Creator and one Campaign',
          );
        }

        if (
          campaignCreator.selectedContactMethod?.trim().toUpperCase() !==
          'EMAIL'
        ) {
          throw new Error(
            'Campaign Creator is not selected for email outreach',
          );
        }

        const [creator, campaign] = await Promise.all([
          creatorRepository.findOne({
            where: { id: campaignCreator.creatorId },
          }),
          campaignRepository.findOne({
            where: { id: campaignCreator.campaignId },
          }),
        ]);

        if (!creator || !campaign) {
          throw new Error(
            'Campaign Creator must reference one Creator and one Campaign',
          );
        }

        const recipientEmail = creator.email?.trim();

        if (
          !isNonEmptyString(recipientEmail) ||
          !emailSchema.safeParse(recipientEmail).success
        ) {
          throw new Error('Creator does not have a valid email address');
        }

        const connectedAccount = await this.connectedAccountRepository.findOne({
          where: {
            id: input.connectedAccountId,
            workspaceId: input.workspaceId,
            archivedAt: IsNull(),
          },
        });

        this.assertAvailableConnectedAccount(
          connectedAccount,
          input.workspaceId,
          input.connectedAccountId,
        );

        const messageChannels = await this.messageChannelRepository.find({
          where: {
            workspaceId: input.workspaceId,
            connectedAccountId: connectedAccount.id,
            handle: connectedAccount.handle,
          },
          take: 2,
        });

        if (messageChannels.length !== 1) {
          throw new Error('Selected outreach mailbox is unavailable');
        }

        const [messageChannel] = messageChannels;

        if (
          messageChannel.workspaceId !== input.workspaceId ||
          messageChannel.connectedAccountId !== connectedAccount.id ||
          messageChannel.handle !== connectedAccount.handle
        ) {
          throw new Error('Selected outreach mailbox is unavailable');
        }

        const threadContext = await this.resolveThreadContext({
          inReplyTo: input.inReplyTo,
          messageChannelId: messageChannel.id,
          messageRepository,
          associationRepository,
        });
        const recipientLabel = isNonEmptyString(creator.name?.trim())
          ? creator.name.trim()
          : creator.id;
        const campaignLabel = isNonEmptyString(campaign.name?.trim())
          ? campaign.name.trim()
          : campaign.id;
        const senderDisplayName = isNonEmptyString(
          connectedAccount.name?.trim(),
        )
          ? connectedAccount.name.trim()
          : null;

        return {
          connectedAccount,
          authority: {
            workspaceId: input.workspaceId,
            outreachActionId: input.outreachActionId,
            campaignCreatorId: campaignCreator.id,
            creatorId: creator.id,
            campaignId: campaign.id,
            recipientEmail,
            recipientLabel,
            campaignLabel,
            mailboxSelection: {
              workspaceId: input.workspaceId,
              outreachActionId: input.outreachActionId,
              connectedAccountId: connectedAccount.id,
              messageChannelId: messageChannel.id,
              senderEmail: connectedAccount.handle,
              senderDisplayName,
            },
            ...threadContext,
          },
        };
      },
      buildSystemAuthContext(input.workspaceId),
    );
  }

  private assertAvailableConnectedAccount(
    connectedAccount: ConnectedAccountEntity | null,
    workspaceId: string,
    connectedAccountId: string,
  ): asserts connectedAccount is ConnectedAccountEntity {
    if (
      !connectedAccount ||
      connectedAccount.id !== connectedAccountId ||
      connectedAccount.workspaceId !== workspaceId ||
      connectedAccount.archivedAt !== null
    ) {
      throw new Error('Selected outreach mailbox is unavailable');
    }

    switch (connectedAccount.provider) {
      case ConnectedAccountProvider.GOOGLE:
      case ConnectedAccountProvider.MICROSOFT:
      case ConnectedAccountProvider.IMAP_SMTP_CALDAV:
        return;
      default:
        throw new Error('Selected outreach mailbox is unavailable');
    }
  }

  private async resolveThreadContext({
    inReplyTo,
    messageChannelId,
    messageRepository,
    associationRepository,
  }: {
    inReplyTo?: string;
    messageChannelId: string;
    messageRepository: WorkspaceRepository<MessageWorkspaceEntity>;
    associationRepository: WorkspaceRepository<MessageChannelMessageAssociationWorkspaceEntity>;
  }): Promise<{
    inReplyTo: string | null;
    messageThreadId: string | null;
    messageThreadExternalId: string | null;
  }> {
    if (inReplyTo === undefined) {
      return {
        inReplyTo: null,
        messageThreadId: null,
        messageThreadExternalId: null,
      };
    }

    const normalizedInReplyTo = inReplyTo.trim();

    if (!isNonEmptyString(normalizedInReplyTo)) {
      throw new Error('Reply parent does not belong to the selected mailbox');
    }

    const messages = await messageRepository.find({
      where: { headerMessageId: normalizedInReplyTo },
      take: 2,
    });

    if (
      messages.length !== 1 ||
      messages[0].headerMessageId !== normalizedInReplyTo ||
      !isNonEmptyString(messages[0].messageThreadId)
    ) {
      throw new Error('Reply parent does not belong to the selected mailbox');
    }

    const [message] = messages;
    const associations = await associationRepository.find({
      where: { messageId: message.id, messageChannelId },
      take: 2,
    });

    if (
      associations.length !== 1 ||
      associations[0].messageId !== message.id ||
      associations[0].messageChannelId !== messageChannelId ||
      !isNonEmptyString(associations[0].messageThreadExternalId)
    ) {
      throw new Error('Reply parent does not belong to the selected mailbox');
    }

    return {
      inReplyTo: normalizedInReplyTo,
      messageThreadId: message.messageThreadId,
      messageThreadExternalId: associations[0].messageThreadExternalId,
    };
  }

  private assertAuthorityUnchanged(
    expected: OutreachPreparationAuthority,
    actual: OutreachPreparationAuthority,
  ): void {
    if (
      expected.workspaceId !== actual.workspaceId ||
      expected.outreachActionId !== actual.outreachActionId ||
      expected.campaignCreatorId !== actual.campaignCreatorId ||
      expected.creatorId !== actual.creatorId ||
      expected.campaignId !== actual.campaignId ||
      expected.recipientEmail !== actual.recipientEmail ||
      expected.recipientLabel !== actual.recipientLabel ||
      expected.campaignLabel !== actual.campaignLabel ||
      expected.inReplyTo !== actual.inReplyTo ||
      expected.messageThreadId !== actual.messageThreadId ||
      expected.messageThreadExternalId !== actual.messageThreadExternalId ||
      expected.mailboxSelection.workspaceId !==
        actual.mailboxSelection.workspaceId ||
      expected.mailboxSelection.outreachActionId !==
        actual.mailboxSelection.outreachActionId ||
      expected.mailboxSelection.connectedAccountId !==
        actual.mailboxSelection.connectedAccountId ||
      expected.mailboxSelection.messageChannelId !==
        actual.mailboxSelection.messageChannelId ||
      expected.mailboxSelection.senderEmail !==
        actual.mailboxSelection.senderEmail ||
      expected.mailboxSelection.senderDisplayName !==
        actual.mailboxSelection.senderDisplayName
    ) {
      throw new Error('Outreach preparation authority has changed');
    }
  }

  private assertComposedEmailMatchesAuthority(
    authority: OutreachPreparationAuthority,
    composedEmail: ComposedEmail,
    connectedAccount: ConnectedAccountEntity,
  ): void {
    if (
      composedEmail.recipients.to.length !== 1 ||
      composedEmail.recipients.to[0] !== authority.recipientEmail ||
      composedEmail.recipients.cc.length !== 0 ||
      composedEmail.recipients.bcc.length !== 0 ||
      composedEmail.attachments.length !== 0 ||
      composedEmail.connectedAccount.id !==
        authority.mailboxSelection.connectedAccountId ||
      composedEmail.connectedAccount.id !== connectedAccount.id ||
      composedEmail.connectedAccount.workspaceId !== authority.workspaceId ||
      composedEmail.connectedAccount.archivedAt !== null ||
      composedEmail.connectedAccount.handle !==
        authority.mailboxSelection.senderEmail ||
      composedEmail.messageChannelId !==
        authority.mailboxSelection.messageChannelId ||
      !composedEmail.shouldPersistMessage ||
      (composedEmail.inReplyTo ?? null) !== authority.inReplyTo ||
      (composedEmail.threadExternalId ?? null) !==
        authority.messageThreadExternalId ||
      !isNonEmptyString(composedEmail.sanitizedSubject) ||
      !isNonEmptyString(composedEmail.plainTextBody)
    ) {
      throw new Error('Composed outreach email does not match its authority');
    }
  }

  private resolveProviderThreadExternalId(
    authority: OutreachPreparationAuthority,
    draftResult: CreateDraftResult,
  ): string | null {
    if (
      authority.messageThreadExternalId !== null &&
      isNonEmptyString(draftResult.threadExternalId) &&
      draftResult.threadExternalId !== authority.messageThreadExternalId
    ) {
      throw new Error('Provider draft thread does not match its authority');
    }

    return (
      authority.messageThreadExternalId ?? draftResult.threadExternalId ?? null
    );
  }

  private async persistOutreachAction({
    authority,
    composedEmail,
    draftResult,
    providerThreadExternalId,
    contentDigest,
  }: {
    authority: OutreachPreparationAuthority;
    composedEmail: ComposedEmail;
    draftResult: CreateDraftResult;
    providerThreadExternalId: string | null;
    contentDigest: string;
  }): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const outreachActionRepository =
        await this.globalWorkspaceOrmManager.getRepository<OutreachActionRecord>(
          authority.workspaceId,
          'outreachAction',
          INTERNAL_REPOSITORY_OPTIONS,
        );

      await outreachActionRepository.save({
        id: authority.outreachActionId,
        name: `${authority.campaignLabel}: ${authority.recipientLabel}`,
        campaignCreatorId: authority.campaignCreatorId,
        channel: 'EMAIL',
        status: 'PENDING',
        subject: composedEmail.sanitizedSubject,
        body: composedEmail.plainTextBody,
        contentDigest,
        recipientEmail: authority.recipientEmail,
        connectedAccountId: authority.mailboxSelection.connectedAccountId,
        messageChannelId: authority.mailboxSelection.messageChannelId,
        senderEmail: authority.mailboxSelection.senderEmail,
        senderDisplayName: authority.mailboxSelection.senderDisplayName,
        providerDraftExternalId: draftResult.draftExternalId,
        providerThreadExternalId,
        messageThreadId: authority.messageThreadId,
        inReplyTo: authority.inReplyTo,
      });
    }, buildSystemAuthContext(authority.workspaceId));
  }
}
