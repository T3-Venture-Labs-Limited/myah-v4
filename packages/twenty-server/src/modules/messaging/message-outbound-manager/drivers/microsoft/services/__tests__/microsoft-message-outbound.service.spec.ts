import { Test, type TestingModule } from '@nestjs/testing';

import { ConnectedAccountProvider } from 'twenty-shared/types';

import { MicrosoftOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/microsoft/microsoft-oauth2-client.provider';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MicrosoftMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/microsoft/services/microsoft-message-outbound.service';

// These tests exercise only provider dispatch and the connected-account ID.
const buildConnectedAccount = (): ConnectedAccountEntity =>
  ({
    id: 'connected-account-id',
    provider: ConnectedAccountProvider.MICROSOFT,
  }) as unknown as ConnectedAccountEntity;

describe('MicrosoftMessageOutboundService', () => {
  let service: MicrosoftMessageOutboundService;

  const messagesRequest = {
    filter: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    top: jest.fn().mockReturnThis(),
    get: jest.fn(),
    post: jest.fn(),
  };

  const replyRequest = {
    post: jest.fn(),
  };

  const draftRequest = {
    patch: jest.fn(),
  };

  const draftDeleteRequest = {
    delete: jest.fn(),
  };

  const mockMicrosoftClient = {
    api: jest.fn((path: string) => {
      switch (path) {
        case '/me/messages':
          return messagesRequest;
        case '/me/messages/parent-message-id/createReply':
          return replyRequest;
        case '/me/messages/reply-draft-id':
          return draftRequest;
        case '/me/messages/draft-id':
          return draftDeleteRequest;
        default:
          throw new Error(`Unexpected Microsoft Graph path: ${path}`);
      }
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
    draftDeleteRequest.delete.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicrosoftMessageOutboundService,
        {
          provide: MicrosoftOAuth2ClientProvider,
          useValue: {
            getClient: jest.fn().mockResolvedValue(mockMicrosoftClient),
          },
        },
      ],
    }).compile();

    service = module.get<MicrosoftMessageOutboundService>(
      MicrosoftMessageOutboundService,
    );
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
    const sendMessage = jest
      .spyOn(service, 'sendMessage')
      .mockResolvedValue({ headerMessageId: '<sent@example.com>' });
    const deleteDraft = jest
      .spyOn(service, 'deleteDraft')
      .mockResolvedValue(undefined);

    await service.sendDraft('draft-id', approvedInput, connectedAccount);

    expect(sendMessage).toHaveBeenCalledWith(approvedInput, connectedAccount);
    expect(deleteDraft).toHaveBeenCalledWith('draft-id', connectedAccount);
  });
});
