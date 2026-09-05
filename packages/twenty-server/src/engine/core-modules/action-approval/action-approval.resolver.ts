import { UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';
import { DataSource } from 'typeorm';
import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import {
  ActionApprovalProposalDTO,
  ActionExecutionReceiptDTO,
  toActionExecutionReceiptDTO,
} from 'src/engine/core-modules/action-approval/dtos/action-approval-evidence.dto';
import { InstagramReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';
import {
  ActionApprovalBindingEntity,
  ActionApprovalBindingState,
} from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

@UseGuards(WorkspaceAuthGuard, SettingsPermissionGuard(PermissionFlagType.AI))
@MetadataResolver()
export class ActionApprovalResolver {
  constructor(
    private readonly dataSource: DataSource,
    private readonly actionApprovalService: ActionApprovalService,
    private readonly instagramReplyActionDefinition: InstagramReplyActionDefinition,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  @Query(() => ActionApprovalProposalDTO)
  async getActionApprovalProposal(
    @Args('bindingId', { type: () => UUIDScalarType }) bindingId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ActionApprovalProposalDTO> {
    const workspaceId = workspace.id;
    const binding = await this.actionApprovalService.getBindingForViewer({
      bindingId,
      workspaceId,
      userWorkspaceId,
    });

    if (
      binding.actionName === 'send_instagram_message' &&
      binding.actionVersion === 2 &&
      binding.actionKind === 'REPLY'
    ) {
      return this.getInstagramMessageProposal(workspace, binding);
    }
    try {
      return await this.instagramReplyActionDefinition.getProposal({
        workspaceId,
        binding,
      });
    } catch (error) {
      if (binding.state === ActionApprovalBindingState.PENDING) {
        throw error;
      }

      return {
        action: binding.actionName,
        actionVersion: binding.actionVersion,
        body: null,
        recipientLabel: null,
        sendingAccountLabel: null,
        state: binding.state,
        expiresAt: binding.expiresAt,
        occurredAt: binding.decidedAt ?? binding.createdAt,
        evidenceLinks: binding.evidenceLinks.map(
          ({ objectMetadataId, recordId, role }) => ({
            objectMetadataId,
            recordId,
            role,
          }),
        ),
      };
    }
  }

  private async getInstagramMessageProposal(
    workspace: WorkspaceEntity,
    binding: ActionApprovalBindingEntity,
  ): Promise<ActionApprovalProposalDTO> {
    const proposal =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const dataSource =
            await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
          const schemaName = getWorkspaceSchemaName(workspace.id);
          const [draft] = await dataSource.query<
            Array<{
              body: string | null;
              recipientUsername: string | null;
              accountLabel: string | null;
            }>
          >(
            `SELECT draft."body", draft."recipientUsername",
                    COALESCE(account."label", account."name") AS "accountLabel"
             FROM "${schemaName}"."_myahInstagramReplyDraft" draft
             LEFT JOIN "${schemaName}"."_myahSocialConversation" conversation
               ON conversation."id" = draft."conversationId"
             LEFT JOIN "${schemaName}"."_myahInstagramAccount" account
               ON account."id" = conversation."instagramAccountId"
             WHERE draft."id" = $1
               AND draft."deletedAt" IS NULL
             LIMIT 1`,
            [binding.draftId],
          );
          if (
            !draft?.body ||
            computeActionContentDigest(draft.body) !== binding.contentDigest
          ) {
            throw new Error('Instagram message proposal is unavailable');
          }

          return draft;
        },
        buildSystemAuthContext({
          workspace: workspace as unknown as FlatWorkspace,
        }),
      );

    return {
      action: binding.actionName,
      actionVersion: binding.actionVersion,
      body: proposal.body,
      recipientLabel: proposal.recipientUsername,
      sendingAccountLabel: proposal.accountLabel,
      state: binding.state,
      expiresAt: binding.expiresAt,
      occurredAt: binding.decidedAt ?? binding.createdAt,
      evidenceLinks: binding.evidenceLinks.map(
        ({ objectMetadataId, recordId, role }) => ({
          objectMetadataId,
          recordId,
          role,
        }),
      ),
    };
  }

  @Query(() => ActionExecutionReceiptDTO, { nullable: true })
  async getActionExecutionReceipt(
    @Args('bindingId', { type: () => UUIDScalarType }) bindingId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ActionExecutionReceiptDTO | null> {
    const binding = await this.actionApprovalService.getBindingForViewer({
      bindingId,
      workspaceId,
      userWorkspaceId,
    });
    const receipt = await this.dataSource
      .getRepository(ActionExecutionReceiptEntity)
      .findOne({ where: { actionApprovalBindingId: binding.id, workspaceId } });

    return receipt ? toActionExecutionReceiptDTO({ receipt, binding }) : null;
  }
}
