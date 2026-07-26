import { Injectable } from '@nestjs/common';

import { OutreachEmailActionDefinition } from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { escapeHtml } from 'src/engine/core-modules/emailing-domain/utils/escape-html.util';
import {
  SendOutreachEmailInputZodSchema,
  type SendOutreachEmailInput,
} from 'src/engine/core-modules/tool/tools/outreach-email-tool/outreach-email-tool.schema';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';
import { type SendMessageResult } from 'src/modules/messaging/message-outbound-manager/types/send-message-result.type';
import { classifyMessageOutboundError } from 'src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util';

export const SEND_OUTREACH_EMAIL_TOOL_NAME = 'send_outreach_email';

@Injectable()
export class SendOutreachEmailTool implements Tool {
  description =
    'Send exactly one prepared outreach email after the server re-proves its approved content, Creator recipient, selected mailbox, and reply thread.';
  inputSchema = SendOutreachEmailInputZodSchema;

  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    private readonly actionDefinition: OutreachEmailActionDefinition,
    private readonly messageOutboundService: MessagingMessageOutboundService,
    private readonly sentMessagePersistenceService: SentMessagePersistenceService,
    private readonly projector: ActionReceiptProjectorService,
  ) {}

  async execute(
    parameters: SendOutreachEmailInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const parsedInput = SendOutreachEmailInputZodSchema.safeParse(parameters);

    if (!parsedInput.success || !context.userWorkspaceId || !context.threadId) {
      return {
        success: false,
        message: 'Outreach email could not be authorized.',
        error:
          'An authenticated chat thread and an approval binding are required to send outreach email.',
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
        return this.handleExistingReceipt(existingReceipt);
      }

      const authority = await this.actionDefinition.rebuildExecutionAuthority({
        workspaceId: context.workspaceId,
        binding,
      });
      const reservation =
        await this.actionApprovalService.reserveExecutionForBinding({
          approvalBindingId: parsedInput.data.actionApprovalBindingId,
          expectedActionBinding: binding,
        });

      if (!reservation.created) {
        return this.handleExistingReceipt(reservation.receipt);
      }

      if (
        reservation.receipt.state !== ActionExecutionReceiptState.PROCESSING
      ) {
        return {
          success: false,
          message:
            'Outreach email has already been processed and was not retried.',
        };
      }

      const graph = authority.canonicalGraph;
      let sendResult: SendMessageResult;

      try {
        sendResult = await this.messageOutboundService.sendDraft(
          graph.providerDraftExternalId,
          {
            to: [graph.recipientEmail],
            subject: graph.subject,
            body: graph.body,
            html: escapeHtml(graph.body),
            attachments: [],
            inReplyTo: graph.inReplyTo ?? undefined,
            threadExternalId: graph.providerThreadExternalId ?? undefined,
          },
          graph.connectedAccount,
        );
      } catch (error) {
        return this.recordProviderFailure(reservation.receipt.id, error);
      }

      await this.actionApprovalService.recordProviderAccepted(
        reservation.receipt.id,
        {
          code: 'accepted',
          acceptedAt: new Date(),
          providerMessageId: sendResult.headerMessageId,
        },
      );

      try {
        await this.sentMessagePersistenceService.persistSentMessage({
          sendResult,
          subject: graph.subject,
          body: graph.body,
          recipients: { to: [graph.recipientEmail], cc: [], bcc: [] },
          connectedAccount: graph.connectedAccount,
          messageChannelId: graph.messageChannelId,
          inReplyTo: graph.inReplyTo ?? undefined,
          parentThreadExternalId: graph.providerThreadExternalId ?? undefined,
          workspaceId: context.workspaceId,
        });
      } catch {
        // The accepted receipt remains replayable without provider submission.
      }

      try {
        await this.projector.projectReceipt(reservation.receipt.id);
      } catch {
        // Reconciliation can replay this provider-free projection.
      }

      return { success: true, message: 'Outreach email accepted.' };
    } catch {
      return {
        success: false,
        message: 'Outreach email could not be authorized.',
        error: 'Outreach email could not be authorized.',
      };
    }
  }

  private async handleExistingReceipt(receipt: {
    id: string;
    state: string;
  }): Promise<ToolOutput> {
    if (receipt.state === ActionExecutionReceiptState.PROVIDER_ACCEPTED) {
      try {
        await this.projector.projectReceipt(receipt.id);
      } catch {
        return {
          success: false,
          message: 'Outreach email could not be finalized.',
        };
      }

      return { success: true, message: 'Outreach email accepted.' };
    }

    if (receipt.state === ActionExecutionReceiptState.SENT) {
      return { success: true, message: 'Outreach email accepted.' };
    }

    return {
      success: false,
      message: 'Outreach email has already been processed and was not retried.',
    };
  }

  private async recordProviderFailure(
    receiptId: string,
    error: unknown,
  ): Promise<ToolOutput> {
    const outcome = classifyMessageOutboundError(error);

    await this.actionApprovalService.recordProviderTerminalState({
      receiptId,
      state:
        outcome.kind === 'rejected'
          ? ActionExecutionReceiptState.FAILED
          : ActionExecutionReceiptState.UNKNOWN,
      code: outcome.kind === 'rejected' ? 'failed' : 'unknown',
    });

    return {
      success: false,
      message: 'Outreach email was not sent.',
    };
  }
}
