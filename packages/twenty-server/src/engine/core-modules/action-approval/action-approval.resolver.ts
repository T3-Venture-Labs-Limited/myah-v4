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
import { ActionApprovalBindingState } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(WorkspaceAuthGuard, SettingsPermissionGuard(PermissionFlagType.AI))
@MetadataResolver()
export class ActionApprovalResolver {
  constructor(
    private readonly dataSource: DataSource,
    private readonly actionApprovalService: ActionApprovalService,
    private readonly instagramReplyActionDefinition: InstagramReplyActionDefinition,
  ) {}

  @Query(() => ActionApprovalProposalDTO)
  async getActionApprovalProposal(
    @Args('bindingId', { type: () => UUIDScalarType }) bindingId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ActionApprovalProposalDTO> {
    const binding = await this.actionApprovalService.getBindingForViewer({
      bindingId,
      workspaceId,
      userWorkspaceId,
    });

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
