import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { LinkMyahInboxContactCreatorInput } from 'src/engine/core-modules/myah-inbox/dtos/link-myah-inbox-contact-creator.input';
import { MyahInboxContactConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-connection.dto';
import {
  MyahInboxContactEmailMessageConnection,
  MyahInboxContactEmailMessagesInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-email-message-connection.dto';
import { MyahInboxContactsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-filter.input';
import { MyahInboxContactSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-summary.dto';
import { MyahInboxContactEmailQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-email-query.service';
import { MyahInboxContactLinkService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-link.service';
import { MyahInboxContactQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-query.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
@CoreResolver(() => MyahInboxContactConnection)
export class MyahInboxContactResolver {
  constructor(
    private readonly contactQueryService: MyahInboxContactQueryService,
    private readonly contactEmailQueryService: MyahInboxContactEmailQueryService,
    private readonly contactLinkService: MyahInboxContactLinkService,
  ) {}

  @Query(() => MyahInboxContactConnection)
  async myahInboxContacts(
    @Args() input: MyahInboxContactsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxContactConnection> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactQueryService.listContacts({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxContactSummary)
  async myahInboxContact(
    @Args('contactId', { type: () => String }) contactId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxContactSummary> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactQueryService.getContact({
      contactId,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxContactEmailMessageConnection)
  async myahInboxContactEmailMessages(
    @Args() input: MyahInboxContactEmailMessagesInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxContactEmailMessageConnection> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactEmailQueryService.listMessages({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => String)
  async linkMyahInboxContactCreator(
    @Args('input') input: LinkMyahInboxContactCreatorInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<string> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactLinkService.linkContact({
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
