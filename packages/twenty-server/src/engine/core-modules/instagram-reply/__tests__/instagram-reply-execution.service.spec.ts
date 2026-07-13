import { createHash } from 'crypto';

import {
  InstagramReplyExecutionError,
  InstagramReplyExecutionService,
} from 'src/engine/core-modules/instagram-reply/services/instagram-reply-execution.service';

const workspaceId = '7c36727d-117e-491b-8676-14e31daf610f';
const replyText = 'Thank you for your message.';

const createApprovalRequest = (previewText = replyText) => ({
  connectedAccountId: 'ca_instagram_123',
  draftId: '9b05e648-d3f0d-4fd7-8e4e-bc6a31b980ea',
  conversationId: 'd81e9de7-899e-4259-ae1e-e2770b405f4b',
  previewTextSha256: createHash('sha256').update(previewText).digest('hex'),
});

const createService = () => {
  const query = jest.fn();
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation(async (callback: () => Promise<unknown>) =>
        callback(),
      ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };
  const myahComposioService = {
    getExactlyOneActiveInstagramAccount: jest.fn().mockResolvedValue({
      connectedAccountId: 'ca_instagram_123',
    }),
  };

  return {
    query,
    myahComposioService,
    service: new InstagramReplyExecutionService(
      workspaceRepository as never,
      globalWorkspaceOrmManager as never,
      myahComposioService as never,
    ),
  };
};

describe('InstagramReplyExecutionService', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, COMPOSIO_API_KEY: 'cmp_test_key' };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('rejects a changed draft before consulting Composio', async () => {
    const { service, query, myahComposioService } = createService();
    query
      .mockResolvedValueOnce([
        { id: 'draft-id', body: replyText, sentAt: null },
      ])
      .mockResolvedValueOnce([
        {
          id: 'conversation-id',
          providerConversationId: 'provider-conversation-id',
          recipientIgsid: 'igsid-123',
        },
      ]);

    await expect(
      service.execute({
        workspaceId,
        approvalRequest: createApprovalRequest(
          'A different approval preview',
        ) as never,
      }),
    ).rejects.toMatchObject<Partial<InstagramReplyExecutionError>>({
      code: 'APPROVAL_BINDING_MISMATCH',
    });

    expect(
      myahComposioService.getExactlyOneActiveInstagramAccount,
    ).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an account that differs from the approved account before provider message I/O', async () => {
    const { service, query } = createService();
    query
      .mockResolvedValueOnce([
        { id: 'draft-id', body: replyText, sentAt: null },
      ])
      .mockResolvedValueOnce([
        {
          id: 'conversation-id',
          providerConversationId: 'provider-conversation-id',
          recipientIgsid: 'igsid-123',
        },
      ]);

    await expect(
      service.execute({
        workspaceId,
        approvalRequest: {
          ...createApprovalRequest(),
          connectedAccountId: 'ca_different_instagram_account',
        } as never,
      }),
    ).rejects.toMatchObject<Partial<InstagramReplyExecutionError>>({
      code: 'APPROVAL_BINDING_MISMATCH',
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not send when Composio cannot verify a matching inbound message', async () => {
    const { service, query } = createService();
    query
      .mockResolvedValueOnce([
        { id: 'draft-id', body: replyText, sentAt: null },
      ])
      .mockResolvedValueOnce([
        {
          id: 'conversation-id',
          providerConversationId: 'provider-conversation-id',
          recipientIgsid: 'igsid-123',
        },
      ]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { data: [] } }),
    });

    await expect(
      service.execute({
        workspaceId,
        approvalRequest: createApprovalRequest() as never,
      }),
    ).rejects.toMatchObject<Partial<InstagramReplyExecutionError>>({
      code: 'INBOUND_MESSAGE_NOT_VERIFIED',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends once only after provider confirmation and persists the sent draft', async () => {
    const { service, query } = createService();
    query
      .mockResolvedValueOnce([
        { id: 'draft-id', body: replyText, sentAt: null },
      ])
      .mockResolvedValueOnce([
        {
          id: 'conversation-id',
          providerConversationId: 'provider-conversation-id',
          recipientIgsid: 'igsid-123',
        },
      ])
      .mockResolvedValueOnce([{ id: 'draft-id' }])
      .mockResolvedValueOnce({});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { data: [{ from: { id: 'igsid-123' }, direction: 'INBOUND' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'provider-message-id' } }),
      });

    await expect(
      service.execute({
        workspaceId,
        approvalRequest: createApprovalRequest() as never,
      }),
    ).resolves.toEqual({ providerMessageId: 'provider-message-id' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(4);
  });
});
