import { Test, type TestingModule } from '@nestjs/testing';

import { RetryHandlerOptions } from '@microsoft/microsoft-graph-client';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { MicrosoftOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/microsoft/microsoft-oauth2-client.provider';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import { MicrosoftMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/microsoft/services/microsoft-message-outbound.service';

// These tests exercise only provider dispatch and the connected-account ID.
const buildConnectedAccount = (): ConnectedAccountEntity =>
  ({
    id: 'connected-account-id',
    provider: ConnectedAccountProvider.MICROSOFT,
  }) as unknown as ConnectedAccountEntity;

describe('MicrosoftMessageOutboundService', () => {
  let service: MicrosoftMessageOutboundService;
  let mockGetClient: jest.Mock;

  const messagesRequest = {
    options: jest.fn().mockReturnThis(),
    middlewareOptions: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    top: jest.fn().mockReturnThis(),
    get: jest.fn(),
    post: jest.fn(),
  };

  const replyRequest = {
    options: jest.fn().mockReturnThis(),
    middlewareOptions: jest.fn().mockReturnThis(),
    post: jest.fn(),
  };

  const draftRequest = {
    options: jest.fn().mockReturnThis(),
    middlewareOptions: jest.fn().mockReturnThis(),
    patch: jest.fn(),
  };

  const sendRequest = {
    options: jest.fn().mockReturnThis(),
    middlewareOptions: jest.fn().mockReturnThis(),
    post: jest.fn(),
  };

  const draftDeleteRequest = {
    options: jest.fn().mockReturnThis(),
    middlewareOptions: jest.fn().mockReturnThis(),
    delete: jest.fn(),
  };

  const profileRequest = {
    options: jest.fn().mockReturnThis(),
    middlewareOptions: jest.fn().mockReturnThis(),
    get: jest.fn(),
  };

  const mockMicrosoftClient = {
    api: jest.fn((path: string) => {
      switch (path) {
        case '/me':
          return profileRequest;
        case '/me/messages':
          return messagesRequest;
        case '/me/messages/parent-message-id/createReply':
          return replyRequest;
        case '/me/messages/reply-draft-id':
          return draftRequest;
        case '/me/messages/draft-id':
          return draftDeleteRequest;
        case '/me/messages/draft-id/send':
          return sendRequest;
        default:
          throw new Error(`Unexpected Microsoft Graph path: ${path}`);
      }
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetClient = jest.fn().mockResolvedValue(mockMicrosoftClient);

    messagesRequest.filter.mockReturnThis();
    messagesRequest.select.mockReturnThis();
    messagesRequest.top.mockReturnThis();
    messagesRequest.get.mockResolvedValue({
      value: [{ id: 'parent-message-id' }],
    });
    messagesRequest.post.mockResolvedValue({
      id: 'draft-id',
      internetMessageId: '<draft@example.com>',
      conversationId: 'conversation-id',
    });
    replyRequest.post.mockResolvedValue({
      id: 'reply-draft-id',
      internetMessageId: '<reply@example.com>',
      conversationId: 'conversation-id',
    });
    draftRequest.patch.mockResolvedValue({
      id: 'reply-draft-id',
      internetMessageId: '<patched-reply@example.com>',
      conversationId: 'conversation-id',
    });
    sendRequest.post.mockResolvedValue(undefined);
    draftDeleteRequest.delete.mockResolvedValue(undefined);
    profileRequest.get.mockResolvedValue({ id: 'profile-id' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicrosoftMessageOutboundService,
        {
          provide: MicrosoftOAuth2ClientProvider,
          useValue: {
            getClient: mockGetClient,
          },
        },
      ],
    }).compile();

    service = module.get<MicrosoftMessageOutboundService>(
      MicrosoftMessageOutboundService,
    );
  });

  it('preflights Microsoft credentials without creating a draft', async () => {
    await service.assertSendable(buildConnectedAccount());

    expect(mockMicrosoftClient.api).toHaveBeenCalledWith('/me');
    expect(profileRequest.get).toHaveBeenCalledTimes(1);
    expect(messagesRequest.post).not.toHaveBeenCalled();
  });

  it('rejects stalled authentication at the absolute deadline and fences a late client', async () => {
    jest.useFakeTimers();
    let resolveClient:
      | ((client: typeof mockMicrosoftClient) => void)
      | undefined;

    mockGetClient.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClient = resolve;
      }),
    );

    const resultPromise = service.sendMessage(
      {
        to: 'recipient@example.com',
        subject: 'Subject',
        body: 'Body',
        html: '<p>Body</p>',
        attachments: [],
      },
      buildConnectedAccount(),
    );

    const rejection = expect(resultPromise).rejects.toThrow(/exceeded 30000ms/);

    await jest.advanceTimersByTimeAsync(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    );
    await rejection;

    resolveClient?.(mockMicrosoftClient);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockMicrosoftClient.api).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('creates Microsoft drafts as replies when a parent internet message id is provided', async () => {
    const connectedAccount = buildConnectedAccount();
    const result = await service.createDraft(
      {
        to: 'recipient@example.com',
        subject: 'Re: Existing thread',
        body: 'Plain text',
        html: '<p>HTML content</p>',
        attachments: [],
        inReplyTo: "<parent's-message@example.com>",
      },
      connectedAccount,
    );

    expect(mockMicrosoftClient.api).toHaveBeenCalledWith('/me/messages');
    expect(messagesRequest.filter).toHaveBeenCalledWith(
      "internetMessageId eq '<parent''s-message@example.com>'",
    );
    expect(messagesRequest.select).toHaveBeenCalledWith('id');
    expect(messagesRequest.top).toHaveBeenCalledWith(1);
    const sharedSignal = mockGetClient.mock.calls[0][1]
      .abortSignal as AbortSignal;

    expect(messagesRequest.options).toHaveBeenCalledWith({
      signal: sharedSignal,
    });
    expect(replyRequest.options).toHaveBeenCalledWith({
      signal: sharedSignal,
    });
    expect(draftRequest.options).toHaveBeenCalledWith({
      signal: sharedSignal,
    });
    const [middlewareOptions] = messagesRequest.middlewareOptions.mock.calls[0];

    expect(middlewareOptions).toHaveLength(1);
    expect(middlewareOptions[0]).toBeInstanceOf(RetryHandlerOptions);
    expect(middlewareOptions[0].maxRetries).toBe(0);
    expect(service.providerRequestTimeoutMs).toBe(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    );

    expect(mockMicrosoftClient.api).toHaveBeenCalledWith(
      '/me/messages/parent-message-id/createReply',
    );
    expect(replyRequest.post).toHaveBeenCalledWith({});

    expect(mockMicrosoftClient.api).toHaveBeenCalledWith(
      '/me/messages/reply-draft-id',
    );
    expect(draftRequest.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Re: Existing thread',
        body: {
          contentType: 'HTML',
          content: '<p>HTML content</p>',
        },
      }),
    );
    expect(messagesRequest.post).not.toHaveBeenCalled();

    expect(result).toEqual({
      headerMessageId: '<patched-reply@example.com>',
      draftExternalId: 'reply-draft-id',
      threadExternalId: 'conversation-id',
    });
  });

  it('rejects a Microsoft draft without a durable message id', async () => {
    messagesRequest.post.mockResolvedValueOnce({
      internetMessageId: '<draft@example.com>',
    });

    await expect(
      service.createDraft(
        {
          to: 'recipient@example.com',
          subject: 'Subject',
          body: 'Body',
          html: '<p>Body</p>',
          attachments: [],
        },
        buildConnectedAccount(),
      ),
    ).rejects.toThrow('Microsoft draft did not return a message id');
  });

  it('rejects a Microsoft draft without an internet message id', async () => {
    messagesRequest.post.mockResolvedValueOnce({ id: 'draft-id' });

    await expect(
      service.createDraft(
        {
          to: 'recipient@example.com',
          subject: 'Subject',
          body: 'Body',
          html: '<p>Body</p>',
          attachments: [],
        },
        buildConnectedAccount(),
      ),
    ).rejects.toThrow('Microsoft draft did not return an internet message id');
  });

  it('deletes only the supplied Microsoft draft identity', async () => {
    const connectedAccount = buildConnectedAccount();

    await service.deleteDraft('draft-id', connectedAccount);

    expect(mockMicrosoftClient.api).toHaveBeenCalledWith(
      '/me/messages/draft-id',
    );
    expect(draftDeleteRequest.delete).toHaveBeenCalledTimes(1);
  });

  it('sends caller-supplied content before deleting the provider draft', async () => {
    const connectedAccount = buildConnectedAccount();
    const approvedInput = {
      to: 'recipient@example.com',
      subject: 'Approved subject',
      body: 'Approved body',
      html: '<p>Approved body</p>',
      attachments: [],
    };
    await service.sendDraft('draft-id', approvedInput, connectedAccount);

    expect(sendRequest.post).toHaveBeenCalledWith({});
    expect(draftDeleteRequest.delete).toHaveBeenCalledTimes(1);
    expect(sendRequest.post.mock.invocationCallOrder[0]).toBeLessThan(
      draftDeleteRequest.delete.mock.invocationCallOrder[0],
    );
  });
});
