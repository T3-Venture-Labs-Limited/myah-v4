import { PrepareInstagramReplyDraftTool } from 'src/engine/core-modules/tool/tools/instagram-tool/prepare-instagram-reply-draft-tool';

const input = {
  connectedAccountId: 'ca_instagram_123',
  providerConversationId: 'provider-conversation-id',
  recipientIgsid: 'recipient-igsid',
  recipientLabel: '@wakozaco',
  body: 'Thanks for reaching out.',
};

const buildTool = () => {
  const instagramReplyDraftService = {
    prepare: jest.fn().mockResolvedValue({
      connectedAccountId: input.connectedAccountId,
      conversationId: '2370f3fb-5738-458c-ae4d-0bdb2c24611e',
      draftId: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b',
      body: input.body,
    }),
  };

  return {
    instagramReplyDraftService,
    tool: new PrepareInstagramReplyDraftTool(
      instagramReplyDraftService as never,
    ),
  };
};

describe('PrepareInstagramReplyDraftTool', () => {
  it('requires a member-bound chat thread before creating a local draft', async () => {
    const { tool, instagramReplyDraftService } = buildTool();

    await expect(
      tool.execute(input, {
        workspaceId: 'workspace-id',
        userWorkspaceId: 'member-id',
      }),
    ).resolves.toMatchObject({ success: false });

    expect(instagramReplyDraftService.prepare).not.toHaveBeenCalled();
  });

  it('prepares a draft without accepting caller-controlled workspace identity', async () => {
    const { tool, instagramReplyDraftService } = buildTool();

    await expect(
      tool.execute(input, {
        workspaceId: 'workspace-id',
        userWorkspaceId: 'member-id',
        threadId: 'thread-id',
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Instagram reply draft prepared for approval.',
      result: {
        connectedAccountId: input.connectedAccountId,
        conversationId: '2370f3fb-5738-458c-ae4d-0bdb2c24611e',
        draftId: 'b24f28a7-64bd-4cb8-ac5f-837536ca1d1b',
        body: input.body,
      },
    });

    expect(instagramReplyDraftService.prepare).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      userWorkspaceId: 'member-id',
      ...input,
    });
  });
});
