import { Injectable, Logger } from '@nestjs/common';

import {
  InstagramReplyExecutionError,
  InstagramReplyExecutionService,
} from 'src/engine/core-modules/instagram-reply/services/instagram-reply-execution.service';
import { InstagramReplyApprovalService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-approval.service';
import { InstagramReplyExecutionState } from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-execution-receipt.entity';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

import {
  InstagramReplyToolInputZodSchema,
  type InstagramReplyToolInput,
} from './instagram-reply-tool.schema';

@Injectable()
export class SendInstagramReplyTool implements Tool {
  private readonly logger = new Logger(SendInstagramReplyTool.name);

  description =
    'Send a user-approved text reply only within a provider-verified existing Instagram conversation. Never use it for a first-contact DM.';
  inputSchema = InstagramReplyToolInputZodSchema;

  constructor(
    private readonly instagramReplyApprovalService: InstagramReplyApprovalService,
    private readonly instagramReplyExecutionService: InstagramReplyExecutionService,
  ) {}

  async execute(
    parameters: InstagramReplyToolInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    if (!context.userWorkspaceId || !context.threadId) {
      return {
        success: false,
        message: 'Instagram reply could not be authorized.',
        error:
          'An authenticated chat thread is required to send an Instagram reply.',
      };
    }

    try {
      const reservation =
        await this.instagramReplyApprovalService.reserveExecution({
          workspaceId: context.workspaceId,
          userWorkspaceId: context.userWorkspaceId,
          threadId: context.threadId,
          approvalId: parameters.approvalId,
        });

      if (!reservation.created) {
        return this.toExistingReceiptOutput(reservation.receipt.state);
      }

      try {
        const result = await this.instagramReplyExecutionService.execute({
          workspaceId: context.workspaceId,
          approvalRequest: reservation.approvalRequest,
        });
        await this.instagramReplyApprovalService.finalizeExecution({
          receipt: reservation.receipt,
          state: InstagramReplyExecutionState.SENT,
          providerMessageId: result.providerMessageId,
        });

        return {
          success: true,
          message: 'Instagram reply sent.',
          result: { providerMessageId: result.providerMessageId },
        };
      } catch (error) {
        if (!(error instanceof InstagramReplyExecutionError)) {
          this.logger.error('Unexpected Instagram reply execution error');
        }

        const executionError =
          error instanceof InstagramReplyExecutionError
            ? error
            : new InstagramReplyExecutionError(
                'Instagram reply status is unknown; it was not retried.',
                InstagramReplyExecutionState.UNKNOWN,
                'UNEXPECTED_EXECUTION_ERROR',
              );

        await this.instagramReplyApprovalService.finalizeExecution({
          receipt: reservation.receipt,
          state: executionError.state,
          failureCode: executionError.code,
          failureReason: executionError.message,
        });

        return {
          success: false,
          message: 'Instagram reply was not sent.',
          error: executionError.message,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Instagram reply could not be authorized.',
        error:
          error instanceof Error
            ? error.message
            : 'Instagram reply could not be authorized.',
      };
    }
  }

  private toExistingReceiptOutput(
    state: InstagramReplyExecutionState,
  ): ToolOutput {
    if (state === InstagramReplyExecutionState.SENT) {
      return {
        success: true,
        message: 'Instagram reply was already sent.',
      };
    }

    return {
      success: false,
      message:
        'Instagram reply has already been processed and was not retried.',
    };
  }
}
