import { type MyahReplyContextSnapshot } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { MyahInboxReplyContextService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { MyahInboxReplyContextDraftService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import { MyahInboxReplyContextOptionsService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-options.service';
import {
  ReplyChannel,
  ReplyContextKind,
  validateReplyTargetInput,
  validateReplyContextInput,
  type MyahInboxReplyDraftInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import {
  decodeMyahInboxContactId,
  encodeMyahInboxContactId,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { assertMyahInboxExpectedWorkspace } from 'src/engine/core-modules/myah-inbox/utils/assert-myah-inbox-expected-workspace.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { InjectDataSource } from '@nestjs/typeorm';
import { IsNull, Not, type DataSource, type ObjectLiteral } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import {
  getMyahInboxReplyAdvisoryLockKey,
  MYAH_INBOX_REPLY_ADVISORY_LOCK_QUERY,
} from 'src/engine/core-modules/action-approval/utils/myah-inbox-reply-advisory-lock.util';
import { validateRichTextFieldOrThrow } from 'src/engine/api/common/common-args-processors/data-arg-processor/validator-utils/validate-rich-text-field-or-throw.util';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH,
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import {
  MyahInboxDraftSaveStatus,
  type MyahInboxDraftSaveResult,
  type MyahRichText,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import {
  type SaveMyahInboxDraftInput,
  type ReviewMyahInboxReplyContextInput,
} from 'src/engine/core-modules/myah-inbox/dtos/save-myah-inbox-draft.input';
import { type MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import { type UpdateMyahInboxThreadInput } from 'src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-thread.input';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

export type MyahInboxMutationRequest = {
  authContext: WorkspaceAuthContext;
  user: AuthContextUser | undefined;
  workspace: { id: string };
  workspaceMemberId: string;
};

export type UpdateMyahInboxThreadMutationInput = UpdateMyahInboxThreadInput &
  MyahInboxMutationRequest;
export type SaveMyahInboxDraftMutationInput = {
  threadId: string;
  expectedRevision: number;
  body: MyahRichText | null;
  expectedWorkspaceId?: string | null;
} & MyahInboxMutationRequest;
type ContextDraftMutationInput = SaveMyahInboxDraftInput &
  MyahInboxMutationRequest & {
    expectedContextFingerprint?: string | null;
  };

type InboxThreadRecord = ObjectLiteral & {
  id: string;
  creatorId: string | null;
  myahCampaignId: string | null;
  myahReplyDraftBodyMarkdown: string | null;
  myahReplyDraftBodyBlocknote: string | null;
  myahReplyDraftRevision: number;
};

type ContextRecord = ObjectLiteral & { id: string };
type MessageRecord = ObjectLiteral & { id: string };

type MutationRepositories = {
  messageThread: WorkspaceRepository<InboxThreadRecord>;
  message: WorkspaceRepository<MessageRecord>;
  creator: WorkspaceRepository<ContextRecord>;
  campaign: WorkspaceRepository<ContextRecord>;
  workspaceMember: WorkspaceRepository<ContextRecord>;
};

const MYAH_INBOX_TRIAGE_UPDATE_MAX_ATTEMPTS = 3;

@Injectable()
export class MyahInboxMutationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly myahInboxContactTriageLifecycleService: MyahInboxContactTriageLifecycleService,
    private readonly actionApprovalService: ActionApprovalService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly replyContexts: MyahInboxReplyContextService,
    private readonly contextDrafts: MyahInboxReplyContextDraftService,
    private readonly replyContextOptions: MyahInboxReplyContextOptionsService,
  ) {}

  async updateMyahInboxThread(
    input: UpdateMyahInboxThreadMutationInput,
  ): Promise<MyahInboxThreadSummary> {
    this.assertUserRequest(input);
    this.assertValidThreadUpdateInput(input);
    await this.assertPolicyVisibleThread(input);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const { rolePermissionConfig, repositories } =
        await this.loadRepositories(input);

      await repositories.messageThread.manager.transaction(async (manager) => {
        const mutate = async () => {
          const transactionalRepositories = this.getTransactionalRepositories(
            manager as WorkspaceEntityManager,
            repositories,
            rolePermissionConfig,
            input.authContext,
          );

          await this.assertReadableCurrentMember(
            transactionalRepositories.workspaceMember,
            input.workspaceMemberId,
          );
          let thread = await this.loadReadableThread(
            transactionalRepositories.messageThread,
            input.threadId,
          );

          await this.assertReplyEligible(
            transactionalRepositories.message,
            input.threadId,
          );
          await this.assertReadableRelationTargets(
            transactionalRepositories,
            input,
          );

          for (
            let attempt = 0;
            attempt < MYAH_INBOX_TRIAGE_UPDATE_MAX_ATTEMPTS;
            attempt++
          ) {
            const patch = this.buildThreadUpdatePatch(input);
            await this.assertPolicyVisibleThread(input);
            const result = await transactionalRepositories.messageThread.update(
              { id: input.threadId, creatorId: thread.creatorId ?? IsNull() },
              patch,
              { returning: ['id'] },
            );

            if (result.affected || result.raw.length > 0) return;

            thread = await this.loadReadableThread(
              transactionalRepositories.messageThread,
              input.threadId,
            );
          }

          throw new ConflictException(
            'Inbox thread changed while applying triage update',
          );
        };

        if (input.creatorId === undefined) {
          await mutate();
          return;
        }

        await this.myahInboxContactTriageLifecycleService.withPreparedSourceMutationInTransaction(
          {
            workspaceId: input.workspace.id,
            sourceType: 'EMAIL_THREAD',
            sourceRecordIds: [input.threadId],
            nextCreatorIds: input.creatorId ? [input.creatorId] : [],
            manager: manager as WorkspaceEntityManager,
            mutate,
          },
        );
      });
    }, input.authContext);

    return this.myahInboxQueryService.getThreadSummary({
      authContext: input.authContext,
      user: input.user,
      workspace: input.workspace,
      workspaceMemberId: input.workspaceMemberId,
      threadId: input.threadId,
    });
  }

  async saveMyahInboxDraft(
    input: ContextDraftMutationInput | SaveMyahInboxDraftMutationInput,
  ): Promise<MyahInboxDraftSaveResult> {
    if (!('target' in input)) {
      // Release A compatibility guard: only the immutable receipt-recovery
      // method below may retain a v1 draft after a terminal provider failure.
      throw new ConflictException(
        'Email reply drafts require a refreshed contextual reply flow',
      );
    }
    this.assertUserRequest(input);
    if (
      input.expectedContextFingerprint != null &&
      input.proposalContextFingerprint != null
    ) {
      throw new BadRequestException(
        'Expected context fingerprint cannot accompany proposal fingerprint',
      );
    }
    const expectedContextFingerprint =
      input.expectedContextFingerprint ?? input.proposalContextFingerprint;
    if (
      expectedContextFingerprint != null &&
      !/^[a-f0-9]{64}$/.test(expectedContextFingerprint)
    ) {
      throw new BadRequestException('Invalid expected context fingerprint');
    }
    await this.assertGeneralAvailable(input);
    const { resolved, identity } = await this.resolveContextMutation(input);
    return this.actionApprovalService.executeInboxReplyTargetLocked(
      {
        workspaceId: input.workspace.id,
        deliveryTargetId: identity.deliveryTargetId,
        draftId: identity.deliveryTargetId,
      },
      async () => {
        await this.assertContextTargetUnlocked(
          input.workspace.id,
          identity.deliveryTargetId,
        );
        // Re-authorize after acquiring the target lock; the caller fingerprint is not authority.
        await this.assertGeneralAvailable(input);
        const fresh = await this.resolveContextMutation(input);
        if (
          expectedContextFingerprint != null &&
          (expectedContextFingerprint !== resolved.contextFingerprint ||
            expectedContextFingerprint !== fresh.resolved.contextFingerprint)
        ) {
          throw new ConflictException(
            'Reply context changed before applying the proposal',
          );
        }
        return this.contextDrafts.save({
          ...fresh.identity,
          expectedRevision: input.expectedRevision,
          body: input.body,
          proposalContextFingerprint: input.proposalContextFingerprint,
          // Validated by the fingerprint above; never a later reread.
          incomingBaseline: fresh.resolved.incomingBaseline ?? null,
          acknowledgeProposal: input.requireReview !== true,
          clearContextAcknowledgement:
            input.expectedContextFingerprint != null &&
            input.proposalContextFingerprint == null,
        });
      },
    );
  }

  async reviewMyahInboxReplyContext(
    input: ReviewMyahInboxReplyContextInput & MyahInboxMutationRequest,
  ) {
    this.assertUserRequest(input);
    const { identity } = await this.resolveContextMutation(input);
    return this.actionApprovalService.executeInboxReplyTargetLocked(
      {
        workspaceId: input.workspace.id,
        deliveryTargetId: identity.deliveryTargetId,
        draftId: identity.deliveryTargetId,
      },
      async () => {
        await this.assertContextTargetUnlocked(
          input.workspace.id,
          identity.deliveryTargetId,
        );
        const fresh = await this.resolveContextMutation(input);
        const draft = await this.contextDrafts.read(fresh.identity);
        if (
          draft.revision !== input.expectedDraftRevision ||
          !draft.body ||
          !fresh.resolved.contextFingerprint ||
          fresh.resolved.contextFingerprint !== input.expectedContextFingerprint
        ) {
          throw new ConflictException(
            'Reply context or draft changed before review',
          );
        }
        return this.contextDrafts.review({
          ...fresh.identity,
          reviewedContextFingerprint: fresh.resolved.contextFingerprint,
        });
      },
    );
  }

  private async assertGeneralAvailable(
    input: MyahInboxReplyDraftInput & MyahInboxMutationRequest,
  ) {
    const target = validateReplyTargetInput(input.target);
    const replyContext = validateReplyContextInput(input.replyContext);
    if (
      target.channel !== ReplyChannel.EMAIL ||
      replyContext.kind !== ReplyContextKind.GENERAL ||
      decodeMyahInboxContactId(target.contactId, input.workspace.id).kind !==
        'creator'
    ) {
      return;
    }
    const options = await this.replyContextOptions.listOptions({
      ...input,
      user: input.user!,
      expectedWorkspaceId: input.expectedWorkspaceId,
      target,
      first: 1,
    });
    if (!options.generalAvailable) {
      throw new ForbiddenException('General reply context is not available');
    }
  }

  private async resolveContextMutation(
    input: MyahInboxReplyDraftInput & MyahInboxMutationRequest,
  ) {
    this.assertUserRequest(input);
    assertMyahInboxExpectedWorkspace(
      input.workspace.id,
      input.expectedWorkspaceId,
    );
    const target = validateReplyTargetInput(input.target);
    const replyContext = validateReplyContextInput(input.replyContext);
    if (target.channel !== 'EMAIL')
      throw new BadRequestException(
        'Contextual Instagram writes are not enabled',
      );
    const resolved = await this.replyContexts.resolveForAction({
      ...input,
      target,
      replyContext,
      contactIdentity: decodeMyahInboxContactId(
        target.contactId,
        input.workspace.id,
      ),
    });
    return {
      resolved,
      identity: {
        workspaceId: input.workspace.id,
        contactAnchorKind: resolved.target.contactAnchor.kind,
        contactAnchorId: resolved.target.contactAnchor.id,
        channel: resolved.target.channel,
        deliveryTargetId: resolved.target.deliveryTargetId,
        context: resolved.selected,
      },
    };
  }

  private async assertContextTargetUnlocked(
    workspaceId: string,
    deliveryTargetId: string,
  ) {
    if (
      await this.actionApprovalService.getInboxReplyTargetExecutionState({
        workspaceId,
        deliveryTargetId,
      })
    ) {
      throw new ConflictException(
        'Inbox reply target is locked while delivery is being confirmed',
      );
    }
  }

  async saveMyahInboxContextDraftAfterProviderFailure(
    input: MyahInboxMutationRequest & {
      snapshot: MyahReplyContextSnapshot;
      expectedRevision: number;
      body: MyahRichText;
    },
  ): Promise<MyahInboxDraftSaveResult> {
    this.assertUserRequest(input);
    const snapshot = input.snapshot;
    if (snapshot.channel !== 'EMAIL')
      throw new BadRequestException('Invalid Email snapshot');
    const contactIdentity = {
      kind:
        snapshot.contactAnchor.kind === 'CREATOR'
          ? ('creator' as const)
          : ('email-thread' as const),
      recordId: snapshot.contactAnchor.id,
    };
    const assertReadable = async () => {
      const resolved = await this.replyContexts.resolveForRead({
        ...input,
        user: input.user!,
        target: {
          channel: ReplyChannel.EMAIL,
          threadId: snapshot.deliveryTargetId,
          contactId: encodeMyahInboxContactId({
            workspaceId: input.workspace.id,
            identity: contactIdentity,
          }),
        },
        replyContext:
          snapshot.replyContext.kind === 'CAMPAIGN'
            ? {
                kind: ReplyContextKind.CAMPAIGN,
                campaignId: snapshot.replyContext.campaignId,
              }
            : { kind: ReplyContextKind.GENERAL },
        contactIdentity,
      });
      if (
        resolved.state === 'CONTEXT_UNAVAILABLE' ||
        resolved.target.contactAnchor.kind !== snapshot.contactAnchor.kind ||
        resolved.target.contactAnchor.id !== snapshot.contactAnchor.id
      )
        throw new ForbiddenException('Reply context is not readable');
    };
    await assertReadable();
    return this.actionApprovalService.executeInboxReplyTargetLocked(
      {
        workspaceId: input.workspace.id,
        deliveryTargetId: snapshot.deliveryTargetId,
        draftId: snapshot.draftId,
      },
      async () => {
        const identity = {
          workspaceId: input.workspace.id,
          channel: ReplyChannel.EMAIL,
          deliveryTargetId: snapshot.deliveryTargetId,
          contactAnchorKind: snapshot.contactAnchor.kind,
          contactAnchorId: snapshot.contactAnchor.id,
          context:
            snapshot.replyContext.kind === 'CAMPAIGN'
              ? {
                  kind: ReplyContextKind.CAMPAIGN as const,
                  campaignId: snapshot.replyContext.campaignId,
                }
              : { kind: ReplyContextKind.GENERAL as const },
        };
        const current = await this.contextDrafts.read(identity);
        if (current.draftId !== snapshot.draftId)
          throw new ConflictException('Reply draft identity changed');
        await assertReadable();
        return this.contextDrafts.save({
          ...identity,
          body: input.body,
          expectedRevision: input.expectedRevision,
        });
      },
    );
  }

  async saveMyahInboxDraftAfterProviderFailure(
    input: SaveMyahInboxDraftMutationInput,
  ): Promise<MyahInboxDraftSaveResult> {
    return this.saveMyahInboxDraftInternal(input, false);
  }

  private async saveMyahInboxDraftInternal(
    input: SaveMyahInboxDraftMutationInput,
    enforceExecutionLock: boolean,
  ): Promise<MyahInboxDraftSaveResult> {
    this.assertUserRequest(input);
    this.assertValidDraftInput(input);
    await this.assertPolicyVisibleThread(input);

    return this.dataSource.transaction(async (coreManager) => {
      await coreManager.query(MYAH_INBOX_REPLY_ADVISORY_LOCK_QUERY, [
        `myah-inbox-reply-target:${input.workspace.id}:EMAIL:${input.threadId}`,
      ]);
      await coreManager.query(MYAH_INBOX_REPLY_ADVISORY_LOCK_QUERY, [
        getMyahInboxReplyAdvisoryLockKey(input.workspace.id, input.threadId),
      ]);

      return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const { rolePermissionConfig, repositories } =
            await this.loadRepositories(input);

          return repositories.messageThread.manager.transaction(
            async (manager) => {
              const transactionalRepositories =
                this.getTransactionalRepositories(
                  manager as WorkspaceEntityManager,
                  repositories,
                  rolePermissionConfig,
                  input.authContext,
                );
              const draftRepository = (
                manager as WorkspaceEntityManager
              ).getRepository<InboxThreadRecord>(
                repositories.messageThread.target,
                { shouldBypassPermissionChecks: true },
                input.authContext,
              );

              await this.assertReadableCurrentMember(
                transactionalRepositories.workspaceMember,
                input.workspaceMemberId,
              );

              await this.assertReplyEligible(
                transactionalRepositories.message,
                input.threadId,
              );
              await this.assertPolicyVisibleThread(input);

              if (
                enforceExecutionLock &&
                (await this.actionApprovalService.isDraftExecutionLocked({
                  workspaceId: input.workspace.id,
                  actionName: 'send_inbox_reply',
                  draftId: input.threadId,
                }))
              ) {
                throw new ConflictException(
                  'Inbox reply draft is locked while delivery is being confirmed',
                );
              }

              // SAFETY: TypeORM's expression-valued partial cannot represent this typed increment.
              const draftPatch = {
                myahReplyDraftBody: input.body,
                myahReplyDraftRevision: () => '"myahReplyDraftRevision" + 1',
              } as unknown as QueryDeepPartialEntity<InboxThreadRecord>;

              const result = await draftRepository.update(
                {
                  id: input.threadId,
                  myahReplyDraftRevision: input.expectedRevision,
                },
                draftPatch,
                {
                  returning: ['myahReplyDraftBody', 'myahReplyDraftRevision'],
                },
              );
              const saved = (result.raw[0] ?? result.generatedMaps[0]) as
                | InboxThreadRecord
                | undefined;

              if (saved) {
                return {
                  status: MyahInboxDraftSaveStatus.SAVED,
                  revision: saved.myahReplyDraftRevision,
                  body: input.body,
                };
              }

              const current = await this.loadReadableThread(
                transactionalRepositories.messageThread,
                input.threadId,
              );

              if (current.myahReplyDraftRevision === input.expectedRevision) {
                throw new ForbiddenException('Inbox draft is not writable');
              }

              return {
                status: MyahInboxDraftSaveStatus.CONFLICT,
                revision: current.myahReplyDraftRevision,
                body: this.toDraftBody(current),
              };
            },
          );
        },
        input.authContext,
      );
    });
  }

  private assertUserRequest(
    input: MyahInboxMutationRequest,
  ): asserts input is MyahInboxMutationRequest & {
    authContext: Extract<WorkspaceAuthContext, { type: 'user' }>;
    user: AuthContextUser;
  } {
    if (
      !isUserAuthContext(input.authContext) ||
      !isDefined(input.authContext.user) ||
      !isDefined(input.user) ||
      input.authContext.user.id !== input.user.id ||
      input.authContext.workspace.id !== input.workspace.id ||
      input.authContext.workspaceMemberId !== input.workspaceMemberId
    ) {
      throw new ForbiddenException(
        'The Myah Inbox requires matching authenticated user context',
      );
    }
  }

  private async assertPolicyVisibleThread(
    input: MyahInboxMutationRequest & {
      threadId: string;
      user: AuthContextUser;
    },
  ): Promise<void> {
    await this.myahInboxQueryService.getThreadSummary({
      authContext: input.authContext,
      user: input.user,
      workspace: input.workspace,
      workspaceMemberId: input.workspaceMemberId,
      threadId: input.threadId,
    });
  }

  private assertValidThreadUpdateInput(
    input: UpdateMyahInboxThreadInput,
  ): void {
    const mutableFields: Array<keyof UpdateMyahInboxThreadInput> = [
      'creatorId',
      'campaignId',
    ];
    const relationIds = [input.creatorId, input.campaignId].filter(isDefined);

    if (
      !isValidUuid(input.threadId) ||
      relationIds.some((id) => !isValidUuid(id)) ||
      !mutableFields.some((field) => input[field] !== undefined)
    ) {
      throw new BadRequestException('Invalid Myah inbox thread update input');
    }
  }

  private assertValidDraftInput(input: SaveMyahInboxDraftMutationInput): void {
    if (
      !isValidUuid(input.threadId) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      throw new BadRequestException('Invalid Myah inbox draft input');
    }

    if (input.body === null) {
      return;
    }

    if (
      typeof input.body !== 'object' ||
      typeof input.body.markdown !== 'string' ||
      input.body.markdown.length > MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH ||
      (input.body.blocknote !== null &&
        (typeof input.body.blocknote !== 'string' ||
          input.body.blocknote.length > MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH))
    ) {
      throw new BadRequestException('Invalid Myah inbox draft body');
    }

    try {
      validateRichTextFieldOrThrow(input.body, 'myahReplyDraftBody');
    } catch {
      throw new BadRequestException('Invalid Myah inbox draft body');
    }
  }

  private async loadRepositories(input: MyahInboxMutationRequest) {
    const workspaceContext = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext: input.authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
    });

    if (!rolePermissionConfig) {
      throw new ForbiddenException('Inbox role permissions are required');
    }

    const [messageThread, message, creator, campaign, workspaceMember] =
      await Promise.all([
        this.globalWorkspaceOrmManager.getRepository<InboxThreadRecord>(
          input.workspace.id,
          'messageThread',
          rolePermissionConfig,
        ),
        this.globalWorkspaceOrmManager.getRepository<MessageRecord>(
          input.workspace.id,
          'message',
          rolePermissionConfig,
        ),
        this.globalWorkspaceOrmManager.getRepository<ContextRecord>(
          input.workspace.id,
          'creator',
          rolePermissionConfig,
        ),
        this.globalWorkspaceOrmManager.getRepository<ContextRecord>(
          input.workspace.id,
          'campaign',
          rolePermissionConfig,
        ),
        this.globalWorkspaceOrmManager.getRepository<ContextRecord>(
          input.workspace.id,
          'workspaceMember',
          rolePermissionConfig,
        ),
      ]);

    return {
      rolePermissionConfig,
      repositories: {
        messageThread,
        message,
        creator,
        campaign,
        workspaceMember,
      },
    };
  }

  private getTransactionalRepositories(
    manager: WorkspaceEntityManager,
    repositories: MutationRepositories,
    rolePermissionConfig: RolePermissionConfig,
    authContext: WorkspaceAuthContext,
  ) {
    return {
      messageThread: manager.getRepository<InboxThreadRecord>(
        repositories.messageThread.target,
        rolePermissionConfig,
        authContext,
      ),
      message: manager.getRepository<MessageRecord>(
        repositories.message.target,
        rolePermissionConfig,
        authContext,
      ),
      creator: manager.getRepository<ContextRecord>(
        repositories.creator.target,
        rolePermissionConfig,
        authContext,
      ),
      campaign: manager.getRepository<ContextRecord>(
        repositories.campaign.target,
        rolePermissionConfig,
        authContext,
      ),
      workspaceMember: manager.getRepository<ContextRecord>(
        repositories.workspaceMember.target,
        rolePermissionConfig,
        authContext,
      ),
    };
  }

  private async assertReadableCurrentMember(
    workspaceMemberRepository: MutationRepositories['workspaceMember'],
    workspaceMemberId: string,
  ): Promise<void> {
    const workspaceMember = await workspaceMemberRepository.findOne({
      where: { id: workspaceMemberId, deletedAt: IsNull() },
      select: { id: true },
    });

    if (!workspaceMember) {
      throw new ForbiddenException('Inbox workspace member is not readable');
    }
  }

  private async loadReadableThread(
    messageThreadRepository: MutationRepositories['messageThread'],
    threadId: string,
  ): Promise<InboxThreadRecord> {
    const thread = (await messageThreadRepository.findOne({
      where: { id: threadId, deletedAt: IsNull() },
      select: {
        id: true,
        creatorId: true,
        myahCampaignId: true,
        myahReplyDraftBodyMarkdown: true,
        myahReplyDraftBodyBlocknote: true,
        myahReplyDraftRevision: true,
      },
      lock: { mode: 'pessimistic_write' },
    })) as InboxThreadRecord | null;

    if (!thread) {
      throw new ForbiddenException('Inbox thread is not readable');
    }

    return thread;
  }

  private toDraftBody(thread: InboxThreadRecord): MyahRichText | null {
    const compositeBody = (
      thread as InboxThreadRecord & {
        myahReplyDraftBody?: MyahRichText | null;
      }
    ).myahReplyDraftBody;

    if (compositeBody !== undefined) {
      return compositeBody;
    }

    return thread.myahReplyDraftBodyMarkdown === null
      ? null
      : {
          markdown: thread.myahReplyDraftBodyMarkdown,
          blocknote: thread.myahReplyDraftBodyBlocknote,
        };
  }

  private async assertReplyEligible(
    messageRepository: MutationRepositories['message'],
    threadId: string,
  ): Promise<void> {
    const message = await messageRepository.findOne({
      where: {
        messageThreadId: threadId,
        deletedAt: IsNull(),
        receivedAt: Not(IsNull()),
      },
      select: { id: true },
    });

    if (!message) {
      throw new ForbiddenException('Inbox thread is not reply eligible');
    }
  }

  private async assertReadableRelationTargets(
    repositories: Pick<MutationRepositories, 'creator' | 'campaign'>,
    input: UpdateMyahInboxThreadInput,
  ): Promise<void> {
    const targets = [
      {
        id: input.creatorId,
        repository: repositories.creator,
        message: 'Inbox Creator is not readable',
      },
      {
        id: input.campaignId,
        repository: repositories.campaign,
        message: 'Inbox Campaign is not readable',
      },
    ];

    for (const target of targets) {
      if (!isDefined(target.id)) {
        continue;
      }

      const record = await target.repository.findOne({
        where: { id: target.id, deletedAt: IsNull() },
        select: { id: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        throw new ForbiddenException(target.message);
      }
    }
  }

  private buildThreadUpdatePatch(
    input: UpdateMyahInboxThreadInput,
  ): Partial<InboxThreadRecord> {
    const patch: Partial<InboxThreadRecord> = {};

    if (input.creatorId !== undefined) {
      patch.creatorId = input.creatorId ?? null;
    }

    if (input.campaignId !== undefined) {
      patch.myahCampaignId = input.campaignId ?? null;
    }

    return patch;
  }
}
