import { UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';
import { DataSource } from 'typeorm';
import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import {
  ActionApprovalProposalDTO,
  ActionExecutionReceiptDTO,
  toActionApprovalProposalDTO,
  toActionExecutionReceiptDTO,
} from 'src/engine/core-modules/action-approval/dtos/action-approval-evidence.dto';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { AgentChatThreadEntity } from 'src/engine/metadata-modules/ai/ai-chat/entities/agent-chat-thread.entity';

const ACTION_APPROVAL_EVIDENCE_NOT_FOUND = 'Action approval evidence was not found';

@UseGuards(WorkspaceAuthGuard, SettingsPermissionGuard(PermissionFlagType.AI))
@MetadataResolver()
export class ActionApprovalResolver {
  constructor(private readonly dataSource: DataSource) {}

  @Query(() => ActionApprovalProposalDTO)
  async getActionApprovalProposal(
    @Args('bindingId', { type: () => UUIDScalarType }) bindingId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ActionApprovalProposalDTO> {
    const binding = await this.findBindingForViewer({
      bindingId,
      workspaceId,
      userWorkspaceId,
    });

    return toActionApprovalProposalDTO(binding);
  }

  @Query(() => ActionExecutionReceiptDTO, { nullable: true })
  async getActionExecutionReceipt(
    @Args('bindingId', { type: () => UUIDScalarType }) bindingId: string,
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ActionExecutionReceiptDTO | null> {
    const binding = await this.findBindingForViewer({
      bindingId,
      workspaceId,
      userWorkspaceId,
    });
    const receipt = await this.dataSource
      .getRepository(ActionExecutionReceiptEntity)
      .findOne({ where: { actionApprovalBindingId: binding.id, workspaceId } });

    return receipt ? toActionExecutionReceiptDTO({ receipt, binding }) : null;
  }

  private async findBindingForViewer({
    bindingId,
    workspaceId,
    userWorkspaceId,
  }: {
    bindingId: string;
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<ActionApprovalBindingEntity> {
    const binding = await this.dataSource
      .getRepository(ActionApprovalBindingEntity)
      .findOne({
        where: { id: bindingId, workspaceId },
        relations: { evidenceLinks: true },
      });

    if (!binding || binding.initiatorUserWorkspaceId !== userWorkspaceId) {
      throw new Error(ACTION_APPROVAL_EVIDENCE_NOT_FOUND);
    }

    const thread = await this.dataSource
      .getRepository(AgentChatThreadEntity)
      .findOne({
        where: {
          id: binding.threadId,
          workspaceId,
          userWorkspaceId,
        },
      });

    if (!thread) {
      throw new Error(ACTION_APPROVAL_EVIDENCE_NOT_FOUND);
    }

    return binding;
  }
}
