import { UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { MyahInboxThreadConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto';
import { MyahInboxThreadsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(WorkspaceAuthGuard, CustomPermissionGuard)
@CoreResolver(() => MyahInboxThreadConnection)
export class MyahInboxResolver {
  constructor(private readonly myahInboxQueryService: MyahInboxQueryService) {}

  @Query(() => MyahInboxThreadConnection)
  async myahInboxThreads(
    @Args() input: MyahInboxThreadsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxThreadConnection> {
    return this.myahInboxQueryService.listThreads({
      ...input,
      workspaceId: workspace.id,
      workspaceMemberId,
    });
  }
}
