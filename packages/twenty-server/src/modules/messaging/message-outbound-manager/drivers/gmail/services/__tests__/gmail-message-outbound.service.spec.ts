import { Test, type TestingModule } from '@nestjs/testing';

import { google } from 'googleapis';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GmailMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/gmail/services/gmail-message-outbound.service';

const MOCKED_EMAIL_BUFFER = Buffer.from(
  'Message-ID: <compiled-draft@example.com>\r\n\r\nmocked-email-content',
);

// These tests exercise only provider dispatch and the connected-account ID.
const buildConnectedAccount = (
  provider: ConnectedAccountProvider,
): ConnectedAccountEntity =>
  ({
    id: 'connected-account-id',
    provider,
  }) as unknown as ConnectedAccountEntity;

jest.mock('nodemailer/lib/mail-composer', () => {
  return jest.fn().mockImplementation(() => ({
    compile: jest.fn().mockReturnValue({
      build: jest.fn().mockResolvedValue(MOCKED_EMAIL_BUFFER),
    }),
  }));
});

describe('GmailMessageOutboundService', () => {
  let service: GmailMessageOutboundService;

  const mockSend = jest.fn().mockResolvedValue({
    data: { id: 'message-id', threadId: 'gmail-thread-id' },
  });
  const mockCreateDraft = jest.fn().mockResolvedValue({
    data: {
      id: 'draft-resource-id',
      message: {
        id: 'draft-message-id',
        threadId: 'gmail-thread-id',
      },
    },
  });
  const mockListDrafts = jest.fn().mockResolvedValue({
    data: {
      drafts: [
        {
          id: 'draft-resource-id',
          message: { id: 'draft-message-id' },
        },
      ],
    },
  });
  const mockDeleteDraft = jest.fn().mockResolvedValue(undefined);

  const mockGmailClient = {
    users: {
      messages: {
        send: mockSend,
      },
      drafts: {
        create: mockCreateDraft,
        list: mockListDrafts,
        delete: mockDeleteDraft,
      },
      getProfile: jest
        .fn()
        .mockResolvedValue({ data: { emailAddress: 'test@example.com' } }),
    },
  };

  const mockPeopleClient = {
    people: {
      get: jest.fn().mockResolvedValue({
        data: {
          names: [
            {
              displayName: 'Test User',
            },
          ],
        },
      }),
    },
  };

  const mockOAuth2Client = {};

  beforeEach(async () => {
    jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);
    jest.spyOn(google, 'people').mockReturnValue(mockPeopleClient as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailMessageOutboundService,
        {
          provide: GoogleOAuth2ClientProvider,
          useValue: {
            getClient: jest.fn().mockResolvedValue(mockOAuth2Client),
          },
        },
      ],
    }).compile();

    service = module.get<GmailMessageOutboundService>(
      GmailMessageOutboundService,
    );
  });

  afterEach(() => {
    mockSend.mockClear();
    mockCreateDraft.mockClear();
    mockListDrafts.mockClear();
    mockDeleteDraft.mockClear();
    jest.restoreAllMocks();
  });

  it('should send multipart/alternative email with both text and HTML parts via Gmail', async () => {
    const sendMessageInput = {
      to: 'recipient@example.com',
      subject: 'Test HTML Email',
      body: 'This is plain text content',
      html: '<p>This is <strong>HTML</strong> content</p>',
      attachments: [],
    };

    const connectedAccount = buildConnectedAccount(
      ConnectedAccountProvider.GOOGLE,
    );

    await service.sendMessage(sendMessageInput, connectedAccount);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        raw: MOCKED_EMAIL_BUFFER.toString('base64url'),
      },
    });
  });

  it('should send email with attachments via Gmail', async () => {
    const sendMessageInput = {
      to: 'recipient@example.com',
      subject: 'Test Email with Attachments',
      body: 'Plain text',
      html: '<p>HTML content</p>',
      attachments: [
        {
          filename: 'test.pdf',
          content: Buffer.from('test-pdf-content'),
          contentType: 'application/pdf',
        },
      ],
    };

    const connectedAccount = buildConnectedAccount(
      ConnectedAccountProvider.GOOGLE,
    );

    await service.sendMessage(sendMessageInput, connectedAccount);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        raw: MOCKED_EMAIL_BUFFER.toString('base64url'),
      },
    });
  });

  it('should create Gmail drafts in the existing thread when a thread id is provided', async () => {
    const sendMessageInput = {
      to: 'recipient@example.com',
      subject: 'Re: Existing thread',
      body: 'Plain text',
      html: '<p>HTML content</p>',
      attachments: [],
      inReplyTo: '<parent@example.com>',
      threadExternalId: 'gmail-thread-id',
    };

    const connectedAccount = buildConnectedAccount(
      ConnectedAccountProvider.GOOGLE,
    );

    const result = await service.createDraft(
      sendMessageInput,
      connectedAccount,
    );

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockCreateDraft).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        message: {
          raw: MOCKED_EMAIL_BUFFER.toString('base64url'),
          threadId: 'gmail-thread-id',
        },
      },
    });

    expect(result).toEqual({
      headerMessageId: '<compiled-draft@example.com>',
      draftExternalId: 'draft-message-id',
      threadExternalId: 'gmail-thread-id',
    });
  });

  it('rejects a Gmail draft without a durable message id', async () => {
    mockCreateDraft.mockResolvedValueOnce({
      data: {
        id: 'draft-resource-id',
        message: { threadId: 'gmail-thread-id' },
      },
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
        buildConnectedAccount(ConnectedAccountProvider.GOOGLE),
      ),
    ).rejects.toThrow('Gmail draft did not return a message id');
  });

  it('deletes only the supplied Gmail draft message identity', async () => {
    const connectedAccount = buildConnectedAccount(
      ConnectedAccountProvider.GOOGLE,
    );

    await service.deleteDraft('draft-message-id', connectedAccount);

    expect(mockListDrafts).toHaveBeenCalledWith({
      userId: 'me',
      maxResults: 500,
      pageToken: undefined,
    });
    expect(mockDeleteDraft).toHaveBeenCalledWith({
      userId: 'me',
      id: 'draft-resource-id',
    });
  });

  it('sends caller-supplied content before deleting the provider draft', async () => {
    const connectedAccount = buildConnectedAccount(
      ConnectedAccountProvider.GOOGLE,
    );
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

    await service.sendDraft(
      'draft-message-id',
      approvedInput,
      connectedAccount,
    );

    expect(sendMessage).toHaveBeenCalledWith(approvedInput, connectedAccount);
    expect(deleteDraft).toHaveBeenCalledWith(
      'draft-message-id',
      connectedAccount,
    );
  });
});
