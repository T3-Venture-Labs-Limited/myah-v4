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
import { MyahInboxReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import { OutreachEmailActionDefinition } from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';
import {
  ActionApprovalBindingState,
  type ActionApprovalBindingEntity,
} from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { InstagramMessageProposalReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-proposal-reader.service';
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
    private readonly instagramMessageProposalReader: InstagramMessageProposalReaderService,
    private readonly outreachEmailActionDefinition: OutreachEmailActionDefinition,
    private readonly myahInboxReplyActionDefinition: MyahInboxReplyActionDefinition,
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

    if (
      binding.actionName === 'send_instagram_message' &&
      binding.actionVersion === 2 &&
      binding.actionKind === 'REPLY'
    ) {
      return this.getInstagramMessageProposal(binding, userWorkspaceId);
    }

    const actionDefinitions = {
      send_outreach_email: this.outreachEmailActionDefinition,
      send_inbox_reply: this.myahInboxReplyActionDefinition,
    } as const;
    const actionDefinition =
      actionDefinitions[binding.actionName as keyof typeof actionDefinitions];

    if (!actionDefinition) {
      if (binding.state === ActionApprovalBindingState.PENDING) {
        throw new Error(`Unsupported action approval "${binding.actionName}".`);
      }

      return {
        action: binding.actionName,
        actionVersion: binding.actionVersion,
        body: null,
        recipientLabel: null,
        sendingAccountLabel: null,
        subject: null,
        draftRevision: null,
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

    try {
      const proposal = await actionDefinition.getProposal({
        workspaceId,
        binding,
      });

      return {
        ...proposal,
        recipientLabel:
          'recipientEmail' in proposal &&
          typeof proposal.recipientEmail === 'string'
            ? proposal.recipientLabel === proposal.recipientEmail
              ? proposal.recipientEmail
              : `${proposal.recipientLabel} <${proposal.recipientEmail}>`
            : proposal.recipientLabel,
        sendingAccountLabel:
          'sendingAccountLabel' in proposal
            ? proposal.sendingAccountLabel
            : proposal.senderEmail,
        subject: 'subject' in proposal ? proposal.subject : null,
        draftRevision:
          'draftRevision' in proposal &&
          typeof proposal.draftRevision === 'number'
            ? proposal.draftRevision
            : null,
      };
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
        subject: null,
        draftRevision: null,
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
    binding: ActionApprovalBindingEntity,
    userWorkspaceId: string,
  ): Promise<ActionApprovalProposalDTO> {
    const proposal = await this.instagramMessageProposalReader.read(
      binding,
      userWorkspaceId,
    );

    return {
      action: binding.actionName,
      actionVersion: binding.actionVersion,
      body: proposal.body,
      recipientLabel: proposal.recipientUsername,
      sendingAccountLabel: proposal.accountLabel,
      subject: null,
      draftRevision: null,
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
