import { createHash } from 'crypto';

import {
  createRequestInstagramReplyApprovalTool,
  requestInstagramReplyApprovalInputSchema,
} from 'src/engine/metadata-modules/ai/ai-chat/tools/request-instagram-reply-approval.tool';

const input = {
  connectedAccountId: 'ca_instagram_123',
  conversationId: 'd81e9de7-899e-4259-ae1e-e2770b405f4b',
  draftId: '9b05e648-d3f0-4fd7-8e4e-bc6a31b980ea',
};
const buildTool = () => {
  const instagramReplyDraftService = {
    getApprovalDetails: jest.fn().mockResolvedValue({
      body: 'How\'s it going over there? "All good", I hope.',
      conversationLabel: 'wakozaco',
      draftLabel: 'Reply to wakozaco',
      providerConversationId: 'provider-conversation-id',
      recipientIgsid: 'igsid-123',
    }),
  };
  const instagramReplyApprovalService = {
    createPendingApproval: jest.fn().mockResolvedValue({
      approvalId: '6d5aed18-6694-4f89-8cd4-95ed9d009cfe',
    }),
  };

  return {
    instagramReplyDraftService,
    instagramReplyApprovalService,
    tool: createRequestInstagramReplyApprovalTool({
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
      threadId: 'thread-id',
      instagramReplyDraftService: instagramReplyDraftService as never,
      instagramReplyApprovalService: instagramReplyApprovalService as never,
    }),
  };
};

describe('request_instagram_reply_approval tool', () => {
  it('accepts only opaque Instagram reply identifiers', () => {
    expect(requestInstagramReplyApprovalInputSchema.safeParse(input)).toEqual({
      success: true,
      data: input,
    });
    expect(
      requestInstagramReplyApprovalInputSchema.safeParse({
        ...input,
        preview: { format: 'text', content: 'model-generated preview' },
      }).success,
    ).toBe(false);
  });

  it('creates a pending server-owned approval and derives its card from the stored draft', async () => {
    const { tool, instagramReplyDraftService, instagramReplyApprovalService } =
      buildTool();

    const output = await tool.execute(input);

    expect(instagramReplyDraftService.getApprovalDetails).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      ...input,
    });
    expect(
      instagramReplyApprovalService.createPendingApproval,
    ).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
      threadId: 'thread-id',
      toolName: 'send_instagram_reply',
      ...input,
      providerConversationId: 'provider-conversation-id',
      recipientIgsid: 'igsid-123',
      previewTextSha256: createHash('sha256')
        .update('How\'s it going over there? "All good", I hope.')
        .digest('hex'),
    });
    expect(output).toEqual({
      success: true,
      message:
        'Instagram reply approval presented to the user; awaiting their decision.',
      result: {
        approvalId: '6d5aed18-6694-4f89-8cd4-95ed9d009cfe',
        request: {
          title: 'Review Instagram reply to wakozaco',
          summary: 'Review the prepared Instagram reply before it is sent.',
          actionKind: 'external_write',
          riskLevel: 'medium',
          toolName: 'send_instagram_reply',
          targetLabel: 'wakozaco',
          affectedRecords: [
            {
              objectNameSingular: 'myahInstagramReplyDraft',
              recordId: input.draftId,
              label: 'Reply to wakozaco',
            },
          ],
          preview: {
            format: 'text',
            content: 'How\'s it going over there? "All good", I hope.',
          },
          consequences: [
            'This will send the shown reply to wakozaco on Instagram.',
            'An Instagram message cannot be unsent after delivery.',
          ],
          options: { allowRequestChanges: true },
        },
        status: 'pending',
      },
    });
  });
});
