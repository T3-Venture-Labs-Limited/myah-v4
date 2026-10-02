import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  MyahInboxCampaignReplyCollisionPage,
  MyahInboxCampaignReplyHeldInput,
  MyahInboxCampaignReplyHeldPage,
  MyahInboxCampaignReplyPromoteInput,
  MyahInboxCampaignReplyPromoted,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-campaign-reply-work.dto';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CampaignEmailReplyWorkReviewService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-review.service';

@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
@CoreResolver(() => MyahInboxCampaignReplyHeldPage)
export class MyahInboxCampaignReplyWorkResolver {
  constructor(
    private readonly inbox: MyahInboxQueryService,
    private readonly work: CampaignEmailReplyWorkReviewService,
  ) {}

  @Query(() => MyahInboxCampaignReplyHeldPage)
  async myahInboxCampaignReplyHeld(
    @Args() input: MyahInboxCampaignReplyHeldInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxCampaignReplyHeldPage> {
    const authContext = getWorkspaceAuthContext();
    if (
      !isUserAuthContext(authContext) ||
      !authContext.user ||
      authContext.workspace.id !== input.expectedWorkspaceId ||
      workspace.id !== authContext.workspace.id ||
      workspaceMemberId !== authContext.workspaceMemberId
    )
      throw new ForbiddenException(
        'Inbox Campaign work requires a matching user',
      );
    // Native Inbox thread visibility is independent of Campaign binding visibility.
    await this.inbox.getThreadSummary({
      threadId: input.threadId,
      authContext,
      user: authContext.user,
      workspace,
      workspaceMemberId,
    });
    return this.work.listHeld({
      authContext,
      expectedWorkspaceId: workspace.id,
      threadId: input.threadId,
      cursor: input.cursor,
    });
  }

  @Query(() => MyahInboxCampaignReplyCollisionPage)
  async myahInboxCampaignReplyCollisions(
    @Args() input: MyahInboxCampaignReplyHeldInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxCampaignReplyCollisionPage> {
    const authContext = getWorkspaceAuthContext();
    if (
      !isUserAuthContext(authContext) ||
      !authContext.user ||
      authContext.workspace.id !== input.expectedWorkspaceId ||
      workspace.id !== authContext.workspace.id ||
      workspaceMemberId !== authContext.workspaceMemberId
    )
      throw new ForbiddenException(
        'Inbox collision attention requires a matching user',
      );
    await this.inbox.getThreadSummary({
      threadId: input.threadId,
      authContext,
      user: authContext.user,
      workspace,
      workspaceMemberId,
    });
    return this.work.listCollisions({
      authContext,
      expectedWorkspaceId: workspace.id,
      threadId: input.threadId,
      cursor: input.cursor,
    });
  }

  @Mutation(() => MyahInboxCampaignReplyPromoted)
  async myahInboxPromoteCampaignReplyHeld(
    @Args() input: MyahInboxCampaignReplyPromoteInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxCampaignReplyPromoted> {
    const authContext = getWorkspaceAuthContext();
    if (
      !isUserAuthContext(authContext) ||
      !authContext.user ||
      authContext.workspace.id !== input.expectedWorkspaceId ||
      workspace.id !== authContext.workspace.id ||
      workspaceMemberId !== authContext.workspaceMemberId
    )
      throw new ForbiddenException(
        'Inbox Campaign work requires a matching user',
      );
    const threadId = await this.work.threadIdForHeld({
      authContext,
      expectedWorkspaceId: workspace.id,
      workItemId: input.workItemId,
    });
    await this.inbox.getThreadSummary({
      threadId,
      authContext,
      user: authContext.user,
      workspace,
      workspaceMemberId,
    });
    // The service rechecks native thread/role, original READY provider ID,
    // exact route and CAS in its transaction; no send authority is inferred.
    return this.work.promote({ ...input, authContext });
  }
}
