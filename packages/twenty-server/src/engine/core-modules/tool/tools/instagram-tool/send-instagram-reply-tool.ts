import { Injectable } from '@nestjs/common';

import {
  InstagramReplyActionDefinition,
} from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';
import {
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import {
  INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
  INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG,
  MyahComposioService,
  type InstagramToolExecutionResult,
} from 'src/modules/myah-composio/services/myah-composio.service';

import {
  sendInstagramReplyInputSchema,
  type SendInstagramReplyInput,
} from './instagram-reply-tool.schema';

@Injectable()
export class SendInstagramReplyTool implements Tool {
  description =
    'Send exactly one bound, user-approved text reply after the server re-proves the canonical account, conversation, recipient, and inbound message. Never use it for a first-contact DM.';
  inputSchema = sendInstagramReplyInputSchema;

  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    private readonly actionDefinition: InstagramReplyActionDefinition,
    private readonly myahComposioService: MyahComposioService,
    private readonly projector: ActionReceiptProjectorService,
  ) {}

  async execute(
    parameters: SendInstagramReplyInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const parsedInput = sendInstagramReplyInputSchema.safeParse(parameters);
    if (!parsedInput.success || !context.userWorkspaceId || !context.threadId) {
      return {
        success: false,
        message: 'Instagram reply could not be authorized.',
        error:
          'An authenticated chat thread and an approval binding are required to send an Instagram reply.',
      };
    }

    try {
      const binding = await this.actionApprovalService.getApprovedBinding({
        workspaceId: context.workspaceId,
        approvalBindingId: parsedInput.data.approvalBindingId,
        initiatorUserWorkspaceId: context.userWorkspaceId,
        threadId: context.threadId,
      });
      const authority = await this.actionDefinition.rebuildExecutionAuthority({
        workspaceId: context.workspaceId,
        binding,
      });
      const reservation =
        await this.actionApprovalService.reserveExecutionForBinding({
          approvalBindingId: parsedInput.data.approvalBindingId,
          expectedActionBinding: authority.expectedActionBinding,
        });

      if (reservation.state !== ActionExecutionReceiptState.PROCESSING) {
        return {
          success: false,
          message:
            'Instagram reply has already been processed and was not retried.',
        };
      }

      try {
        const activeAccount =
          await this.myahComposioService.getActiveInstagramAccount({
            workspaceId: context.workspaceId,
            connectedAccountId:
              authority.canonicalGraph.account.connectedAccountId,
          });
        if (
          activeAccount.connectedAccountId !==
            authority.canonicalGraph.account.connectedAccountId ||
          activeAccount.composioUserId !==
            authority.canonicalGraph.account.composioUserId
        ) {
          return this.recordTerminalState(
            reservation.id,
            ActionExecutionReceiptState.FAILED,
            'failed',
          );
        }

        const proof = await this.myahComposioService.executeInstagramTool({
          workspaceId: context.workspaceId,
          connectedAccountId:
            authority.canonicalGraph.account.connectedAccountId,
          toolSlug: INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
          arguments: {
            conversation_id: authority.canonicalGraph.providerConversationId,
            limit: 25,
          },
        });
        if (proof.kind !== 'success') {
          return this.recordProviderResult(reservation.id, proof);
        }
        if (
          !this.hasInboundMessageFromRecipient(
            proof.data,
            authority.canonicalGraph.recipientIgsid,
          )
        ) {
          return this.recordTerminalState(
            reservation.id,
            ActionExecutionReceiptState.FAILED,
            'failed',
          );
        }

        const sendResult =
          await this.myahComposioService.executeInstagramTool({
            workspaceId: context.workspaceId,
            connectedAccountId:
              authority.canonicalGraph.account.connectedAccountId,
            toolSlug: INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG,
            arguments: {
              recipient_id: authority.canonicalGraph.recipientIgsid,
              text: authority.canonicalGraph.draftBody,
            },
          });
        if (sendResult.kind !== 'success') {
          return this.recordProviderResult(reservation.id, sendResult);
        }

        await this.actionApprovalService.recordProviderAccepted(reservation.id, {
          code: 'accepted',
          acceptedAt: new Date(),
        });
        try {
          await this.projector.projectReceipt(reservation.id);
        } catch {
          // Reconciliation can replay this provider-free projection.
        }

        return { success: true, message: 'Instagram reply accepted.' };
      } catch {
        return this.recordTerminalState(
          reservation.id,
          ActionExecutionReceiptState.UNKNOWN,
          'unknown',
        );
      }
    } catch {
      return {
        success: false,
        message: 'Instagram reply could not be authorized.',
        error: 'Instagram reply could not be authorized.',
      };
    }
  }

  private async recordProviderResult(
    receiptId: string,
    result: Exclude<InstagramToolExecutionResult, { kind: 'success' }>,
  ): Promise<ToolOutput> {
    if (
      result.kind === 'provider_failure' &&
      result.providerSubcode === '2534022'
    ) {
      return this.recordTerminalState(
        receiptId,
        ActionExecutionReceiptState.BLOCKED,
        'blocked',
      );
    }

    return this.recordTerminalState(
      receiptId,
      result.kind === 'unknown'
        ? ActionExecutionReceiptState.UNKNOWN
        : ActionExecutionReceiptState.FAILED,
      result.kind === 'unknown' ? 'unknown' : 'failed',
    );
  }

  private async recordTerminalState(
    receiptId: string,
    state:
      | ActionExecutionReceiptState.BLOCKED
      | ActionExecutionReceiptState.FAILED
      | ActionExecutionReceiptState.UNKNOWN,
    code: 'blocked' | 'failed' | 'unknown',
  ): Promise<ToolOutput> {
    await this.actionApprovalService.recordProviderTerminalState({
      receiptId,
      state,
      code,
    });

    return {
      success: false,
      message: 'Instagram reply was not sent.',
    };
  }

  private hasInboundMessageFromRecipient(
    data: unknown,
    recipientIgsid: string,
  ): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const record = data as Record<string, unknown>;
    const nestedData =
      record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>).data
        : undefined;
    const messages = [record.data, record.items, nestedData].find(Array.isArray);
    if (!messages) {
      return false;
    }

    return messages.some((message) => {
      if (!message || typeof message !== 'object') {
        return false;
      }
      const candidate = message as Record<string, unknown>;
      const sender =
        candidate.from && typeof candidate.from === 'object'
          ? candidate.from
          : candidate.sender && typeof candidate.sender === 'object'
            ? candidate.sender
            : undefined;
      const senderId =
        sender && typeof (sender as Record<string, unknown>).id === 'string'
          ? (sender as Record<string, unknown>).id
          : undefined;
      const direction =
        typeof candidate.direction === 'string'
          ? candidate.direction.toUpperCase()
          : undefined;

      return senderId === recipientIgsid && (!direction || direction === 'INBOUND');
    });
  }
}
