import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxThreadConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import { MyahInboxThreadsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
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
  constructor(private readonly myahInboxQueryService: MyahInboxQueryService) {}

  @Query(() => MyahInboxThreadConnection)
  async myahInboxThreads(
    @Args() input: MyahInboxThreadsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxThreadConnection> {
    const authContext = getWorkspaceAuthContext();

    if (!isUserAuthContext(authContext) || !authContext.user) {
      throw new ForbiddenException(
        'The Myah Inbox requires authenticated user context',
      );
    }

    return this.myahInboxQueryService.listThreads({
      ...input,
      authContext,
      user: authContext.user,
      workspace,
      workspaceMemberId,
    });
  }
}
