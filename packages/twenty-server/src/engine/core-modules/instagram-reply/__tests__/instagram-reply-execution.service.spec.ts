import { createHash } from 'crypto';
import { FieldActorSource } from 'twenty-shared/types';

import {
  InstagramReplyExecutionError,
  InstagramReplyExecutionService,
} from 'src/engine/core-modules/instagram-reply/services/instagram-reply-execution.service';
import { InstagramReplyExecutionState } from 'src/engine/core-modules/instagram-reply/entities/instagram-reply-execution-receipt.entity';

const workspaceId = '7c36727d-117e-491b-8676-14e31daf610f';
const replyText = 'Thank you for your message.';

const createApprovalRequest = (previewText = replyText) => ({
  connectedAccountId: 'ca_instagram_123',
  draftId: '9b05e648-d3f0d-4fd7-8e4e-bc6a31b980ea',
  conversationId: 'd81e9de7-899e-4259-ae1e-e2770b405f4b',
  providerConversationId: 'provider-conversation-id',
  recipientIgsid: 'igsid-123',
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
    getActiveInstagramAccount: jest.fn().mockResolvedValue({
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
      myahComposioService.getActiveInstagramAccount,
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

  it('rejects a conversation retargeted after approval before provider I/O', async () => {
    const { service, query, myahComposioService } = createService();
    query
      .mockResolvedValueOnce([
        { id: 'draft-id', body: replyText, sentAt: null },
      ])
      .mockResolvedValueOnce([
        {
          id: 'conversation-id',
          providerConversationId: 'different-provider-conversation-id',
          recipientIgsid: 'different-igsid',
        },
      ]);

    await expect(
      service.execute({
        workspaceId,
        approvalRequest: createApprovalRequest() as never,
      }),
    ).rejects.toMatchObject<Partial<InstagramReplyExecutionError>>({
      code: 'APPROVAL_BINDING_MISMATCH',
    });

    expect(
      myahComposioService.getActiveInstagramAccount,
    ).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce([[{ id: 'draft-id' }], 1])
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
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://backend.composio.dev/api/v3.1/tools/execute/INSTAGRAM_LIST_ALL_MESSAGES',
      expect.objectContaining({
        body: JSON.stringify({
          connected_account_id: 'ca_instagram_123',
          user_id: `workspace:${workspaceId}:instagram`,
          arguments: {
            conversation_id: 'provider-conversation-id',
            limit: 25,
          },
        }),
      }),
    );
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://backend.composio.dev/api/v3.1/tools/execute/INSTAGRAM_SEND_TEXT_MESSAGE',
      expect.objectContaining({
        body: JSON.stringify({
          connected_account_id: 'ca_instagram_123',
          user_id: `workspace:${workspaceId}:instagram`,
          arguments: {
            recipient_id: 'igsid-123',
            text: replyText,
          },
        }),
      }),
    );
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('"createdBySource"'),
      [
        expect.any(String),
        replyText,
        'provider-message-id',
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
        FieldActorSource.SYSTEM,
        null,
        'System',
        {},
      ],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('does not persist a sent draft when a successful provider response has no message identifier', async () => {
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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { data: [{ from: { id: 'igsid-123' }, direction: 'INBOUND' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { accepted: true } }),
      });

    await expect(
      service.execute({
        workspaceId,
        approvalRequest: createApprovalRequest() as never,
      }),
    ).rejects.toMatchObject<Partial<InstagramReplyExecutionError>>({
      message:
        'Instagram provider delivery status is unknown; the draft was not marked sent.',
      state: InstagramReplyExecutionState.UNKNOWN,
      code: 'PROVIDER_MESSAGE_ID_MISSING',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(2);
    expect(
      query.mock.calls.some(
        ([sql]) =>
          typeof sql === 'string' && sql.includes(`SET "status" = 'SENT'`),
      ),
    ).toBe(false);
  });

  it('does not disclose structured provider error text containing credentials', async () => {
    const providerSecret = 'super-secret-provider-token';
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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { data: [{ from: { id: 'igsid-123' }, direction: 'INBOUND' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            message: `Provider error: {"access_token":"${providerSecret}"}`,
          },
        }),
      });

    let thrownError: unknown;

    try {
      await service.execute({
        workspaceId,
        approvalRequest: createApprovalRequest() as never,
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(InstagramReplyExecutionError);
    expect(thrownError).toMatchObject<Partial<InstagramReplyExecutionError>>({
      message: 'Instagram provider request failed.',
      state: InstagramReplyExecutionState.FAILED,
      code: 'PROVIDER_REQUEST_FAILED',
    });
    expect((thrownError as Error).message).not.toContain(providerSecret);
    expect((thrownError as InstagramReplyExecutionError).code).not.toContain(
      providerSecret,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps a recognized messaging-window provider failure blocked', async () => {
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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { data: [{ from: { id: 'igsid-123' }, direction: 'INBOUND' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            error_subcode: '2534022',
            message: 'Messaging window closed',
          },
        }),
      });

    await expect(
      service.execute({
        workspaceId,
        approvalRequest: createApprovalRequest() as never,
      }),
    ).rejects.toMatchObject<Partial<InstagramReplyExecutionError>>({
      message: 'Instagram provider request failed.',
      state: InstagramReplyExecutionState.BLOCKED,
      code: '2534022',
    });

    expect(query).toHaveBeenCalledTimes(2);
  });
});
