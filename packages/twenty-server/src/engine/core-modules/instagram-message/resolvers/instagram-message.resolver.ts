import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  InstagramMessageComposerAccountDto,
  InstagramMessageComposerAttemptDto,
  InstagramMessageComposerPreparedDto,
  PrepareInstagramMessageComposerInputDto,
  SendInstagramMessageComposerInputDto,
} from 'src/engine/core-modules/instagram-message/dtos/instagram-message-composer.dto';
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
import { InstagramMessageComposerService } from 'src/engine/core-modules/instagram-message/services/instagram-message-composer.service';
import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';
import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';
import { InstagramMessageRecipientService } from 'src/engine/core-modules/instagram-message/services/instagram-message-recipient.service';
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
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
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
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly recipientService?: InstagramMessageRecipientService,
    private readonly composerService?: InstagramMessageComposerService,
  ) {}

  @Query(() => InstagramMessageComposerAccountDto)
  async instagramMessageComposerAccount(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageComposerAccountDto> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
        if (
          !(await this.permissionService.canQueryComposerAccount({
            workspaceId: workspace.id,
            rolePermissionConfig,
          }))
        ) {
          return {
            status: 'BLOCKED',
            code: 'MISSING_ROUTE_PERMISSION',
            sender: null,
          };
        }
        const account = await this.recordAccessService.getComposerAccount({
          workspaceId: workspace.id,
          rolePermissionConfig,
        });
        return account
          ? {
              status: 'READY',
              code: null,
              sender: {
                accountRecordId: account.instagramAccountRecordId,
                label: account.label,
              },
            }
          : { status: 'BLOCKED', code: 'ACCOUNT_UNAVAILABLE', sender: null };
      },
    );
  }

  @Query(() => InstagramMessageComposerPreparedDto)
  async prepareInstagramMessageComposer(
    @Args('input') input: PrepareInstagramMessageComposerInputDto,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageComposerPreparedDto> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
        const hasCreator = typeof input.creatorRecordId === 'string';
        const hasRaw = typeof input.rawHandle === 'string';
        if (hasCreator === hasRaw) {
          return {
            status: 'BLOCKED',
            code: 'RECIPIENT_UNAVAILABLE',
            normalizedHandle: null,
            creatorRecordId: null,
            sender: null,
            actionKind: null,
            preparationFingerprint: null,
          };
        }
        if (!this.recipientService) {
          throw new Error(
            'Instagram message recipient preparation is unavailable',
          );
        }
        const result = await this.recipientService.prepare(
          hasCreator
            ? { recipient: { creatorRecordId: input.creatorRecordId! } }
            : { recipient: { rawHandle: input.rawHandle! } },
          {
            workspaceId: workspace.id,
            initiatorUserWorkspaceId: userWorkspaceId,
            workspaceMemberId,
            rolePermissionConfig,
          },
        );
        if (result.status === 'BLOCKED') {
          return {
            status: result.status,
            code: result.code,
            normalizedHandle: null,
            creatorRecordId: null,
            sender: null,
            actionKind: null,
            preparationFingerprint: null,
          };
        }
        return { ...result, code: null };
      },
    );
  }

  @Mutation(() => InstagramMessageSendResultDto)
  async sendInstagramMessageComposer(
    @Args('input') input: SendInstagramMessageComposerInputDto,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageSendResultDto> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
        if (!this.composerService) {
          throw new Error('Instagram composer orchestration is unavailable');
        }
        const hasCreator = typeof input.creatorRecordId === 'string';
        const hasRaw = typeof input.rawHandle === 'string';
        if (hasCreator === hasRaw) {
          throw new Error('Instagram composer recipient is unavailable');
        }
        return this.composerService.send(
          {
            recipient: hasCreator
              ? { creatorRecordId: input.creatorRecordId! }
              : { rawHandle: input.rawHandle! },
            draftId: input.draftId,
            expectedAccountRecordId: input.expectedAccountRecordId,
            expectedPreparationFingerprint:
              input.expectedPreparationFingerprint,
            body: input.body,
          },
          {
            workspaceId: workspace.id,
            initiatorUserWorkspaceId: userWorkspaceId,
            workspaceMemberId,
            rolePermissionConfig,
          },
        );
      },
    );
  }

  @Query(() => InstagramMessageComposerAttemptDto, { nullable: true })
  async instagramMessageComposerAttempt(
    @Args('draftId', { type: () => UUIDScalarType }) draftId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageComposerAttemptDto | null> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
        if (!this.composerService) {
          throw new Error('Instagram composer orchestration is unavailable');
        }
        return this.composerService.getAttempt(draftId, {
          workspaceId: workspace.id,
          initiatorUserWorkspaceId: userWorkspaceId,
          workspaceMemberId,
          rolePermissionConfig,
        });
      },
    );
  }

  @Mutation(() => InstagramMessageDraftResultDto)
  async saveInstagramMessageDraft(
    @Args('input') input: SaveInstagramMessageDraftInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageDraftResultDto> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
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
      },
    );
  }

  @Query(() => InstagramMessageDraftResultDto, { nullable: true })
  async instagramMessageDraft(
    @Args('input') input: GetInstagramMessageDraftInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageDraftResultDto | null> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
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
      },
    );
  }

  @Mutation(() => InstagramMessageSendResultDto)
  async sendInstagramMessage(
    @Args('input') input: SendInstagramMessageInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageSendResultDto> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
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
      },
    );
  }

  @Query(() => InstagramMessageSendStatusDto)
  async instagramMessageSendStatus(
    @Args('input') input: InstagramMessageSendStatusInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<InstagramMessageSendStatusDto> {
    return this.executeInAuthenticatedWorkspaceContext(
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      async (rolePermissionConfig) => {
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

        const destination = result.confirmedDestinationSource
          ? await this.recordAccessService.getConfirmedDestination({
              workspaceId: workspace.id,
              rolePermissionConfig,
              source: result.confirmedDestinationSource,
            })
          : null;
        return {
          receiptId: result.receipt.id,
          creatorRecordId: destination?.creatorRecordId ?? null,
          conversationRecordId: destination?.conversationRecordId ?? null,
          state: result.receipt.state,
          providerCode: result.receipt.providerCode,
          outcome: result.receipt.outcome,
        };
      },
    );
  }

  private async executeInAuthenticatedWorkspaceContext<T>(
    workspace: WorkspaceEntity,
    userWorkspaceId: string,
    workspaceMemberId: string,
    callback: (rolePermissionConfig: RolePermissionConfig) => Promise<T>,
  ): Promise<T> {
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

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
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

        return callback(rolePermissionConfig);
      },
      authContext,
    );
  }
}
