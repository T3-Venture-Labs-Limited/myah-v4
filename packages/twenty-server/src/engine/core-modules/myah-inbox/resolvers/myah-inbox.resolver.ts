import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxDraftSaveResult } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto';
import { MyahInboxThreadConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import { MyahInboxThreadsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { SaveMyahInboxDraftInput } from 'src/engine/core-modules/myah-inbox/dtos/save-myah-inbox-draft.input';
import { MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import { UpdateMyahInboxThreadInput } from 'src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-thread.input';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
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
  ) {}

  @Query(() => MyahInboxThreadConnection)
  async myahInboxThreads(
    @Args() input: MyahInboxThreadsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxThreadConnection> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.myahInboxQueryService.listThreads({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => MyahInboxThreadSummary)
  async updateMyahInboxThread(
    @Args('input') input: UpdateMyahInboxThreadInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxThreadSummary> {
    const { authContext, user } = this.getAuthenticatedUserContext();

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

    return this.myahInboxMutationService.saveMyahInboxDraft({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
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
