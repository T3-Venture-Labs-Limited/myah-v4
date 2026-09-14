import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import {
  MyahInboxInstagramMessageConnection,
  MyahInboxInstagramMessagesInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-instagram-message-page.dto';
import { MyahInboxInstagramMessageQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-instagram-message-query.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';

@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
@CoreResolver(() => MyahInboxInstagramMessageConnection)
export class MyahInboxInstagramMessageResolver {
  constructor(
    private readonly instagramMessageQueryService: MyahInboxInstagramMessageQueryService,
  ) {}

  @Query(() => MyahInboxInstagramMessageConnection)
  async myahInboxInstagramMessages(
    @Args() input: MyahInboxInstagramMessagesInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() _workspaceMemberId: string,
  ): Promise<MyahInboxInstagramMessageConnection> {
    const authContext = getWorkspaceAuthContext();
    if (!isUserAuthContext(authContext) || !authContext.user) {
      throw new ForbiddenException(
        'The Myah Inbox requires authenticated user context',
      );
    }
    return this.instagramMessageQueryService.listMessages({
      ...input,
      authContext,
      user: authContext.user,
      workspace,
    });
  }
}
