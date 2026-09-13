import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { google } from 'googleapis';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
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
  let mockGetClient: jest.Mock;

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
    mockGetClient = jest.fn().mockResolvedValue(mockOAuth2Client);
    jest.spyOn(google, 'gmail').mockReturnValue(mockGmailClient as never);
    jest.spyOn(google, 'people').mockReturnValue(mockPeopleClient as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailMessageOutboundService,
        {
          provide: GoogleOAuth2ClientProvider,
          useValue: {
            getClient: mockGetClient,
          },
        },
      ],
    }).compile();

    service = module.get<GmailMessageOutboundService>(
      GmailMessageOutboundService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    mockSend.mockClear();
    mockCreateDraft.mockClear();
    mockListDrafts.mockClear();
    mockDeleteDraft.mockClear();
    jest.restoreAllMocks();
  });

  it('preflights Gmail credentials without creating a draft', async () => {
    await service.assertSendable(
      buildConnectedAccount(ConnectedAccountProvider.GOOGLE),
    );

    expect(mockGmailClient.users.getProfile).toHaveBeenCalledWith(
      { userId: 'me' },
      {
        signal: expect.any(AbortSignal),
        timeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        retry: false,
      },
    );
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it('rejects stalled authentication at the absolute deadline and fences a late client', async () => {
    jest.useFakeTimers();
    let resolveClient: ((client: object) => void) | undefined;

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
      buildConnectedAccount(ConnectedAccountProvider.GOOGLE),
    );

    const rejection = expect(resultPromise).rejects.toThrow(/exceeded 30000ms/);

    await jest.advanceTimersByTimeAsync(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    );
    await rejection;

    resolveClient?.(mockOAuth2Client);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGmailClient.users.getProfile).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
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

    const sharedSignal = mockGetClient.mock.calls[0][1]
      .abortSignal as AbortSignal;

    expect(mockGmailClient.users.getProfile).toHaveBeenCalledWith(
      { userId: 'me' },
      expect.objectContaining({ signal: sharedSignal }),
    );
    expect(mockPeopleClient.people.get).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: sharedSignal }),
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      {
        userId: 'me',
        requestBody: {
          raw: MOCKED_EMAIL_BUFFER.toString('base64url'),
        },
      },
      {
        signal: sharedSignal,
        timeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        retry: false,
      },
    );
    expect(service.providerRequestTimeoutMs).toBe(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    );
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
    expect(mockSend).toHaveBeenCalledWith(
      {
        userId: 'me',
        requestBody: {
          raw: MOCKED_EMAIL_BUFFER.toString('base64url'),
        },
      },
      {
        signal: expect.any(AbortSignal),
        timeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        retry: false,
      },
    );
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
    expect(mockCreateDraft).toHaveBeenCalledWith(
      {
        userId: 'me',
        requestBody: {
          message: {
            raw: MOCKED_EMAIL_BUFFER.toString('base64url'),
            threadId: 'gmail-thread-id',
          },
        },
      },
      {
        signal: expect.any(AbortSignal),
        timeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        retry: false,
      },
    );

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

    expect(mockListDrafts).toHaveBeenCalledWith(
      {
        userId: 'me',
        maxResults: 500,
        pageToken: undefined,
      },
      {
        signal: expect.any(AbortSignal),
        timeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        retry: false,
      },
    );
    expect(mockDeleteDraft).toHaveBeenCalledWith(
      {
        userId: 'me',
        id: 'draft-resource-id',
      },
      {
        signal: expect.any(AbortSignal),
        timeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        retry: false,
      },
    );
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
    await service.sendDraft(
      'draft-message-id',
      approvedInput,
      connectedAccount,
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockDeleteDraft).toHaveBeenCalledWith(
      { userId: 'me', id: 'draft-resource-id' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockSend.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteDraft.mock.invocationCallOrder[0],
    );
  });

  it('returns an accepted Gmail send when cleanup authentication reaches the original deadline', async () => {
    jest.useFakeTimers();
    const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn');
    const submissionElapsedMs = 10_000;
    let cleanupSignal: AbortSignal | undefined;
    let resolveSend:
      | ((result: { data: { id: string; threadId: string } }) => void)
      | undefined;

    mockSend.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    mockGetClient
      .mockResolvedValueOnce(mockOAuth2Client)
      .mockImplementationOnce((_connectedAccountId, options) => {
        cleanupSignal = options.abortSignal;

        return new Promise((_resolve, reject) => {
          cleanupSignal?.addEventListener(
            'abort',
            () => reject(cleanupSignal?.reason),
            { once: true },
          );
        });
      });

    const resultPromise = service.sendDraft(
      'draft-message-id',
      {
        to: 'recipient@example.com',
        subject: 'Approved subject',
        body: 'Approved body',
        html: '<p>Approved body</p>',
        attachments: [],
      },
      buildConnectedAccount(ConnectedAccountProvider.GOOGLE),
    );
    const resolution = expect(resultPromise).resolves.toEqual({
      headerMessageId: '<compiled-draft@example.com>',
      messageExternalId: 'message-id',
      threadExternalId: 'gmail-thread-id',
    });

    await jest.advanceTimersByTimeAsync(submissionElapsedMs);
    expect(mockSend).toHaveBeenCalledTimes(1);

    resolveSend?.({
      data: { id: 'message-id', threadId: 'gmail-thread-id' },
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(mockGetClient).toHaveBeenCalledTimes(2);
    expect(cleanupSignal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS - submissionElapsedMs - 1,
    );
    expect(cleanupSignal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await resolution;
    expect(cleanupSignal?.aborted).toBe(true);
    expect(mockListDrafts).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Failed to delete Gmail draft draft-message-id after send',
    );
    expect(jest.getTimerCount()).toBe(0);
  });
});
