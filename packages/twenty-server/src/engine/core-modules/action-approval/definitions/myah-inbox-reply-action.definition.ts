import { MyahInboxReplyContextService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import {
  MyahInboxReplyContextDraftService,
  type AnchoredReplyIdentity,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import {
  ReplyChannel,
  ReplyContextKind,
  type ReplyTarget,
  type ReplyContext,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import {
  decodeMyahInboxContactId,
  encodeMyahInboxContactId,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
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
  buildMyahInboxReplyContextV2ExpectedActionBinding,
  buildMyahInboxReplyExpectedActionBinding,
  matchesMyahInboxReplyBinding,
} from 'src/engine/core-modules/action-approval/utils/myah-inbox-reply-action-binding.util';
import { normalizeMyahInboxReplyDraft } from 'src/engine/core-modules/action-approval/utils/normalize-myah-inbox-reply-draft.util';
import {
  type CanonicalMyahInboxReplyGraph,
  type MyahInboxReplyActionApprovalProposal,
  type MyahInboxReplyActionAuthority,
  type MyahInboxReplyActionProposal,
  type MyahInboxReplyDraft,
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
import { type MyahReplyContextSnapshot } from 'src/engine/core-modules/action-approval/types/action-approval.type';

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

export const MyahInboxReplyActionProposalInputZodSchema = z.union([
  z
    .object({
      messageThreadId: z.string().uuid(),
      expectedDraftRevision: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      target: z
        .object({
          channel: z.literal(ReplyChannel.EMAIL),
          contactId: z.string().min(1).max(512),
          threadId: z.string().uuid(),
        })
        .strict(),
      replyContext: z.union([
        z.object({ kind: z.literal(ReplyContextKind.GENERAL) }).strict(),
        z
          .object({
            kind: z.literal(ReplyContextKind.CAMPAIGN),
            campaignId: z.string().uuid(),
          })
          .strict(),
      ]),
      expectedDraftRevision: z.number().int().min(0),
    })
    .strict(),
]);

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
    private readonly contextService: MyahInboxReplyContextService,
    private readonly contextDrafts: MyahInboxReplyContextDraftService,
  ) {}

  async buildAuthority({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    expectedDraftRevision,
    agentChatThreadId,
    skipProviderPreflight,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    expectedDraftRevision?: number;
    agentChatThreadId?: string;
    skipProviderPreflight?: boolean;
  }): Promise<MyahInboxReplyActionAuthority> {
    const graph = await this.loadCanonicalGraph({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId,
      expectedDraftRevision,
      mode: 'execution',
      skipProviderPreflight,
    });

    return this.toAuthority({
      workspaceId,
      initiatorUserWorkspaceId,
      graph,
      agentChatThreadId,
    });
  }

  async readContextDraft(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    target: ReplyTarget;
    replyContext: ReplyContext;
    forAction?: boolean;
  }) {
    const authContext =
      await this.authorityContextService.getInitiatorAuthContext(
        input.workspaceId,
        input.initiatorUserWorkspaceId,
      );
    const request = {
      authContext,
      user: authContext.user,
      workspace: authContext.workspace,
      workspaceMemberId: authContext.workspaceMemberId,
      target: input.target,
      replyContext: input.replyContext,
      contactIdentity: decodeMyahInboxContactId(
        input.target.contactId,
        input.workspaceId,
      ),
    };
    const resolved = input.forAction
      ? await this.contextService.resolveForAction(request)
      : await this.contextService.resolveForRead(request);
    if (
      resolved.state === 'CONTEXT_UNAVAILABLE' ||
      input.target.channel !== ReplyChannel.EMAIL
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }
    const identity: AnchoredReplyIdentity = {
      workspaceId: input.workspaceId,
      contactAnchorKind: resolved.target.contactAnchor.kind,
      contactAnchorId: resolved.target.contactAnchor.id,
      channel: resolved.target.channel,
      deliveryTargetId: resolved.target.deliveryTargetId,
      context: resolved.selected,
    };
    return {
      resolved,
      identity,
      draft: await this.contextDrafts.read(identity),
    };
  }

  async buildContextAuthority(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    target: ReplyTarget;
    replyContext: ReplyContext;
    expectedDraftRevision?: number;
    agentChatThreadId?: string;
    skipProviderPreflight?: boolean;
  }): Promise<MyahInboxReplyActionAuthority> {
    const { resolved, draft } = await this.readContextDraft({
      ...input,
      forAction: true,
    });
    const effectiveFingerprint =
      draft.reviewedContextFingerprint ?? draft.proposalContextFingerprint;
    if (
      !draft.draftId ||
      !draft.body ||
      !effectiveFingerprint ||
      effectiveFingerprint !== resolved.contextFingerprint ||
      !resolved.eligibilityEvidenceDigest ||
      (input.expectedDraftRevision !== undefined &&
        input.expectedDraftRevision !== draft.revision)
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }
    return this.buildContextDraftAuthority({
      ...input,
      messageThreadId: resolved.target.deliveryTargetId,
      contextDraft: {
        draftId: draft.draftId,
        body: draft.body,
        revision: draft.revision,
        snapshot: {
          schemaVersion: 1,
          channel: 'EMAIL',
          deliveryTargetId: resolved.target.deliveryTargetId,
          draftId: draft.draftId,
          replyContext: resolved.selected,
          contactAnchor: resolved.target
            .contactAnchor as MyahReplyContextSnapshot['contactAnchor'],
          creatorId: resolved.target.creatorId,
          eligibilityEvidenceDigest: resolved.eligibilityEvidenceDigest,
          authoredContextFingerprint: draft.proposalContextFingerprint,
          reviewedContextFingerprint: draft.reviewedContextFingerprint,
          contextFingerprint: effectiveFingerprint,
        },
      },
    });
  }

  async buildContextDraftAuthority({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    contextDraft,
    agentChatThreadId,
    skipProviderPreflight,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    contextDraft: {
      draftId: string;
      revision: number;
      body: MyahInboxReplyDraft;
      snapshot: MyahReplyContextSnapshot;
    };
    agentChatThreadId?: string;
    skipProviderPreflight?: boolean;
  }): Promise<MyahInboxReplyActionAuthority> {
    if (
      contextDraft.snapshot.channel !== 'EMAIL' ||
      contextDraft.snapshot.draftId !== contextDraft.draftId ||
      contextDraft.snapshot.deliveryTargetId !== messageThreadId
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }
    const graph = await this.loadCanonicalGraph({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId,
      mode: 'execution',
      skipProviderPreflight,
      draftOverride: {
        body: contextDraft.body,
        revision: contextDraft.revision,
      },
    });
    const evidenceObjectMetadataIds =
      await this.authorityContextService.resolveEvidenceObjectMetadataIds(
        workspaceId,
      );
    return {
      canonicalGraph: graph,
      expectedActionBinding: buildMyahInboxReplyContextV2ExpectedActionBinding({
        workspaceId,
        initiatorUserWorkspaceId,
        graph,
        evidenceObjectMetadataIds,
        snapshot: contextDraft.snapshot,
        agentChatThreadId,
      }),
    };
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
    const authority =
      'target' in input
        ? await this.buildContextAuthority({
            workspaceId,
            initiatorUserWorkspaceId,
            agentChatThreadId,
            ...input,
          })
        : await this.buildAuthority({
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

  private snapshotSelection(
    workspaceId: string,
    snapshot: MyahReplyContextSnapshot,
  ) {
    return {
      target: {
        channel: ReplyChannel.EMAIL as const,
        threadId: snapshot.deliveryTargetId,
        contactId: encodeMyahInboxContactId({
          workspaceId,
          identity: {
            kind:
              snapshot.contactAnchor.kind === 'CREATOR'
                ? 'creator'
                : 'email-thread',
            recordId: snapshot.contactAnchor.id,
          },
        }),
      },
      replyContext:
        snapshot.replyContext.kind === 'CAMPAIGN'
          ? {
              kind: ReplyContextKind.CAMPAIGN as const,
              campaignId: snapshot.replyContext.campaignId,
            }
          : { kind: ReplyContextKind.GENERAL as const },
    };
  }

  async getProposal({
    workspaceId,
    binding,
  }: {
    workspaceId: string;
    binding: ActionApprovalBindingEntity;
  }): Promise<MyahInboxReplyActionApprovalProposal> {
    if (binding.actionVersion === 2 && binding.myahReplyContextSnapshot) {
      await this.readContextDraft({
        workspaceId,
        initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
        ...this.snapshotSelection(
          workspaceId,
          binding.myahReplyContextSnapshot,
        ),
      });
    }
    const authority = await this.rebuildProjectionAuthority({
      workspaceId,
      binding: this.toExpectedBinding(binding),
    });
    const graph = authority.canonicalGraph;

    return {
      action: 'send_inbox_reply',
      actionVersion: binding.actionVersion as 1 | 2,
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
    skipProviderPreflight,
  }: {
    workspaceId: string;
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
    skipProviderPreflight?: boolean;
  }): Promise<MyahInboxReplyActionAuthority> {
    return this.rebuildAuthority({
      workspaceId,
      binding,
      mode: 'execution',
      skipProviderPreflight,
    });
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
    skipProviderPreflight,
  }: {
    workspaceId: string;
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
    mode: LoadMode;
    skipProviderPreflight?: boolean;
  }): Promise<MyahInboxReplyActionAuthority> {
    if (
      binding.actionName !== this.actionName ||
      binding.workspaceId !== workspaceId
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }
    if (binding.actionVersion === 2) {
      const snapshot = binding.myahReplyContextSnapshot;
      const validForm =
        binding.threadId !== null
          ? binding.interactionContextType === null &&
            binding.interactionContextId === null
          : binding.interactionContextType ===
              'MYAH_INBOX_EMAIL_CONTEXT_DRAFT' &&
            binding.interactionContextId === binding.draftId;
      if (
        !validForm ||
        snapshot.channel !== 'EMAIL' ||
        snapshot.draftId !== binding.draftId
      ) {
        throw new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
        );
      }
      let authority: MyahInboxReplyActionAuthority;
      if (mode === 'execution') {
        authority = await this.buildContextAuthority({
          workspaceId,
          initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
          ...this.snapshotSelection(workspaceId, snapshot),
          agentChatThreadId: binding.threadId ?? undefined,
          skipProviderPreflight,
        });
      } else {
        // Provider acceptance is immutable: Campaign changes must never un-send it.
        const draft = await this.contextDrafts.read({
          workspaceId,
          channel: ReplyChannel.EMAIL,
          deliveryTargetId: snapshot.deliveryTargetId,
          contactAnchorKind: snapshot.contactAnchor.kind,
          contactAnchorId: snapshot.contactAnchor.id,
          context:
            snapshot.replyContext.kind === 'CAMPAIGN'
              ? {
                  kind: ReplyContextKind.CAMPAIGN,
                  campaignId: snapshot.replyContext.campaignId,
                }
              : { kind: ReplyContextKind.GENERAL },
        });
        const parentMessageId = binding.evidenceLinks.find(
          (link) => link.role === 'thread_parent',
        )?.recordId;
        if (
          draft.draftId !== snapshot.draftId ||
          !draft.body ||
          !parentMessageId
        ) {
          throw new MyahInboxReplyUnavailableError(
            MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
          );
        }
        const graph = await this.loadCanonicalGraph({
          workspaceId,
          initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
          messageThreadId: snapshot.deliveryTargetId,
          mode,
          parentMessageId,
          draftOverride: { body: draft.body, revision: draft.revision },
        });
        authority = {
          canonicalGraph: graph,
          expectedActionBinding:
            buildMyahInboxReplyContextV2ExpectedActionBinding({
              workspaceId,
              initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
              graph,
              snapshot,
              agentChatThreadId: binding.threadId ?? undefined,
              evidenceObjectMetadataIds:
                await this.authorityContextService.resolveEvidenceObjectMetadataIds(
                  workspaceId,
                ),
            }),
        };
      }
      if (
        !matchesMyahInboxReplyBinding(
          mode === 'projection'
            ? {
                ...binding,
                sendingAccountFingerprint:
                  authority.expectedActionBinding.sendingAccountFingerprint,
              }
            : binding,
          authority.expectedActionBinding,
        )
      ) {
        throw new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
        );
      }
      return authority;
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
      skipProviderPreflight,
      parentMessageId: projectionParentMessageId,
    });
    const authority = await this.toAuthority({
      workspaceId,
      initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
      graph,
      agentChatThreadId: binding.threadId ?? undefined,
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
    draftOverride,
    skipProviderPreflight,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    expectedDraftRevision?: number;
    mode: LoadMode;
    parentMessageId?: string;
    draftOverride?: { body: MyahInboxReplyDraft; revision: number };
    skipProviderPreflight?: boolean;
  }): Promise<CanonicalMyahInboxReplyGraph> {
    const source = await this.authorityContextService.loadAuthoritySource({
      workspaceId,
      initiatorUserWorkspaceId,
      messageThreadId,
      mode,
      parentMessageId,
    });

    const draftBody =
      draftOverride?.body ??
      (source.messageThread
        ? normalizeMyahInboxReplyDraft(source.messageThread)
        : null);
    const parentMessage = source.parentMessage;
    const parentSubject = parentMessage?.subject?.trim() ?? '';

    if (
      !source.messageThread ||
      source.messageThread.id !== messageThreadId ||
      draftBody === null ||
      draftBody.markdown.trim().length === 0 ||
      (expectedDraftRevision !== undefined &&
        (draftOverride?.revision ??
          source.messageThread.myahReplyDraftRevision) !==
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
        if (!skipProviderPreflight) {
          await this.messagingMessageOutboundService.assertConnectedAccountSendable(
            account,
          );
        }
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
      draftRevision:
        draftOverride?.revision ?? source.messageThread.myahReplyDraftRevision,
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
      ![1, 2].includes(binding.actionVersion) ||
      binding.recipientFingerprint === null ||
      binding.sendingAccountFingerprint === null ||
      binding.actionContextFingerprint === null ||
      (binding.actionVersion === 1 && binding.threadId === null) ||
      !Array.isArray(binding.evidenceLinks)
    ) {
      throw new MyahInboxReplyUnavailableError(
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      );
    }

    if (binding.actionVersion === 2) {
      if (
        !binding.myahReplyContextSnapshot ||
        (binding.interactionContextType !== null &&
          binding.interactionContextType !== 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT')
      ) {
        throw new MyahInboxReplyUnavailableError(
          MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
        );
      }
      return {
        workspaceId: binding.workspaceId,
        initiatorUserWorkspaceId: binding.initiatorUserWorkspaceId,
        actionName: 'send_inbox_reply',
        actionVersion: 2,
        draftId: binding.draftId,
        contentDigest: binding.contentDigest,
        recipientFingerprint: binding.recipientFingerprint,
        sendingAccountFingerprint: binding.sendingAccountFingerprint,
        actionContextFingerprint: binding.actionContextFingerprint,
        threadId: binding.threadId,
        interactionContextType: binding.interactionContextType,
        interactionContextId: binding.interactionContextId,
        myahReplyContextSnapshot: binding.myahReplyContextSnapshot,
        evidenceLinks: binding.evidenceLinks,
      };
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
      threadId: binding.threadId!,
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
