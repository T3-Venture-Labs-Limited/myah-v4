import {
  MyahInboxReplyContextOptionsInput,
  validateReplyContextOptionsInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context-options.input';
import { MyahInboxReplyContextOptions } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context-options.dto';
import { MyahInboxReplyContextOptionsService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-options.service';
import { assertMyahInboxExpectedWorkspace } from 'src/engine/core-modules/myah-inbox/utils/assert-myah-inbox-expected-workspace.util';
import {
  ForbiddenException,
  Inject,
  Optional,
  UseGuards,
} from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MyahInboxEmailDraft } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-email-draft.dto';
import { MyahInboxReplyContextDraft } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context-draft.dto';
import {
  MyahInboxReplyDraftInput,
  validateReplyContextInput,
  validateReplyTargetInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { GenerateMyahInboxReplyProposalInput } from 'src/engine/core-modules/myah-inbox/dtos/generate-myah-inbox-reply-proposal.input';
import { MyahInboxDraftSaveResult } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import { MyahInboxReplyProposal } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-proposal.dto';
import { MyahInboxThreadConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import { MyahInboxThreadsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import {
  SaveMyahInboxDraftInput,
  ReviewMyahInboxReplyContextInput,
} from 'src/engine/core-modules/myah-inbox/dtos/save-myah-inbox-draft.input';
import { MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import { UpdateMyahInboxThreadInput } from 'src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-thread.input';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import {
  MYAH_INBOX_REPLY_CONTEXT_DRAFT_READER,
  MyahInboxReplyContextService,
  toDraftExecutionState,
  toResolvedReplyContextDto,
  type MyahInboxReplyContextDraftReader,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { decodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
@CoreResolver(() => MyahInboxThreadConnection)
export class MyahInboxResolver {
  constructor(
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly myahInboxMutationService: MyahInboxMutationService,
    private readonly myahInboxReplyProposalService: MyahInboxReplyProposalService,
    @Optional()
    private readonly myahInboxReplyContextService?: MyahInboxReplyContextService,
    @Optional()
    @Inject(MYAH_INBOX_REPLY_CONTEXT_DRAFT_READER)
    private readonly myahInboxReplyContextDraftReader?: MyahInboxReplyContextDraftReader,
    @Optional()
    private readonly myahInboxReplyContextOptionsService?: MyahInboxReplyContextOptionsService,
  ) {}

  @Query(() => MyahInboxThreadConnection)
  async myahInboxThreads(
    @Args() input: MyahInboxThreadsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxThreadConnection> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );

    return this.myahInboxQueryService.listThreads({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxEmailDraft)
  async myahInboxEmailDraft(
    @Args('threadId', { type: () => UUIDScalarType }) threadId: string,
    @Args('expectedWorkspaceId', { type: () => UUIDScalarType })
    expectedWorkspaceId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxEmailDraft> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      expectedWorkspaceId,
    );
    return this.myahInboxQueryService.readEmailDraft({
      threadId,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxReplyContextOptions)
  async myahInboxReplyContextOptions(
    @Args('input') input: MyahInboxReplyContextOptionsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxReplyContextOptions> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    validateReplyContextOptionsInput(input);
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    if (
      workspace.id !== authContext.workspace.id ||
      workspaceMemberId !== authContext.workspaceMemberId ||
      !this.myahInboxReplyContextOptionsService
    ) {
      throw new ForbiddenException('Reply context is not available');
    }
    return this.myahInboxReplyContextOptionsService.listOptions({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxReplyContextDraft)
  async myahInboxReplyDraft(
    @Args('input') input: MyahInboxReplyDraftInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxReplyContextDraft> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    const target = validateReplyTargetInput(input.target);
    const replyContext = validateReplyContextInput(input.replyContext);
    const contactIdentity = decodeMyahInboxContactId(
      target.contactId,
      input.expectedWorkspaceId,
    );
    const contextService = this.myahInboxReplyContextService;
    const draftReader = this.myahInboxReplyContextDraftReader;

    if (!contextService || !draftReader) {
      throw new ForbiddenException('Reply context is not available');
    }

    const request = {
      target,
      replyContext,
      contactIdentity,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    };
    const resolved = await contextService.resolveForRead(request);
    const requiredContextReadable = resolved.state !== 'CONTEXT_UNAVAILABLE';
    const snapshot = requiredContextReadable
      ? await draftReader.read({
          request,
          resolvedContext: resolved,
        })
      : null;
    const actionEligible =
      resolved.state === 'READY' && snapshot?.contextAcknowledged !== false;
    const body = snapshot?.body ?? null;

    return {
      draftId: requiredContextReadable ? (snapshot?.draftId ?? null) : null,
      revision: requiredContextReadable ? (snapshot?.revision ?? 0) : 0,
      body,
      resolvedContext: requiredContextReadable
        ? toResolvedReplyContextDto(resolved)
        : null,
      executionState: toDraftExecutionState({
        targetState: snapshot?.targetState ?? null,
        actionEligible,
        requiredContextReadable,
        hasReadableBody: body !== null,
      }),
    };
  }

  @Mutation(() => MyahInboxThreadSummary)
  async updateMyahInboxThread(
    @Args('input') input: UpdateMyahInboxThreadInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxThreadSummary> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );

    return this.myahInboxMutationService.updateMyahInboxThread({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => MyahInboxDraftSaveResult)
  async saveMyahInboxDraft(
    @Args('input') input: SaveMyahInboxDraftInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxDraftSaveResult> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );

    return this.myahInboxMutationService.saveMyahInboxDraft({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => MyahInboxReplyContextDraft)
  async reviewMyahInboxReplyContext(
    @Args('input') input: ReviewMyahInboxReplyContextInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxReplyContextDraft> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    await this.myahInboxMutationService.reviewMyahInboxReplyContext({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
    return this.myahInboxReplyDraft(input, workspace, workspaceMemberId);
  }

  @Mutation(() => MyahInboxReplyProposal)
  async generateMyahInboxReplyProposal(
    @Args('input') input: GenerateMyahInboxReplyProposalInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxReplyProposal> {
    const { authContext } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );

    if (
      authContext.workspace.id !== workspace.id ||
      authContext.workspaceMemberId !== workspaceMemberId
    ) {
      throw new ForbiddenException(
        'Reply proposal authentication context does not match',
      );
    }

    return await this.myahInboxReplyProposalService.generateContextReplyProposal(
      {
        ...input,
        authContext,
      },
    );
  }

  private getAuthenticatedUserContext() {
    const authContext = getWorkspaceAuthContext();

    if (!isUserAuthContext(authContext) || !authContext.user) {
      throw new ForbiddenException(
        'The Myah Inbox requires authenticated user context',
      );
    }

    return { authContext, user: authContext.user };
  }
}
