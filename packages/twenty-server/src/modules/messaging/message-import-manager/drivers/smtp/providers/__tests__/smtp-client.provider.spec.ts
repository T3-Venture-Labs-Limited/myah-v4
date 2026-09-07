import { createTransport } from 'nodemailer';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { type SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { SmtpClientProvider } from 'src/modules/messaging/message-import-manager/drivers/smtp/providers/smtp-client.provider';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('SmtpClientProvider', () => {
  const connectedAccount = {
    connectionParameters: { SMTP: { encrypted: 'smtp' } },
    handle: 'sender@example.com',
    id: 'connected-account-id',
    name: 'Personal account',
    provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
    visibility: 'user',
    workspaceId: 'workspace-id',
  } as unknown as ConnectedAccountEntity;
  const repository = {
    findOne: jest.fn().mockResolvedValue(connectedAccount),
  };
  const secureHttpClientService = {
    getValidatedHost: jest.fn().mockResolvedValue('203.0.113.12'),
  };
  const encryptionService = {
    decryptProtocolPassword: jest.fn().mockReturnValue({
      connectionSecurity: EmailConnectionSecurity.STARTTLS,
      host: 'smtp.personal.example.com',
      password: 'secret' as PlaintextString,
      port: 587,
      username: 'sender@example.com',
    }),
  };
  const verify = jest.fn();
  const provider = new SmtpClientProvider(
    secureHttpClientService as unknown as SecureHttpClientService,
    encryptionService as unknown as ConnectedAccountTokenEncryptionService,
    repository as unknown as Repository<ConnectedAccountEntity>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue(connectedAccount);
    verify.mockResolvedValue(true);
    (createTransport as jest.Mock).mockReturnValue({ verify });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('configures owned-socket, phase, and inactivity safeguards for personal SMTP', async () => {
    const client = await provider.getClient(connectedAccount.id);

    await client.verify();

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        greetingTimeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        socketTimeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
        getSocket: expect.any(Function),
      }),
    );
  });

  it('rejects a pending operation at the fixed 30 second deadline', async () => {
    jest.useFakeTimers();
    verify.mockReturnValue(new Promise<never>(() => undefined));
    const client = await provider.getClient(connectedAccount.id);

    const pendingOperation = client.verify();
    const rejection = expect(pendingOperation).rejects.toThrow(
      `SMTP operation exceeded ${OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS}ms`,
    );

    await jest.advanceTimersByTimeAsync(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS - 1,
    );
    expect(verify).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);

    await rejection;
  });
});
