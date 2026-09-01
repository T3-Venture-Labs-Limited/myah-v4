import { Logger } from '@nestjs/common';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { type MessageFolderEntity } from 'src/engine/metadata-modules/message-folder/entities/message-folder.entity';
import { type ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { type ImapFindDraftsFolderService } from 'src/modules/messaging/message-import-manager/drivers/imap/services/imap-find-drafts-folder.service';
import { type SmtpClientProvider } from 'src/modules/messaging/message-import-manager/drivers/smtp/providers/smtp-client.provider';
import { ImapSmtpMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/imap/services/imap-smtp-message-outbound.service';

const MOCKED_EMAIL_BUFFER = Buffer.from(
  'Message-ID: <compiled-draft@example.com>\r\n\r\nmocked-email-content',
);

jest.mock('nodemailer/lib/mail-composer', () => {
  return jest.fn().mockImplementation(() => ({
    compile: jest.fn().mockReturnValue({
      build: jest.fn().mockResolvedValue(MOCKED_EMAIL_BUFFER),
    }),
  }));
});

// These tests exercise only the fields read by the IMAP outbound service.
const buildConnectedAccount = (): ConnectedAccountEntity =>
  ({
    id: 'connected-account-id',
    provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
    handle: 'sender@example.com',
    connectionParameters: { IMAP: {} },
  }) as unknown as ConnectedAccountEntity;

describe('ImapSmtpMessageOutboundService', () => {
  const releaseLock = jest.fn();
  const append = jest.fn();
  const getMailboxLock = jest.fn().mockResolvedValue({ release: releaseLock });
  const messageDelete = jest.fn();
  const imapClient = { append, getMailboxLock, messageDelete };
  const closeClient = jest.fn();
  const imapClientProvider = {
    getClient: jest.fn().mockResolvedValue(imapClient),
    closeClient,
  } as unknown as ImapClientProvider;
  const sendMail = jest.fn();
  const smtpClientProvider = {
    getClient: jest.fn().mockResolvedValue({ sendMail }),
  } as unknown as SmtpClientProvider;
  const draftsFolderService = {
    findOrCreateDraftsFolder: jest.fn().mockResolvedValue({ path: 'Drafts' }),
  } as unknown as ImapFindDraftsFolderService;
  const messageChannelRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'message-channel-id' }),
  } as unknown as Repository<MessageChannelEntity>;
  const messageFolderRepository = {
    findOne: jest.fn().mockResolvedValue({ externalId: 'Sent:1' }),
  } as unknown as Repository<MessageFolderEntity>;

  let service: ImapSmtpMessageOutboundService;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ accepted: ['recipient@example.com'] });
    append.mockResolvedValue({ uid: 42 });
    getMailboxLock.mockResolvedValue({ release: releaseLock });
    draftsFolderService.findOrCreateDraftsFolder = jest
      .fn()
      .mockResolvedValue({ path: 'Drafts' });

    service = new ImapSmtpMessageOutboundService(
      smtpClientProvider,
      imapClientProvider,
      draftsFolderService,
      messageChannelRepository,
      messageFolderRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps SMTP acceptance when the best-effort IMAP Sent copy fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    append.mockRejectedValueOnce(new Error('IMAP append failed'));

    await expect(
      service.sendMessage(
        {
          to: 'recipient@example.com',
          subject: 'Subject',
          body: 'Body',
          html: 'Body',
          attachments: [],
        },
        buildConnectedAccount(),
      ),
    ).resolves.toEqual({
      headerMessageId: '<compiled-draft@example.com>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      cc: undefined,
      bcc: undefined,
      raw: MOCKED_EMAIL_BUFFER,
    });
    expect(closeClient).toHaveBeenCalledWith(imapClient);
    expect(warn).toHaveBeenCalledWith(
      'Failed to copy an accepted SMTP message to the IMAP Sent folder',
    );
  });

  it('returns the compiled header id and appended draft identity', async () => {
    const result = await service.createDraft(
      {
        to: 'recipient@example.com',
        subject: 'Subject',
        body: 'Body',
        html: '<p>Body</p>',
        attachments: [],
      },
      buildConnectedAccount(),
    );

    expect(append).toHaveBeenCalledWith('Drafts', MOCKED_EMAIL_BUFFER, [
      '\\Draft',
    ]);
    expect(result).toEqual({
      headerMessageId: '<compiled-draft@example.com>',
      draftExternalId: 'Drafts:42',
    });
    expect(closeClient).toHaveBeenCalledWith(imapClient);
  });

  it('rejects an IMAP draft without an append UID', async () => {
    append.mockResolvedValueOnce({});

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
    ).rejects.toThrow('IMAP draft append did not return a UID');

    expect(closeClient).toHaveBeenCalledWith(imapClient);
  });

  it('deletes only the supplied IMAP draft identity', async () => {
    const connectedAccount = buildConnectedAccount();

    await service.deleteDraft('Drafts:42', connectedAccount);

    expect(getMailboxLock).toHaveBeenCalledWith('Drafts');
    expect(messageDelete).toHaveBeenCalledWith('42', { uid: true });
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(closeClient).toHaveBeenCalledWith(imapClient);
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

    await service.sendDraft('Drafts:42', approvedInput, connectedAccount);

    expect(sendMessage).toHaveBeenCalledWith(approvedInput, connectedAccount);
    expect(deleteDraft).toHaveBeenCalledWith('Drafts:42', connectedAccount);
  });
});
