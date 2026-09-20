import {
  MyahInboxReplyDraftInput,
  validateReplyTargetInput,
  validateReplyContextInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { assertMyahInboxExpectedWorkspace } from 'src/engine/core-modules/myah-inbox/utils/assert-myah-inbox-expected-workspace.util';
import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  MyahInboxReplySendReadiness,
  MyahInboxReplySendResult,
  MyahInboxReplySendStatus,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send.dto';
import { MyahInboxReplySendStatusInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send-status.input';
import { SendMyahInboxReplyInput } from 'src/engine/core-modules/myah-inbox/dtos/send-myah-inbox-reply.input';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(
  WorkspaceAuthGuard,
  UserAuthGuard,
  CustomPermissionGuard,
  SettingsPermissionGuard(PermissionFlagType.SEND_EMAIL_TOOL),
)
@CoreResolver()
export class MyahInboxReplySendResolver {
  constructor(
    private readonly myahInboxReplySendService: MyahInboxReplySendService,
  ) {}

  @Query(() => MyahInboxReplySendReadiness)
  async myahInboxReplySendReadiness(
    @Args('input') input: MyahInboxReplyDraftInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxReplySendReadiness> {
    return this.myahInboxReplySendService.getReadiness({
      target: validateReplyTargetInput(input.target),
      replyContext: validateReplyContextInput(input.replyContext),
      ...this.getAuthenticatedRequestContext(
        workspace,
        userWorkspaceId,
        workspaceMemberId,
        input.expectedWorkspaceId,
      ),
    });
  }

  @Mutation(() => MyahInboxReplySendResult)
  async sendMyahInboxReply(
    @Args('input') input: SendMyahInboxReplyInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxReplySendResult> {
    return this.myahInboxReplySendService.send({
      target: validateReplyTargetInput(input.target),
      replyContext: validateReplyContextInput(input.replyContext),
      expectedDraftRevision: input.expectedDraftRevision,
      ...this.getAuthenticatedRequestContext(
        workspace,
        userWorkspaceId,
        workspaceMemberId,
        input.expectedWorkspaceId,
      ),
    });
  }

  @Query(() => MyahInboxReplySendStatus)
  async myahInboxReplySendStatus(
    @Args('input') input: MyahInboxReplySendStatusInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxReplySendStatus> {
    return this.myahInboxReplySendService.getStatus({
      target: validateReplyTargetInput(input.target),
      replyContext: validateReplyContextInput(input.replyContext),
      receiptId: input.receiptId,
      ...this.getAuthenticatedRequestContext(
        workspace,
        userWorkspaceId,
        workspaceMemberId,
        input.expectedWorkspaceId,
      ),
    });
  }

  private getAuthenticatedRequestContext(
    workspace: WorkspaceEntity,
    userWorkspaceId: string,
    workspaceMemberId: string,
    expectedWorkspaceId?: string | null,
  ) {
    const authContext = getWorkspaceAuthContext();

    if (
      !isUserAuthContext(authContext) ||
      !authContext.user ||
      authContext.workspace.id !== workspace.id ||
      authContext.userWorkspaceId !== userWorkspaceId ||
      authContext.workspaceMemberId !== workspaceMemberId
    ) {
      throw new ForbiddenException(
        'The Myah Inbox requires matching authenticated user context',
      );
    }

    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      expectedWorkspaceId,
    );

    return {
      authContext,
      user: authContext.user,
      workspace,
      userWorkspaceId,
      workspaceMemberId,
    };
  }
}
