import { Logger } from '@nestjs/common';

import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { type SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { ImapClientProvider } from 'src/modules/messaging/message-import-manager/drivers/imap/providers/imap-client.provider';
import { SmtpClientProvider } from 'src/modules/messaging/message-import-manager/drivers/smtp/providers/smtp-client.provider';

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('workspace mailbox runtime transport security', () => {
  const imapParams = {
    connectionSecurity: EmailConnectionSecurity.STARTTLS,
    host: 'imap.example.com',
    password: 'workspace-secret' as PlaintextString,
    port: 143,
    username: 'outreach@example.com',
  };
  const smtpParams = {
    connectionSecurity: EmailConnectionSecurity.STARTTLS,
    host: 'smtp.example.com',
    password: 'workspace-secret' as PlaintextString,
    port: 587,
    username: 'outreach@example.com',
  };
  const myahAccount = {
    connectionParameters: {
      IMAP: { encrypted: 'imap' },
      SMTP: { encrypted: 'smtp' },
    },
    handle: 'outreach@example.com',
    id: 'account-id',
    name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
    provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
    visibility: 'workspace',
    workspaceId: 'workspace-id',
  } as unknown as ConnectedAccountEntity;
  const repository = {
    findOne: jest.fn().mockResolvedValue(myahAccount),
  };
  const secureHttpClientService = {
    getValidatedHost: jest.fn(async (host: string) =>
      host.startsWith('imap') ? '203.0.113.10' : '203.0.113.11',
    ),
  };
  const encryptionService = {
    decryptProtocolPassword: jest.fn(
      ({ protocolParams }: { protocolParams: unknown }) =>
        protocolParams === myahAccount.connectionParameters?.IMAP
          ? imapParams
          : smtpParams,
    ),
  };
  const mockImapConnect = jest.fn().mockResolvedValue(undefined);
  const mockImapLogout = jest.fn().mockResolvedValue(undefined);
  const mockImapOn = jest.fn();
  const imapClientProvider = new ImapClientProvider(
    secureHttpClientService as unknown as SecureHttpClientService,
    encryptionService as unknown as ConnectedAccountTokenEncryptionService,
    repository as unknown as Repository<ConnectedAccountEntity>,
  );
  const smtpClientProvider = new SmtpClientProvider(
    secureHttpClientService as unknown as SecureHttpClientService,
    encryptionService as unknown as ConnectedAccountTokenEncryptionService,
    repository as unknown as Repository<ConnectedAccountEntity>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue(myahAccount);
    (ImapFlow as unknown as jest.Mock).mockImplementation(() => ({
      connect: mockImapConnect,
      logout: mockImapLogout,
      on: mockImapOn,
    }));
    mockImapConnect.mockResolvedValue(undefined);
    (createTransport as jest.Mock).mockReturnValue({});
  });

  it('enforces certificate verification and STARTTLS for Myah runtime clients', async () => {
    await imapClientProvider.getClient(myahAccount.id);
    await smtpClientProvider.getClient(myahAccount.id);

    expect(ImapFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        doSTARTTLS: true,
        host: '203.0.113.10',
        secure: false,
        tls: {
          rejectUnauthorized: true,
          servername: 'imap.example.com',
        },
      }),
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '203.0.113.11',
        requireTLS: true,
        secure: false,
        tls: {
          rejectUnauthorized: true,
          servername: 'smtp.example.com',
        },
      }),
    );
  });

  it('preserves legacy personal-account TLS behavior', async () => {
    repository.findOne.mockResolvedValue({
      ...myahAccount,
      name: 'Personal account',
      visibility: 'user',
    } as ConnectedAccountEntity);

    await imapClientProvider.getClient(myahAccount.id);
    await smtpClientProvider.getClient(myahAccount.id);

    expect(ImapFlow).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: false } }),
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ tls: { rejectUnauthorized: false } }),
    );
  });

  it('redacts Myah IMAP connection failures from logs', async () => {
    const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error');

    mockImapConnect.mockRejectedValue(
      new Error('provider echoed workspace-secret from internal-host'),
    );

    const error = (await imapClientProvider
      .getClient(myahAccount.id)
      .catch((caughtError) => caughtError)) as Error & { cause?: unknown };
    const serializedError = JSON.stringify({
      cause: error.cause,
      message: error.message,
      stack: error.stack,
    });
    const serializedLogs = JSON.stringify(loggerErrorSpy.mock.calls);

    expect(serializedLogs).not.toContain('outreach@example.com');
    expect(serializedLogs).not.toContain('workspace-secret');
    expect(serializedLogs).not.toContain('internal-host');
    expect(serializedError).not.toContain('workspace-secret');
    expect(serializedError).not.toContain('internal-host');
  });

  it('redacts Myah IMAP logout failures from logs', async () => {
    const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error');
    const client = await imapClientProvider.getClient(myahAccount.id);

    mockImapLogout.mockRejectedValue(
      new Error('logout echoed workspace-secret from internal-host'),
    );

    await imapClientProvider.closeClient(client);

    const serializedLogs = JSON.stringify(loggerErrorSpy.mock.calls);

    expect(serializedLogs).not.toContain('workspace-secret');
    expect(serializedLogs).not.toContain('internal-host');
  });
});
