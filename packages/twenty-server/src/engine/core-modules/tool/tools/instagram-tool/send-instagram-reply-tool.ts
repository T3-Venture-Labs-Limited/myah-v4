import { Injectable } from '@nestjs/common';

import {
  InstagramReplyActionDefinition,
  type InstagramReplyActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
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
        approvalBindingId: parsedInput.data.actionApprovalBindingId,
        initiatorUserWorkspaceId: context.userWorkspaceId,
        threadId: context.threadId,
      });
      const existingReceipt =
        await this.actionApprovalService.findExecutionReceiptForBinding({
          workspaceId: context.workspaceId,
          approvalBindingId: parsedInput.data.actionApprovalBindingId,
        });
      if (existingReceipt) {
        if (
          existingReceipt.state ===
          ActionExecutionReceiptState.PROVIDER_ACCEPTED
        ) {
          try {
            await this.projector.projectReceipt(existingReceipt.id);
          } catch {
            return {
              success: false,
              message: 'Instagram reply could not be finalized.',
            };
          }

          return { success: true, message: 'Instagram reply accepted.' };
        }

        return {
          success: false,
          message:
            'Instagram reply has already been processed and was not retried.',
        };
      }

      const authority = await this.actionDefinition.rebuildExecutionAuthority({
        workspaceId: context.workspaceId,
        binding,
      });
      const proof = await this.rebuildInboundProof(
        context.workspaceId,
        authority,
      );
      if (!proof) {
        return { success: false, message: 'Instagram reply was not sent.' };
      }

      const reservation =
        await this.actionApprovalService.reserveExecutionForBinding({
          approvalBindingId: parsedInput.data.actionApprovalBindingId,
          expectedActionBinding: binding,
        });
      if (!reservation.created) {
        if (
          reservation.receipt.state ===
          ActionExecutionReceiptState.PROVIDER_ACCEPTED
        ) {
          try {
            await this.projector.projectReceipt(reservation.receipt.id);
          } catch {
            return {
              success: false,
              message: 'Instagram reply could not be finalized.',
            };
          }

          return { success: true, message: 'Instagram reply accepted.' };
        }

        return {
          success: false,
          message:
            'Instagram reply has already been processed and was not retried.',
        };
      }
      if (
        reservation.receipt.state !== ActionExecutionReceiptState.PROCESSING
      ) {
        return {
          success: false,
          message:
            'Instagram reply has already been processed and was not retried.',
        };
      }

      try {
        const sendResult = await this.myahComposioService.executeInstagramTool({
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
          return this.recordProviderResult(reservation.receipt.id, sendResult);
        }

        await this.actionApprovalService.recordProviderAccepted(
          reservation.receipt.id,
          {
            code: 'accepted',
            acceptedAt: new Date(),
          },
        );
        try {
          await this.projector.projectReceipt(reservation.receipt.id);
        } catch {
          // Reconciliation can replay this provider-free projection.
        }

        return { success: true, message: 'Instagram reply accepted.' };
      } catch {
        return this.recordTerminalState(
          reservation.receipt.id,
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

  private async rebuildInboundProof(
    workspaceId: string,
    authority: InstagramReplyActionAuthority,
  ): Promise<boolean> {
    try {
      const activeAccount =
        await this.myahComposioService.getActiveInstagramAccount({
          workspaceId,
          connectedAccountId:
            authority.canonicalGraph.account.connectedAccountId,
        });
      if (
        activeAccount.connectedAccountId !==
          authority.canonicalGraph.account.connectedAccountId ||
        activeAccount.composioUserId !==
          authority.canonicalGraph.account.composioUserId
      ) {
        return false;
      }

      const proof = await this.myahComposioService.executeInstagramTool({
        workspaceId,
        connectedAccountId: authority.canonicalGraph.account.connectedAccountId,
        toolSlug: INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG,
        arguments: {
          conversation_id: authority.canonicalGraph.providerConversationId,
          limit: 25,
        },
      });
      if (
        proof.kind !== 'success' ||
        !proof.data ||
        typeof proof.data !== 'object'
      ) {
        return false;
      }

      const record = proof.data as Record<string, unknown>;
      const nestedData =
        record.data && typeof record.data === 'object'
          ? (record.data as Record<string, unknown>).data
          : undefined;
      const messages = [record.data, record.items, nestedData].find(
        Array.isArray,
      );
      const inboundReceivedAt =
        authority.canonicalGraph.inboundReceivedAt.getTime();
      const now = Date.now();
      if (
        !messages ||
        inboundReceivedAt < now - 24 * 60 * 60 * 1000 ||
        inboundReceivedAt > now
      ) {
        return false;
      }

      return messages.some((message) => {
        if (!message || typeof message !== 'object') {
          return false;
        }

        const candidate = message as Record<string, unknown>;
        const sender =
          candidate.from && typeof candidate.from === 'object'
            ? (candidate.from as Record<string, unknown>)
            : undefined;
        const senderId = sender?.id;
        const recipient =
          candidate.to && typeof candidate.to === 'object'
            ? (candidate.to as Record<string, unknown>)
            : undefined;
        const recipientIds = [
          recipient?.id,
          ...(Array.isArray(recipient?.data)
            ? recipient.data.map((value) =>
                value && typeof value === 'object'
                  ? (value as Record<string, unknown>).id
                  : undefined,
              )
            : []),
        ];
        const direction =
          typeof candidate.direction === 'string'
            ? candidate.direction.toUpperCase()
            : senderId === authority.canonicalGraph.inboundSenderIgsid &&
                recipientIds.includes(authority.canonicalGraph.account.igUserId)
              ? 'INBOUND'
              : undefined;
        const createdTime =
          typeof candidate.created_time === 'string'
            ? Date.parse(candidate.created_time)
            : Number.NaN;

        return (
          candidate.id === authority.canonicalGraph.inboundMessageId &&
          direction === authority.canonicalGraph.inboundDirection &&
          senderId === authority.canonicalGraph.inboundSenderIgsid &&
          recipientIds.includes(authority.canonicalGraph.account.igUserId) &&
          createdTime === inboundReceivedAt
        );
      });
    } catch {
      return false;
    }
  }
}
