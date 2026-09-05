import { Injectable } from '@nestjs/common';

import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

import {
  sendInstagramReplyInputSchema,
  type SendInstagramReplyInput,
} from './instagram-reply-tool.schema';

@Injectable()
export class SendInstagramReplyTool implements Tool {
  description =
    'Send exactly one bound, user-approved reply through the active Unipile Instagram account. Never use it for a first-contact DM.';
  inputSchema = sendInstagramReplyInputSchema;

  constructor(
    private readonly instagramMessageSendService: InstagramMessageSendService,
  ) {}

  async execute(
    parameters: SendInstagramReplyInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const parsedInput = sendInstagramReplyInputSchema.safeParse(parameters);
    if (
      !parsedInput.success ||
      !context.userWorkspaceId ||
      !context.threadId ||
      !context.rolePermissionConfig
    ) {
      return {
        success: false,
        message: 'Instagram reply could not be authorized.',
        error:
          'An authenticated chat thread, current role permissions, and an approval binding are required to send an Instagram reply.',
      };
    }

    try {
      const result = await this.instagramMessageSendService.executeApproved({
        workspaceId: context.workspaceId,
        initiatorUserWorkspaceId: context.userWorkspaceId,
        approvalBindingId: parsedInput.data.actionApprovalBindingId,
        threadId: context.threadId,
        interactionContextType: null,
        interactionContextId: null,
        rolePermissionConfig: context.rolePermissionConfig,
      });

      return result.status === 'SENT' || result.status === 'PROVIDER_ACCEPTED'
        ? { success: true, message: 'Instagram reply accepted.', result }
        : {
            success: false,
            message:
              'Instagram reply has been processed and was not automatically retried.',
            result,
          };
    } catch {
      return {
        success: false,
        message: 'Instagram reply could not be authorized.',
        error: 'Instagram reply could not be authorized.',
      };
    }
  }
}
