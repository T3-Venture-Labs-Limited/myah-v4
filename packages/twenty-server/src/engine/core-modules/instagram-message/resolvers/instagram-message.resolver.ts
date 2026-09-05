import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  GetInstagramMessageDraftInput,
  InstagramMessageDraftResultDto,
  InstagramMessageSendResultDto,
  InstagramMessageSendStatusDto,
  InstagramMessageSendStatusInput,
  SaveInstagramMessageDraftInput,
  SendInstagramMessageInput,
} from 'src/engine/core-modules/instagram-message/dtos/instagram-message.dto';
import { InstagramMessageDraftService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft.service';
import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';
import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';
import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
@CoreResolver()
export class InstagramMessageResolver {
  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    private readonly draftService: InstagramMessageDraftService,
    private readonly sendService: InstagramMessageSendService,
    private readonly recordAccessService: InstagramMessageRecordAccessService,
    private readonly myahTeamAuthorizationService: MyahTeamAuthorizationService,
    private readonly permissionService: InstagramMessagePermissionService,
  ) {}

  @Mutation(() => InstagramMessageDraftResultDto)
  async saveInstagramMessageDraft(
    @Args('input') input: SaveInstagramMessageDraftInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageDraftResultDto> {
    const rolePermissionConfig = this.getRolePermissionConfig(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
    );
    await this.permissionService.assertCanSend({
      actionKind: input.kind === 'FIRST_MESSAGE' ? 'START_CHAT' : 'REPLY',
      rolePermissionConfig,
      workspaceId: workspace.id,
    });
    await this.recordAccessService.assertCanSaveDraft({
      ...input,
      workspaceId: workspace.id,
      rolePermissionConfig,
    });

    const result = await this.draftService.saveDraft({
      ...input,
      workspaceId: workspace.id,
      workspaceMemberId,
    });
    if (result.status === 'CONFLICT') {
      await this.recordAccessService.assertCanReadDraft({
        workspaceId: workspace.id,
        draftId: result.draftId,
        rolePermissionConfig,
      });
    }

    return result;
  }

  @Query(() => InstagramMessageDraftResultDto, { nullable: true })
  async instagramMessageDraft(
    @Args('input') input: GetInstagramMessageDraftInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageDraftResultDto | null> {
    const rolePermissionConfig = this.getRolePermissionConfig(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
    );
    await this.permissionService.assertCanSend({
      actionKind: input.kind === 'FIRST_MESSAGE' ? 'START_CHAT' : 'REPLY',
      rolePermissionConfig,
      workspaceId: workspace.id,
    });
    await this.recordAccessService.assertCanSaveDraft({
      ...input,
      workspaceId: workspace.id,
      draftId: '00000000-0000-4000-8000-000000000000',
      expectedRevision: 0,
      rolePermissionConfig,
    });
    const result = await this.draftService.getDraftForTarget({
      ...input,
      workspaceId: workspace.id,
    });

    if (result) {
      await this.recordAccessService.assertCanReadDraft({
        workspaceId: workspace.id,
        draftId: result.draftId,
        rolePermissionConfig,
      });
    }

    return result;
  }

  @Mutation(() => InstagramMessageSendResultDto)
  async sendInstagramMessage(
    @Args('input') input: SendInstagramMessageInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageSendResultDto> {
    const rolePermissionConfig = this.getRolePermissionConfig(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
    );
    await this.recordAccessService.assertCanReadDraft({
      workspaceId: workspace.id,
      draftId: input.draftId,
      rolePermissionConfig,
    });

    return this.sendService.sendDirect({
      workspaceId: workspace.id,
      initiatorUserWorkspaceId: userWorkspaceId,
      draftId: input.draftId,
      expectedRevision: input.expectedRevision,
      rolePermissionConfig,
    });
  }

  @Query(() => InstagramMessageSendStatusDto)
  async instagramMessageSendStatus(
    @Args('input') input: InstagramMessageSendStatusInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageSendStatusDto> {
    const rolePermissionConfig = this.getRolePermissionConfig(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
    );
    const authContext = getWorkspaceAuthContext();
    const isWorkspaceOperator =
      isUserAuthContext(authContext) &&
      this.myahTeamAuthorizationService.isMyahTeamMember(authContext.user);
    const result =
      await this.actionApprovalService.getDirectInstagramReceiptForViewer({
        receiptId: input.receiptId,
        workspaceId: workspace.id,
        userWorkspaceId,
        allowWorkspaceOperator: isWorkspaceOperator,
      });
    await this.permissionService.assertCanSend({
      actionKind: result.actionKind,
      rolePermissionConfig,
      workspaceId: workspace.id,
    });

    return {
      receiptId: result.receipt.id,
      state: result.receipt.state,
      providerCode: result.receipt.providerCode,
      outcome: result.receipt.outcome,
    };
  }

  private getRolePermissionConfig(
    workspace: WorkspaceEntity,
    userWorkspaceId: string,
    workspaceMemberId: string,
  ): RolePermissionConfig {
    const authContext = getWorkspaceAuthContext();
    if (
      !isUserAuthContext(authContext) ||
      !authContext.user ||
      authContext.workspace.id !== workspace.id ||
      authContext.userWorkspaceId !== userWorkspaceId ||
      authContext.workspaceMemberId !== workspaceMemberId
    ) {
      throw new ForbiddenException(
        'Instagram messaging requires matching authenticated user context',
      );
    }
    const workspaceContext = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
    });
    if (!rolePermissionConfig) {
      throw new ForbiddenException(
        'Instagram message permissions are required',
      );
    }

    return rolePermissionConfig;
  }
}
