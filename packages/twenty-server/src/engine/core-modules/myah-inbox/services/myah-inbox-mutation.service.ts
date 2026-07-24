import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { isISO8601 } from 'class-validator';
import { IsNull, Not, type ObjectLiteral } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

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
import { MyahInboxState } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { type SaveMyahInboxDraftInput } from 'src/engine/core-modules/myah-inbox/dtos/save-myah-inbox-draft.input';
import { type MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import { type UpdateMyahInboxThreadInput } from 'src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-thread.input';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

export type MyahInboxMutationRequest = {
  authContext: WorkspaceAuthContext;
  user: AuthContextUser | undefined;
  workspace: WorkspaceEntity;
  workspaceMemberId: string;
};

export type UpdateMyahInboxThreadMutationInput = UpdateMyahInboxThreadInput &
  MyahInboxMutationRequest;
export type SaveMyahInboxDraftMutationInput = SaveMyahInboxDraftInput &
  MyahInboxMutationRequest;

type InboxThreadRecord = ObjectLiteral & {
  id: string;
  creatorId: string | null;
  myahCampaignId: string | null;
  inboxOwnerId: string | null;
  inboxState: MyahInboxState;
  snoozedUntil: Date | string | null;
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
  ) {}

  async updateMyahInboxThread(
    input: UpdateMyahInboxThreadMutationInput,
  ): Promise<MyahInboxThreadSummary> {
    this.assertUserRequest(input);
    this.assertValidTriageInput(input);
    await this.assertPolicyVisibleThread(input);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const { rolePermissionConfig, repositories } =
        await this.loadRepositories(input);

      await repositories.messageThread.manager.transaction(async (manager) => {
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
          const patch = this.buildTriagePatch(input, thread);
          const result = await transactionalRepositories.messageThread.update(
            { id: input.threadId, inboxState: thread.inboxState },
            patch,
            { returning: ['id'] },
          );

          if (result.affected || result.raw.length > 0) {
            return;
          }

          thread = await this.loadReadableThread(
            transactionalRepositories.messageThread,
            input.threadId,
          );
        }

        throw new ConflictException(
          'Inbox thread changed while applying triage update',
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
    input: SaveMyahInboxDraftMutationInput,
  ): Promise<MyahInboxDraftSaveResult> {
    this.assertUserRequest(input);
    this.assertValidDraftInput(input);
    await this.assertPolicyVisibleThread(input);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const { rolePermissionConfig, repositories } =
          await this.loadRepositories(input);

        return repositories.messageThread.manager.transaction(
          async (manager) => {
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
            const thread = await this.loadReadableThread(
              transactionalRepositories.messageThread,
              input.threadId,
            );

            await this.assertReplyEligible(
              transactionalRepositories.message,
              input.threadId,
            );
            this.assertDraftOwner(thread, input.workspaceMemberId);

            const draftPatch = {
              myahReplyDraftBody: input.body,
              myahReplyDraftRevision: () => '"myahReplyDraftRevision" + 1',
            } as unknown as QueryDeepPartialEntity<InboxThreadRecord>;

            const result = await transactionalRepositories.messageThread.update(
              {
                id: input.threadId,
                inboxOwnerId: input.workspaceMemberId,
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

            this.assertDraftOwner(current, input.workspaceMemberId);

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

  private assertValidTriageInput(input: UpdateMyahInboxThreadInput): void {
    const mutableFields: Array<keyof UpdateMyahInboxThreadInput> = [
      'creatorId',
      'campaignId',
      'inboxOwnerId',
      'inboxState',
      'snoozedUntil',
    ];
    const relationIds = [
      input.creatorId,
      input.campaignId,
      input.inboxOwnerId,
    ].filter(isDefined);

    if (
      !isValidUuid(input.threadId) ||
      relationIds.some((id) => !isValidUuid(id)) ||
      !mutableFields.some((field) => input[field] !== undefined) ||
      (isDefined(input.inboxState) &&
        !Object.values(MyahInboxState).includes(input.inboxState)) ||
      (input.snoozedUntil !== undefined &&
        !isDefined(input.snoozedUntil) &&
        (!isDefined(input.inboxState) ||
          input.inboxState === MyahInboxState.SNOOZED)) ||
      (isDefined(input.snoozedUntil) &&
        !isISO8601(input.snoozedUntil, { strict: true }))
    ) {
      throw new BadRequestException('Invalid Myah inbox triage input');
    }
  }

  private assertValidDraftInput(input: SaveMyahInboxDraftInput): void {
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
        inboxOwnerId: true,
        inboxState: true,
        snoozedUntil: true,
        myahReplyDraftBodyMarkdown: true,
        myahReplyDraftBodyBlocknote: true,
        myahReplyDraftRevision: true,
      },
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
    repositories: Pick<
      MutationRepositories,
      'creator' | 'campaign' | 'workspaceMember'
    >,
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
      {
        id: input.inboxOwnerId,
        repository: repositories.workspaceMember,
        message: 'Inbox owner is not readable',
      },
    ];

    for (const target of targets) {
      if (!isDefined(target.id)) {
        continue;
      }

      const record = await target.repository.findOne({
        where: { id: target.id, deletedAt: IsNull() },
        select: { id: true },
      });

      if (!record) {
        throw new ForbiddenException(target.message);
      }
    }
  }

  private buildTriagePatch(
    input: UpdateMyahInboxThreadInput,
    thread: InboxThreadRecord,
  ): Partial<InboxThreadRecord> {
    const patch: Partial<InboxThreadRecord> = {};

    if (input.creatorId !== undefined) {
      patch.creatorId = input.creatorId ?? null;
    }

    if (input.campaignId !== undefined) {
      patch.myahCampaignId = input.campaignId ?? null;
    }

    if (input.inboxOwnerId !== undefined) {
      patch.inboxOwnerId = input.inboxOwnerId ?? null;
    }

    if (isDefined(input.inboxState)) {
      patch.inboxState = input.inboxState;
    }

    const targetState = input.inboxState ?? thread.inboxState;

    if (targetState === MyahInboxState.SNOOZED) {
      if (isDefined(input.inboxState) && !isDefined(input.snoozedUntil)) {
        throw new BadRequestException(
          'Snoozed Inbox threads require a future timestamp',
        );
      }

      if (isDefined(input.snoozedUntil)) {
        if (new Date(input.snoozedUntil).getTime() <= Date.now()) {
          throw new BadRequestException(
            'Snoozed Inbox threads require a future timestamp',
          );
        }

        patch.snoozedUntil = input.snoozedUntil;
      }
    } else {
      if (!isDefined(input.inboxState) && input.snoozedUntil !== undefined) {
        throw new BadRequestException(
          'A snooze timestamp requires the SNOOZED state',
        );
      }

      patch.snoozedUntil = null;
    }

    return patch;
  }

  private assertDraftOwner(
    thread: InboxThreadRecord,
    workspaceMemberId: string,
  ): void {
    if (thread.inboxOwnerId !== workspaceMemberId) {
      throw new ForbiddenException(
        'Only the current Inbox owner may edit the shared draft',
      );
    }
  }
}
