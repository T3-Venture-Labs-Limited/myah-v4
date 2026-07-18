import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { InstagramReplyDraftService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-draft.service';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

export const PREPARE_INSTAGRAM_REPLY_DRAFT_TOOL_NAME =
  'prepare_instagram_reply_draft';

const PrepareInstagramReplyDraftInputZodSchema = z.object({
  connectedAccountId: z.string().trim().min(1),
  providerConversationId: z.string().trim().min(1),
  recipientIgsid: z.string().trim().min(1),
  inboundMessageId: z.string().trim().min(1),
  recipientLabel: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

type PrepareInstagramReplyDraftToolInput = z.infer<
  typeof PrepareInstagramReplyDraftInputZodSchema
>;

@Injectable()
export class PrepareInstagramReplyDraftTool implements Tool {
  description =
    'Prepare one local Instagram reply draft from an existing live-read conversation. ' +
    'It verifies and persists the specified inbound provider message before creating the reviewable draft; it never sends a message. ' +
    'Use the returned account, conversation, draft IDs, and exact body to request approval.';
  inputSchema = PrepareInstagramReplyDraftInputZodSchema;

  constructor(
    private readonly instagramReplyDraftService: InstagramReplyDraftService,
  ) {}

  async execute(
    parameters: PrepareInstagramReplyDraftToolInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    if (!context.userWorkspaceId || !context.threadId) {
      return {
        success: false,
        message: 'Instagram reply draft could not be prepared.',
        error:
          'An authenticated chat thread is required to prepare an Instagram reply draft.',
      };
    }

    try {
      const result = await this.instagramReplyDraftService.prepare({
        workspaceId: context.workspaceId,
        userWorkspaceId: context.userWorkspaceId,
        ...parameters,
      });

      return {
        success: true,
        message: 'Instagram reply draft prepared for approval.',
        result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Instagram reply draft could not be prepared.',
        error:
          error instanceof Error
            ? error.message
            : 'Instagram reply draft could not be prepared.',
      };
    }
  }
}
