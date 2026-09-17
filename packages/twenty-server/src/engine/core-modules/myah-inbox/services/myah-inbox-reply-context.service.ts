import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

import { In, IsNull } from 'typeorm';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

import {
  MyahInboxReplyDraftExecutionState,
  type MyahInboxResolvedReplyContext,
  type MyahInboxResolvedReplyTarget,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context-draft.dto';
import {
  type ReplyContext,
  type ReplyTarget,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import {
  type MyahInboxListThreadsInput,
  MyahInboxQueryService,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { type MyahInboxContactIdentity } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { EmailReplyContextActivationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-preflight.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

export type ReplyContextRequest = Pick<
  MyahInboxListThreadsInput,
  'authContext' | 'user' | 'workspace' | 'workspaceMemberId'
> & {
  target: ReplyTarget;
  replyContext: ReplyContext;
  contactIdentity: MyahInboxContactIdentity;
};

export type ThreadCampaign =
  | { state: 'READABLE'; campaign: { id: string; name: string } }
  | { state: 'UNASSOCIATED' | 'UNAVAILABLE' }
  | null;

const isReplyTargetIdentityCompatible = (input: {
  target: ReplyTarget;
  contactIdentity?: MyahInboxContactIdentity;
}): boolean => {
  const identity = input.contactIdentity;

  if (!identity) {
    return false;
  }

  switch (input.target.channel) {
    case 'EMAIL':
      return (
        (identity.kind === 'email-thread' &&
          identity.recordId === input.target.threadId) ||
        identity.kind === 'creator'
      );
    case 'INSTAGRAM':
      return (
        identity.kind === 'instagram-conversation' &&
        identity.recordId === input.target.conversationId
      );
    default:
      return false;
  }
};

export type ResolvedReplyTarget = {
  channel: ReplyTarget['channel'];
  deliveryTargetId: string;
  contactAnchor: { kind: string; id: string };
  creatorId: string | null;
};

export type ResolvedReplyContext = {
  target: ResolvedReplyTarget;
  selected: ReplyContext;
  state:
    | 'READY'
    | 'SELECTION_REQUIRED'
    | 'GENERAL_AVAILABLE'
    | 'CONTEXT_UNAVAILABLE'
    | 'NEEDS_REVIEW';
  contextFingerprint: string | null;
  eligibilityEvidenceDigest?: string;
  campaignName?: string | null;
  threadCampaign: ThreadCampaign;
};

export type CurrentReplyContextEvidence = {
  readable: boolean;
  eligible: boolean;
  target: ResolvedReplyTarget;
  contextFingerprint: string | null;
  eligibilityEvidenceDigest?: string;
  campaignName?: string | null;
  threadCampaign: ThreadCampaign;
};

export type MyahInboxReplyContextEvidenceResolver = {
  resolveCurrentEvidence(
    input: ReplyContextRequest,
  ): Promise<CurrentReplyContextEvidence>;
};

export const MYAH_INBOX_REPLY_CONTEXT_EVIDENCE_RESOLVER = Symbol(
  'MYAH_INBOX_REPLY_CONTEXT_EVIDENCE_RESOLVER',
);

@Injectable()
export class MyahInboxReplyContextQueryEvidenceResolver implements MyahInboxReplyContextEvidenceResolver {
  constructor(
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly messageVisibilityPolicyService: MessageVisibilityPolicyService,
  ) {}

  async resolveCurrentEvidence(
    input: ReplyContextRequest,
  ): Promise<CurrentReplyContextEvidence> {
    const targetInput = input.target;
    if (
      !isUserAuthContext(input.authContext) ||
      targetInput.channel !== 'EMAIL'
    ) {
      return this.unavailable(input);
    }

    const userWorkspaceId = input.authContext.userWorkspaceId;
    try {
      // The thread summary is the Inbox visibility authority. Required context
      // records are then re-read independently so optional summary relations
      // cannot turn a hidden/deleted Creator or Campaign into removed evidence.
      await this.myahInboxQueryService.getThreadSummary({
        ...input,
        threadId: targetInput.threadId,
      });

      return await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const workspaceContext = getWorkspaceContext();
          const rolePermissionConfig = resolveRolePermissionConfig({
            authContext: input.authContext,
            userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
            apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
          });

          if (!rolePermissionConfig) {
            return this.unavailable(input);
          }

          const [threadRepository, creatorRepository, campaignRepository] =
            await Promise.all([
              this.globalWorkspaceOrmManager.getRepository<{
                id: string;
                creatorId: string | null;
                myahCampaignId: string | null;
                deletedAt: Date | null;
              }>(input.workspace.id, 'messageThread', rolePermissionConfig),
              this.globalWorkspaceOrmManager.getRepository<{
                id: string;
                name: string | null;
                language: string | null;
                location: string | null;
                categories: string | null;
                niches: string | null;
                deletedAt: Date | null;
              }>(input.workspace.id, 'creator', rolePermissionConfig),
              this.globalWorkspaceOrmManager.getRepository<{
                id: string;
                name: string | null;
                deletedAt: Date | null;
                objective: string | null;
                icpGoal: string | null;
                campaignBriefMarkdown: string | null;
                campaignBrief: { markdown: string | null } | null;
                communicationGuidelinesMarkdown: string | null;
                communicationGuidelines: { markdown: string | null } | null;
                replyRulesMarkdown: string | null;
                replyRules: { markdown: string | null } | null;
                escalationBoundariesMarkdown: string | null;
                escalationBoundaries: { markdown: string | null } | null;
                additionalNotesMarkdown: string | null;
                additionalNotes: { markdown: string | null } | null;
                emailSignatureMarkdown: string | null;
                emailSignature: { markdown: string | null } | null;
              }>(input.workspace.id, 'campaign', rolePermissionConfig),
            ]);
          const thread = await threadRepository.findOne({
            where: { id: targetInput.threadId, deletedAt: IsNull() },
            select: { id: true, creatorId: true, myahCampaignId: true },
          });

          if (!thread) {
            return this.unavailable(input);
          }

          const identity = input.contactIdentity;
          const creator = thread.creatorId
            ? await creatorRepository.findOne({
                where: { id: thread.creatorId, deletedAt: IsNull() },
                select: {
                  id: true,
                  name: true,
                  language: true,
                  location: true,
                  categories: true,
                  niches: true,
                },
              })
            : null;
          const selectedCampaign =
            input.replyContext.kind === 'CAMPAIGN'
              ? await campaignRepository.findOne({
                  where: {
                    id: input.replyContext.campaignId,
                    deletedAt: IsNull(),
                  },
                  select: {
                    id: true,
                    name: true,
                    objective: true,
                    icpGoal: true,
                    campaignBriefMarkdown: true,
                    communicationGuidelinesMarkdown: true,
                    replyRulesMarkdown: true,
                    escalationBoundariesMarkdown: true,
                    additionalNotesMarkdown: true,
                    emailSignatureMarkdown: true,
                  },
                })
              : null;

          if (
            !creator ||
            identity.kind !== 'creator' ||
            identity.recordId !== creator.id ||
            (input.replyContext.kind === 'CAMPAIGN' && !selectedCampaign)
          ) {
            return this.unavailable(input);
          }

          const target: ResolvedReplyTarget = {
            channel: input.target.channel,
            deliveryTargetId: targetInput.threadId,
            // Linked threads require an immutable Creator anchor, never a thread alias.
            contactAnchor: { kind: 'CREATOR', id: creator.id },
            creatorId: creator.id,
          };
          const threadCampaign: ThreadCampaign =
            thread.myahCampaignId &&
            selectedCampaign?.id === thread.myahCampaignId
              ? {
                  state: 'READABLE',
                  campaign: {
                    id: selectedCampaign.id,
                    name: selectedCampaign.name ?? '',
                  },
                }
              : { state: 'UNASSOCIATED' };

          const campaignCreatorRepository =
            await this.globalWorkspaceOrmManager.getRepository<{
              id: string;
              creatorId: string;
              campaignId: string;
              deletedAt: Date | null;
              stage: string | null;
              selectedContactMethod: string | null;
              nextActionAt: Date | null;
              selectionReason: string | null;
              dealSummary: string | null;
            }>(input.workspace.id, 'campaignCreator', rolePermissionConfig);
          const terms = selectedCampaign
            ? await campaignCreatorRepository.find({
                where: {
                  creatorId: creator.id,
                  campaignId: selectedCampaign.id,
                  deletedAt: IsNull(),
                },
                select: {
                  id: true,
                  creatorId: true,
                  campaignId: true,
                  stage: true,
                  selectedContactMethod: true,
                  nextActionAt: true,
                  selectionReason: true,
                  dealSummary: true,
                },
                order: { id: 'ASC' },
              })
            : [];
          const evidenceIds: string[] = [];
          if (selectedCampaign) {
            const legacyThreads = await threadRepository.find({
              where: {
                creatorId: creator.id,
                myahCampaignId: selectedCampaign.id,
                deletedAt: IsNull(),
              },
              select: { id: true },
            });
            const legacyThreadIds = legacyThreads.map((thread) => thread.id);
            const outreachRepository =
              await this.globalWorkspaceOrmManager.getRepository<{
                id: string;
                campaignCreatorId: string;
                channel: string;
                status: string;
                messageId: string | null;
                completedAt: Date | null;
                deletedAt: Date | null;
              }>(input.workspace.id, 'outreachAction', rolePermissionConfig);
            const outreach = terms.length
              ? await outreachRepository.find({
                  where: {
                    campaignCreatorId: In(terms.map((term) => term.id)),
                    channel: 'EMAIL',
                    status: 'APPLIED',
                    deletedAt: IsNull(),
                  },
                  select: { id: true, messageId: true, completedAt: true },
                })
              : [];
            const messageIds = outreach.flatMap((action) =>
              action.messageId && action.completedAt ? [action.messageId] : [],
            );
            const messages =
              await this.globalWorkspaceOrmManager.getRepository<{
                id: string;
              }>(input.workspace.id, 'message', rolePermissionConfig);
            const visibility =
              this.messageVisibilityPolicyService.buildSqlVisibilityProjection({
                workspaceId: input.workspace.id,
                userWorkspaceId,
                messageIdExpression: 'message.id',
              });
            const schema = getWorkspaceSchemaName(input.workspace.id);
            const delivered = await messages
              .createQueryBuilder('message')
              .select('message.id', 'id')
              .where(
                '((:hasEvidenceIds AND message.id IN (:...evidenceMessageIds)) OR (:hasLegacyThreads AND message."messageThreadId" IN (:...legacyThreadIds)))',
                {
                  hasEvidenceIds: messageIds.length > 0,
                  evidenceMessageIds: messageIds.length
                    ? messageIds
                    : [targetInput.threadId],
                  hasLegacyThreads: legacyThreadIds.length > 0,
                  legacyThreadIds: legacyThreadIds.length
                    ? legacyThreadIds
                    : [targetInput.threadId],
                },
              )
              .andWhere(
                'message."deletedAt" IS NULL AND message."isDraft" = false AND message."receivedAt" IS NOT NULL',
              )
              .andWhere(`${visibility.expression} = :messageVisibilityFull`)
              .andWhere(`EXISTS (SELECT 1 FROM "${schema}"."messageChannelMessageAssociation" association
                JOIN core."messageChannel" channel ON channel.id = association."messageChannelId"
                LEFT JOIN core."connectedAccount" account ON account.id = channel."connectedAccountId"
                WHERE association."messageId" = message.id AND association."deletedAt" IS NULL
                  AND association.direction = 'OUTGOING' AND channel."workspaceId" = :evidenceWorkspaceId
                  AND channel.type IN ('EMAIL', 'EMAIL_GROUP')
                  AND (channel.visibility = 'SHARE_EVERYTHING' OR account."userWorkspaceId" = :messageVisibilityUserWorkspaceId))`)
              .setParameters({
                ...visibility.parameters,
                evidenceWorkspaceId: input.workspace.id,
              })
              .orderBy('message.id', 'ASC')
              .getRawMany<{ id: string }>();
            evidenceIds.push(...delivered.map((message) => message.id));
          }
          const eligibilityEvidenceDigest = computeActionContentDigest(
            JSON.stringify([...new Set(evidenceIds)].sort()),
          );
          const contextFingerprint = computeActionContentDigest(
            JSON.stringify([
              target.channel,
              target.deliveryTargetId,
              target.contactAnchor.kind,
              target.contactAnchor.id,
              creator.id,
              creator.name,
              creator.language,
              creator.location,
              creator.categories,
              creator.niches,
              input.replyContext.kind,
              selectedCampaign?.id ?? null,
              eligibilityEvidenceDigest,
              selectedCampaign
                ? [
                    selectedCampaign.name,
                    selectedCampaign.objective,
                    selectedCampaign.icpGoal,
                    selectedCampaign.campaignBrief?.markdown ?? null,
                    selectedCampaign.communicationGuidelines?.markdown ?? null,
                    selectedCampaign.replyRules?.markdown ?? null,
                    selectedCampaign.escalationBoundaries?.markdown ?? null,
                    selectedCampaign.additionalNotes?.markdown ?? null,
                    selectedCampaign.emailSignature?.markdown ?? null,
                  ]
                : null,
              terms.map((term) => [
                term.id,
                term.stage,
                term.selectedContactMethod,
                term.nextActionAt,
                term.selectionReason,
                term.dealSummary,
              ]),
            ]),
          );

          return {
            readable: true,
            eligible:
              input.replyContext.kind === 'GENERAL' || evidenceIds.length > 0,
            target,
            contextFingerprint,
            eligibilityEvidenceDigest,
            campaignName: selectedCampaign?.name ?? null,
            threadCampaign,
          };
        },
        input.authContext,
      );
    } catch (error) {
      // Permission-scoped repositories intentionally collapse unavailable context.
      if (
        error instanceof ForbiddenException ||
        (error instanceof PermissionsException &&
          error.code === PermissionsExceptionCode.PERMISSION_DENIED)
      ) {
        return this.unavailable(input);
      }
      throw error;
    }
  }

  private unavailable(input: ReplyContextRequest): CurrentReplyContextEvidence {
    return {
      readable: false,
      eligible: false,
      target: {
        channel: input.target.channel,
        deliveryTargetId:
          input.target.channel === 'EMAIL'
            ? input.target.threadId
            : input.target.conversationId,
        contactAnchor: { kind: 'UNAVAILABLE', id: '' },
        creatorId: null,
      },
      contextFingerprint: null,
      threadCampaign: null,
    };
  }
}

export type MyahInboxReplyContextDraftSnapshot = {
  draftId: string | null;
  revision: number;
  body: { markdown: string; blocknote: string | null } | null;
  // Task 2's authorized reader composes exact target-wide delivery state.
  targetState: 'PENDING' | 'UNKNOWN' | null;
  contextAcknowledged?: boolean;
};

// Task 2 replaces this reader without changing authorization or GraphQL composition.
export type MyahInboxReplyContextDraftReader = {
  read(input: {
    request: ReplyContextRequest;
    resolvedContext: ResolvedReplyContext;
  }): Promise<MyahInboxReplyContextDraftSnapshot | null>;
};

export const MYAH_INBOX_REPLY_CONTEXT_DRAFT_READER = Symbol(
  'MYAH_INBOX_REPLY_CONTEXT_DRAFT_READER',
);

export const toDraftExecutionState = (input: {
  targetState: 'PENDING' | 'UNKNOWN' | null;
  actionEligible: boolean;
  requiredContextReadable: boolean;
  hasReadableBody: boolean;
}): MyahInboxReplyDraftExecutionState => {
  if (!input.requiredContextReadable) {
    return MyahInboxReplyDraftExecutionState.CONTEXT_UNAVAILABLE;
  }
  if (input.targetState === 'UNKNOWN') {
    return MyahInboxReplyDraftExecutionState.OUTCOME_UNKNOWN;
  }
  if (input.targetState === 'PENDING') {
    return MyahInboxReplyDraftExecutionState.OUTCOME_PENDING;
  }
  if (input.actionEligible) {
    return MyahInboxReplyDraftExecutionState.READY;
  }
  return input.hasReadableBody
    ? MyahInboxReplyDraftExecutionState.NEEDS_REVIEW
    : MyahInboxReplyDraftExecutionState.CONTEXT_UNAVAILABLE;
};

@Injectable()
export class MyahInboxReplyContextService {
  constructor(
    @Inject(MYAH_INBOX_REPLY_CONTEXT_EVIDENCE_RESOLVER)
    private readonly evidenceResolver: MyahInboxReplyContextEvidenceResolver,
    // Direct unit construction omits this dependency; the application module always provides it.
    @Optional()
    private readonly activationGate?: EmailReplyContextActivationService,
  ) {}

  async resolveForRead(
    input: ReplyContextRequest,
  ): Promise<ResolvedReplyContext> {
    if (input.target.channel === 'EMAIL' && this.activationGate) {
      await this.activationGate.assertEmailContextActivationEnabled(
        input.workspace.id,
      );
    }
    if (!isReplyTargetIdentityCompatible(input)) {
      return this.unavailable(input);
    }

    const evidence = await this.evidenceResolver.resolveCurrentEvidence(input);

    return {
      target: evidence.target,
      selected: input.replyContext,
      state: evidence.readable
        ? evidence.eligible
          ? 'READY'
          : 'NEEDS_REVIEW'
        : 'CONTEXT_UNAVAILABLE',
      contextFingerprint: evidence.readable
        ? evidence.contextFingerprint
        : null,
      eligibilityEvidenceDigest: evidence.readable
        ? evidence.eligibilityEvidenceDigest
        : undefined,
      campaignName: evidence.readable ? evidence.campaignName : null,
      threadCampaign: evidence.readable ? evidence.threadCampaign : null,
    };
  }

  private unavailable(input: ReplyContextRequest): ResolvedReplyContext {
    return {
      target: {
        channel: input.target.channel,
        deliveryTargetId:
          input.target.channel === 'EMAIL'
            ? input.target.threadId
            : input.target.conversationId,
        contactAnchor: { kind: 'UNAVAILABLE', id: '' },
        creatorId: null,
      },
      selected: input.replyContext,
      state: 'CONTEXT_UNAVAILABLE',
      contextFingerprint: null,
      threadCampaign: null,
    };
  }

  async resolveForAction(
    input: ReplyContextRequest,
  ): Promise<ResolvedReplyContext> {
    const resolved = await this.resolveForRead(input);

    if (resolved.state === 'CONTEXT_UNAVAILABLE') {
      throw new ForbiddenException('Reply context is not readable');
    }
    if (resolved.state === 'NEEDS_REVIEW') {
      throw new ForbiddenException('Reply context is no longer eligible');
    }

    return resolved;
  }
}

export const toResolvedReplyContextDto = (
  resolved: ResolvedReplyContext,
): MyahInboxResolvedReplyContext => ({
  target: {
    channel: resolved.target.channel,
    deliveryTargetId: resolved.target.deliveryTargetId,
    contactAnchorKind: resolved.target.contactAnchor.kind,
    contactAnchorId: resolved.target.contactAnchor.id,
    creatorId: resolved.target.creatorId,
  } satisfies MyahInboxResolvedReplyTarget,
  kind: resolved.selected.kind,
  campaignId:
    resolved.selected.kind === 'CAMPAIGN' ? resolved.selected.campaignId : null,
  contextFingerprint: resolved.contextFingerprint,
});
