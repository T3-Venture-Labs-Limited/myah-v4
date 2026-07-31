import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import { type DAVClient } from 'tsdav';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { ImapSmtpCaldavValidatorService } from 'src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection-validator.service';
import { ImapSmtpCaldavService } from 'src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service';
import {
  type ConnectionParameters,
  type PlaintextImapSmtpCaldavParams,
} from 'src/engine/core-modules/imap-smtp-caldav-connection/types/imap-smtp-caldav-connection.type';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { CalDavClientService } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/services/caldav-client.service';
import { CalDavFetchEventsService } from 'src/modules/calendar/calendar-event-import-manager/drivers/caldav/services/caldav-fetch-events.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('imapflow', () => ({
  ImapFlow: jest.fn(),
}));

describe('ImapSmtpCaldavService', () => {
  let service: ImapSmtpCaldavService;

  const mockClient = {} as DAVClient;

  const mockVerify = jest.fn().mockResolvedValue(true);
  const mockImapConnect = jest.fn().mockResolvedValue(undefined);
  const mockImapList = jest.fn().mockResolvedValue([{ path: 'INBOX' }]);
  const mockImapLogout = jest.fn().mockResolvedValue(undefined);
  const mockImapOn = jest.fn();
  const mockGetValidatedHost = jest
    .fn()
    .mockImplementation((host: string) => Promise.resolve(host));

  const mockCalDavClientService = {
    getClient: jest.fn(),
  };

  const mockCalDavFetchEventsService = {
    listEventCalendars: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (createTransport as jest.Mock).mockReturnValue({ verify: mockVerify });
    mockVerify.mockResolvedValue(true);
    (ImapFlow as unknown as jest.Mock).mockImplementation(() => ({
      authenticated: false,
      connect: mockImapConnect,
      list: mockImapList,
      logout: mockImapLogout,
      on: mockImapOn,
    }));
    mockImapConnect.mockResolvedValue(undefined);
    mockImapList.mockResolvedValue([{ path: 'INBOX' }]);
    mockCalDavClientService.getClient.mockResolvedValue(mockClient);
    mockCalDavFetchEventsService.listEventCalendars.mockResolvedValue([
      { url: 'https://caldav.example.com/calendars/user/default/' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapSmtpCaldavService,
        {
          provide: SecureHttpClientService,
          useValue: { getValidatedHost: mockGetValidatedHost },
        },
        { provide: ImapSmtpCaldavValidatorService, useValue: {} },
        {
          provide: TwentyConfigService,
          useValue: { get: jest.fn().mockReturnValue(true) },
        },
        {
          provide: CalDavClientService,
          useValue: mockCalDavClientService,
        },
        {
          provide: CalDavFetchEventsService,
          useValue: mockCalDavFetchEventsService,
        },
      ],
    }).compile();

    service = module.get<ImapSmtpCaldavService>(ImapSmtpCaldavService);
  });

  describe('testCaldavConnection', () => {
    const params: ConnectionParameters = {
      host: 'https://caldav.example.com',
      port: 443,
      username: 'user@example.com',
      password: 'password123',
      connectionSecurity: EmailConnectionSecurity.SSL_TLS,
    };

    it('builds a CalDAV client and lists its event calendars', async () => {
      await service.testCaldavConnection('user@example.com', params);

      expect(mockCalDavClientService.getClient).toHaveBeenCalledWith({
        serverUrl: 'https://caldav.example.com',
        username: 'user@example.com',
        password: 'password123',
      });
      expect(
        mockCalDavFetchEventsService.listEventCalendars,
      ).toHaveBeenCalledWith(mockClient);
    });

    it('falls back to the handle when CALDAV.username is missing', async () => {
      await service.testCaldavConnection('handle@example.com', {
        ...params,
        username: undefined,
      });

      expect(mockCalDavClientService.getClient).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'handle@example.com' }),
      );
    });

    it('throws when no event calendars are found', async () => {
      mockCalDavFetchEventsService.listEventCalendars.mockResolvedValue([]);

      await expect(
        service.testCaldavConnection('user@example.com', params),
      ).rejects.toThrow('No calendar with event support found');
    });
  });

  describe('testSmtpConnection', () => {
    const params: ConnectionParameters = {
      host: 'smtp.example.com',
      port: 587,
      username: 'user@example.com',
      password: 'password123',
      connectionSecurity: EmailConnectionSecurity.STARTTLS,
    };

    it('uses implicit TLS when connectionSecurity is SSL_TLS', async () => {
      await service.testSmtpConnection('user@example.com', {
        ...params,
        port: 465,
        connectionSecurity: EmailConnectionSecurity.SSL_TLS,
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true }),
      );
    });

    it('upgrades opportunistically via STARTTLS', async () => {
      await service.testSmtpConnection('user@example.com', {
        ...params,
        connectionSecurity: EmailConnectionSecurity.STARTTLS,
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false }),
      );
    });

    it('disables TLS when connectionSecurity is NONE', async () => {
      await service.testSmtpConnection('user@example.com', {
        ...params,
        connectionSecurity: EmailConnectionSecurity.NONE,
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false, ignoreTLS: true }),
      );
    });
  });

  describe('validateAndTestWorkspaceMailboxConnection', () => {
    const connectionParameters = {
      IMAP: {
        host: 'imap.example.com',
        port: 993,
        username: 'outreach@example.com',
        password: 'workspace-secret' as PlaintextString,
        connectionSecurity: EmailConnectionSecurity.SSL_TLS,
      },
      SMTP: {
        host: 'smtp.example.com',
        port: 587,
        username: 'outreach@example.com',
        password: 'workspace-secret' as PlaintextString,
        connectionSecurity: EmailConnectionSecurity.STARTTLS,
      },
    } satisfies PlaintextImapSmtpCaldavParams;

    it.each([
      ['SMTP', { IMAP: connectionParameters.IMAP }],
      ['IMAP', { SMTP: connectionParameters.SMTP }],
    ])(
      'rejects a connection without %s before network access',
      async (_missingProtocol, incompleteParameters) => {
        await expect(
          service.validateAndTestWorkspaceMailboxConnection({
            connectionParameters: incompleteParameters,
            handle: 'outreach@example.com',
          }),
        ).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' });

        expect(createTransport).not.toHaveBeenCalled();
        expect(ImapFlow).not.toHaveBeenCalled();
      },
    );

    it('rejects plaintext security and CalDAV', async () => {
      await expect(
        service.validateAndTestWorkspaceMailboxConnection({
          connectionParameters: {
            ...connectionParameters,
            SMTP: {
              ...connectionParameters.SMTP,
              connectionSecurity: EmailConnectionSecurity.NONE,
            },
            CALDAV: {
              ...connectionParameters.IMAP,
              host: 'https://caldav.example.com',
            },
          },
          handle: 'outreach@example.com',
        }),
      ).rejects.toMatchObject({ code: 'INSECURE_CONNECTION' });

      expect(createTransport).not.toHaveBeenCalled();
      expect(ImapFlow).not.toHaveBeenCalled();
    });

    it('validates both protocols with certificate verification', async () => {
      mockGetValidatedHost
        .mockResolvedValueOnce('203.0.113.10')
        .mockResolvedValueOnce('203.0.113.11');

      await service.validateAndTestWorkspaceMailboxConnection({
        connectionParameters,
        handle: 'outreach@example.com',
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '203.0.113.10',
          tls: expect.objectContaining({
            rejectUnauthorized: true,
            servername: 'smtp.example.com',
          }),
        }),
      );
      expect(ImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '203.0.113.11',
          tls: expect.objectContaining({
            rejectUnauthorized: true,
            servername: 'imap.example.com',
          }),
        }),
      );
      expect(mockVerify).toHaveBeenCalledTimes(1);
      expect(mockImapConnect).toHaveBeenCalledTimes(1);
      expect(mockImapList).toHaveBeenCalledTimes(1);
    });

    it('requires STARTTLS rather than allowing a plaintext fallback', async () => {
      await service.validateAndTestWorkspaceMailboxConnection({
        connectionParameters: {
          IMAP: {
            ...connectionParameters.IMAP,
            connectionSecurity: EmailConnectionSecurity.STARTTLS,
            port: 143,
          },
          SMTP: connectionParameters.SMTP,
        },
        handle: 'outreach@example.com',
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          requireTLS: true,
          secure: false,
        }),
      );
      expect(ImapFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          doSTARTTLS: true,
          secure: false,
        }),
      );
    });

    it('classifies provider failures without exposing provider or secret text', async () => {
      const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn');
      const rawProviderText =
        'provider payload echoed workspace-secret for internal-host:2525';

      mockVerify.mockRejectedValue({
        code: 'EAUTH',
        password: 'workspace-secret',
        providerPayload: rawProviderText,
      });

      const error = await service
        .validateAndTestWorkspaceMailboxConnection({
          connectionParameters,
          handle: 'outreach@example.com',
        })
        .catch((caughtError) => caughtError);
      const observableText = JSON.stringify({
        loggerCalls: loggerWarnSpy.mock.calls,
        message: error.message,
        serializedError: JSON.stringify(error),
      });

      expect(error).toMatchObject({ code: 'AUTHENTICATION_FAILED' });
      expect(observableText).not.toContain('workspace-secret');
      expect(observableText).not.toContain('internal-host');
      expect(observableText).not.toContain('provider payload');
    });

    it('redacts host validation failures', async () => {
      const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn');
      const rawHostError =
        'DNS lookup exposed workspace-secret at private-host.internal';

      mockGetValidatedHost.mockRejectedValueOnce(new Error(rawHostError));

      const error = await service
        .validateAndTestWorkspaceMailboxConnection({
          connectionParameters,
          handle: 'outreach@example.com',
        })
        .catch((caughtError) => caughtError);
      const observableText = JSON.stringify({
        loggerCalls: loggerWarnSpy.mock.calls,
        message: error.message,
      });

      expect(error).toMatchObject({ code: 'CONNECTION_UNAVAILABLE' });
      expect(observableText).not.toContain('workspace-secret');
      expect(observableText).not.toContain('private-host');
    });
  });
});
