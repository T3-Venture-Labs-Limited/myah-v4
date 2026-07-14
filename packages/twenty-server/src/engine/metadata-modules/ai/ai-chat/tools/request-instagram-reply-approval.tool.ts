import { createHash } from 'crypto';

import { z } from 'zod';

import {
  REQUEST_INSTAGRAM_REPLY_APPROVAL_TOOL_NAME,
  type RequestApprovalToolInput,
  type RequestApprovalToolResult,
} from 'twenty-shared/ai';

import { InstagramReplyApprovalService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-approval.service';
import { InstagramReplyDraftService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-draft.service';

export { REQUEST_INSTAGRAM_REPLY_APPROVAL_TOOL_NAME };

export const requestInstagramReplyApprovalInputSchema = z
  .object({
    connectedAccountId: z.string().trim().min(1),
    conversationId: z.string().uuid(),
    draftId: z.string().uuid(),
  })
  .strict();

type RequestInstagramReplyApprovalToolInput = z.infer<
  typeof requestInstagramReplyApprovalInputSchema
>;

type RequestInstagramReplyApprovalToolOptions = {
  workspaceId: string;
  userWorkspaceId: string | undefined;
  threadId: string | undefined;
  instagramReplyDraftService: InstagramReplyDraftService;
  instagramReplyApprovalService: InstagramReplyApprovalService;
};

type RequestInstagramReplyApprovalPendingOutput = {
  success: true;
  message: string;
  result: RequestApprovalToolResult;
};

export const createRequestInstagramReplyApprovalTool = ({
  workspaceId,
  userWorkspaceId,
  threadId,
  instagramReplyDraftService,
  instagramReplyApprovalService,
}: RequestInstagramReplyApprovalToolOptions) => ({
  description:
    'Ask the user to approve one already-prepared Instagram reply. ' +
    'Call this only after prepare_instagram_reply_draft succeeds, using exactly its connectedAccountId, conversationId, and draftId. ' +
    'Do not send a title, summary, preview, message text, or consequences: the server derives the approval card from the stored draft. ' +
    'This only stages an approval; it never sends a message.',
  inputSchema: requestInstagramReplyApprovalInputSchema,
  execute: async (
    input: RequestInstagramReplyApprovalToolInput,
  ): Promise<RequestInstagramReplyApprovalPendingOutput> => {
    if (!userWorkspaceId || !threadId) {
      throw new Error(
        'An authenticated chat thread is required to request an Instagram reply approval.',
      );
    }

    const details = await instagramReplyDraftService.getApprovalDetails({
      workspaceId,
      ...input,
    });
    const approval = await instagramReplyApprovalService.createPendingApproval({
      workspaceId,
      userWorkspaceId,
      threadId,
      toolName: 'send_instagram_reply',
      ...input,
      previewTextSha256: createHash('sha256')
        .update(details.body)
        .digest('hex'),
    });
    const request: RequestApprovalToolInput = {
      title: `Review Instagram reply to ${details.conversationLabel}`,
      summary: 'Review the prepared Instagram reply before it is sent.',
      actionKind: 'external_write',
      riskLevel: 'medium',
      toolName: 'send_instagram_reply',
      targetLabel: details.conversationLabel,
      affectedRecords: [
        {
          objectNameSingular: 'myahInstagramReplyDraft',
          recordId: input.draftId,
          label: details.draftLabel,
        },
      ],
      preview: {
        format: 'text',
        content: details.body,
      },
      consequences: [
        `This will send the shown reply to ${details.conversationLabel} on Instagram.`,
        'An Instagram message cannot be unsent after delivery.',
      ],
      options: { allowRequestChanges: true },
    };

    return {
      success: true,
      message:
        'Instagram reply approval presented to the user; awaiting their decision.',
      result: {
        request,
        approvalId: approval.approvalId,
        status: 'pending',
      },
    };
  },
});
