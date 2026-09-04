import { Inject, Injectable } from '@nestjs/common';

import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { type MyahInboxReplyExpectedActionBindingWithWorkspace } from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { MyahInboxReplySendOutcome } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-send.dto';
import { MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-reply-execution-service.token';
import {
  SendMyahInboxReplyInputZodSchema,
  type SendMyahInboxReplyInput,
} from 'src/engine/core-modules/tool/tools/myah-inbox-reply-tool/myah-inbox-reply-tool.schema';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import {
  type ToolOutcomeCategory,
  type ToolOutput,
} from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

type MyahInboxReplyExecutionService = {
  execute(input: {
    approvalBindingId: string;
    binding: MyahInboxReplyExpectedActionBindingWithWorkspace;
    workspaceId: string;
  }): Promise<{ receipt: { id: string; state: string } }>;
};

type SendMyahInboxReplyResult = {
  outcome: MyahInboxReplySendOutcome;
  receiptId: string | null;
  state: string | null;
};

const staleResult: SendMyahInboxReplyResult = {
  outcome: MyahInboxReplySendOutcome.STALE,
  receiptId: null,
  state: null,
};

const toOutcome = (state: string): MyahInboxReplySendOutcome => {
  switch (state) {
    case ActionExecutionReceiptState.SENT:
      return MyahInboxReplySendOutcome.SENT;
    case ActionExecutionReceiptState.FAILED:
    case ActionExecutionReceiptState.BLOCKED:
      return MyahInboxReplySendOutcome.FAILED;
    case ActionExecutionReceiptState.PROCESSING:
    case ActionExecutionReceiptState.PROVIDER_ACCEPTED:
      return MyahInboxReplySendOutcome.SENDING;
    case ActionExecutionReceiptState.UNKNOWN:
    default:
      return MyahInboxReplySendOutcome.UNKNOWN;
  }
};

const toCategory = (state: string): ToolOutcomeCategory => {
  switch (state) {
    case ActionExecutionReceiptState.SENT:
      return 'SUCCESS';
    case ActionExecutionReceiptState.PROCESSING:
    case ActionExecutionReceiptState.PROVIDER_ACCEPTED:
      return 'PENDING';
    case ActionExecutionReceiptState.UNKNOWN:
      return 'UNKNOWN';
    case ActionExecutionReceiptState.FAILED:
    case ActionExecutionReceiptState.BLOCKED:
    default:
      return 'FAILED';
  }
};

export const SEND_MYAH_INBOX_REPLY_TOOL_NAME = 'send_myah_inbox_reply';

@Injectable()
export class SendMyahInboxReplyTool implements Tool {
  description =
    'Send exactly one server-derived Inbox reply after its registered approval is revalidated.';
  inputSchema = SendMyahInboxReplyInputZodSchema;

  constructor(
    private readonly actionApprovalService: ActionApprovalService,
    @Inject(MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN)
    private readonly approvedExecutionService: MyahInboxReplyExecutionService,
  ) {}

  async execute(
    parameters: SendMyahInboxReplyInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const parsedInput = SendMyahInboxReplyInputZodSchema.safeParse(parameters);

    if (!parsedInput.success || !context.userWorkspaceId || !context.threadId) {
      return {
        success: false,
        category: 'CONFLICT',
        message: 'Inbox reply could not be authorized.',
        error: 'CONFLICT',
        result: staleResult,
      };
    }
    try {
      const binding = await this.actionApprovalService.getApprovedBinding({
        workspaceId: context.workspaceId,
        approvalBindingId: parsedInput.data.actionApprovalBindingId,
        initiatorUserWorkspaceId: context.userWorkspaceId,
        threadId: context.threadId,
      });
      if (binding.actionName !== 'send_inbox_reply') {
        throw new Error('An approved Inbox reply binding is required');
      }
      const result = await this.approvedExecutionService.execute({
        approvalBindingId: parsedInput.data.actionApprovalBindingId,
        binding,
        workspaceId: context.workspaceId,
      });

      const sendResult: SendMyahInboxReplyResult = {
        outcome: toOutcome(result.receipt.state),
        receiptId: result.receipt.id,
        state: result.receipt.state,
      };

      const wasAccepted =
        result.receipt.state === ActionExecutionReceiptState.SENT ||
        result.receipt.state === ActionExecutionReceiptState.PROVIDER_ACCEPTED;

      return {
        success: wasAccepted,
        category: toCategory(result.receipt.state),
        message: wasAccepted
          ? 'Inbox reply accepted.'
          : 'Inbox reply was not sent.',
        result: sendResult,
      };
    } catch {
      return {
        success: false,
        category: 'NOT_FOUND',
        message: 'Inbox reply could not be authorized.',
        error: 'NOT_FOUND',
        result: staleResult,
      };
    }
  }
}
