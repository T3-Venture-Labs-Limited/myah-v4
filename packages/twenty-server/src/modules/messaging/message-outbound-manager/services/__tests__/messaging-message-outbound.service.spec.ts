import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type EmailGroupMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/email-group/services/email-group-message-outbound.service';
import { type GmailMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/gmail/services/gmail-message-outbound.service';
import { type ImapSmtpMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/imap/services/imap-smtp-message-outbound.service';
import { type MicrosoftMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/microsoft/services/microsoft-message-outbound.service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';

// These tests exercise only provider dispatch and account identity.
const buildConnectedAccount = (
  provider: ConnectedAccountProvider,
): ConnectedAccountEntity =>
  ({
    id: 'connected-account-id',
    provider,
  }) as unknown as ConnectedAccountEntity;

describe('MessagingMessageOutboundService sendability assertion', () => {
  const assertGmailSendable = jest.fn();
  const assertMicrosoftSendable = jest.fn();
  const assertImapSmtpSendable = jest.fn();
  const assertEmailGroupSendable = jest.fn();
  const service = new MessagingMessageOutboundService(
    {
      assertSendable: assertGmailSendable,
    } as unknown as GmailMessageOutboundService,
    {
      assertSendable: assertMicrosoftSendable,
    } as unknown as MicrosoftMessageOutboundService,
    {
      assertSendable: assertImapSmtpSendable,
    } as unknown as ImapSmtpMessageOutboundService,
    {
      assertSendable: assertEmailGroupSendable,
    } as unknown as EmailGroupMessageOutboundService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [ConnectedAccountProvider.GOOGLE, assertGmailSendable],
    [ConnectedAccountProvider.MICROSOFT, assertMicrosoftSendable],
    [ConnectedAccountProvider.IMAP_SMTP_CALDAV, assertImapSmtpSendable],
    [ConnectedAccountProvider.EMAIL_GROUP, assertEmailGroupSendable],
  ])(
    'preflights %s credentials through its outbound driver',
    async (provider, assertSendable) => {
      const connectedAccount = buildConnectedAccount(provider);

      await service.assertConnectedAccountSendable(connectedAccount);

      expect(assertSendable).toHaveBeenCalledWith(connectedAccount);
    },
  );

  it.each([
    ConnectedAccountProvider.APP,
    ConnectedAccountProvider.OIDC,
    ConnectedAccountProvider.SAML,
  ])('rejects unsupported provider %s', async (provider) => {
    await expect(
      service.assertConnectedAccountSendable(buildConnectedAccount(provider)),
    ).rejects.toThrow(`Provider ${provider} does not support sending messages`);
  });
});

describe('MessagingMessageOutboundService deleteDraft', () => {
  const deleteGmailDraft = jest.fn();
  const deleteMicrosoftDraft = jest.fn();
  const deleteImapDraft = jest.fn();

  const service = new MessagingMessageOutboundService(
    { deleteDraft: deleteGmailDraft } as unknown as GmailMessageOutboundService,
    {
      deleteDraft: deleteMicrosoftDraft,
    } as unknown as MicrosoftMessageOutboundService,
    {
      deleteDraft: deleteImapDraft,
    } as unknown as ImapSmtpMessageOutboundService,
    {} as EmailGroupMessageOutboundService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [ConnectedAccountProvider.GOOGLE, deleteGmailDraft],
    [ConnectedAccountProvider.MICROSOFT, deleteMicrosoftDraft],
    [ConnectedAccountProvider.IMAP_SMTP_CALDAV, deleteImapDraft],
  ])(
    'dispatches %s cleanup to only its selected driver',
    async (provider, selectedDeleteDraft) => {
      const connectedAccount = buildConnectedAccount(provider);

      await service.deleteDraft('draft-external-id', connectedAccount);

      expect(selectedDeleteDraft).toHaveBeenCalledWith(
        'draft-external-id',
        connectedAccount,
      );
      expect(
        deleteGmailDraft.mock.calls.length +
          deleteMicrosoftDraft.mock.calls.length +
          deleteImapDraft.mock.calls.length,
      ).toBe(1);
    },
  );
});
