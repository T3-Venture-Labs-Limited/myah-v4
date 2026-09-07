import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Socket } from 'net';
import { createTransport, type Transporter } from 'nodemailer';

import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import { ConnectedAccountProvider } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { buildSmtpTlsOptions } from 'src/engine/core-modules/imap-smtp-caldav-connection/utils/build-smtp-tls-options.util';
import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { getWorkspaceMailboxTlsServername } from 'src/engine/core-modules/myah/utils/get-workspace-mailbox-tls-servername.util';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';

type OwnedSocketSmtpOptions = SMTPTransport.Options & {
  host: string;
  port: number;
};

export type SmtpClient = {
  verify: () => Promise<true>;
  sendMail: (
    options: SMTPTransport.MailOptions,
  ) => Promise<SMTPTransport.SentMessageInfo>;
};

const getDeadlineError = (deadlineMs: number) =>
  new Error(`SMTP operation exceeded ${deadlineMs}ms`);

const executeWithOwnedSocket = <T>(
  options: OwnedSocketSmtpOptions,
  deadlineMs: number,
  operation: (
    transporter: Transporter<
      SMTPTransport.SentMessageInfo,
      SMTPTransport.Options
    >,
  ) => Promise<T>,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let ownedSocket: Socket | undefined;
    let terminal = false;
    let socketHookSettled = false;
    let socketHookCallback:
      | ((error: Error | null, socketOptions: object) => void)
      | undefined;

    const deadlineError = getDeadlineError(deadlineMs);

    const destroyOwnedSocket = () => {
      if (isDefined(ownedSocket) && !ownedSocket.destroyed) {
        ownedSocket.destroy();
      }
    };

    const settleSocketHook = (
      error: Error | null,
      socketOptions: object = {},
    ) => {
      if (socketHookSettled || !isDefined(socketHookCallback)) {
        return;
      }

      socketHookSettled = true;
      socketHookCallback(error, socketOptions);
    };

    const clearResources = () => {
      if (isDefined(deadlineTimer)) {
        clearTimeout(deadlineTimer);
      }
      destroyOwnedSocket();
    };

    const settleOperation = (
      result:
        | { status: 'fulfilled'; value: T }
        | { status: 'rejected'; error: unknown },
    ) => {
      if (terminal) {
        return;
      }

      terminal = true;
      clearResources();

      if (result.status === 'fulfilled') {
        resolve(result.value);
      } else {
        reject(result.error);
      }
    };

    const transporter = createTransport({
      ...options,
      getSocket: (
        _socketOptions: SMTPTransport.Options,
        callback: (error: Error | null, socketOptions: object) => void,
      ) => {
        socketHookCallback = callback;

        if (terminal) {
          settleSocketHook(deadlineError);

          return;
        }

        const socket = new Socket();

        ownedSocket = socket;

        const removeConnectionListeners = () => {
          socket.removeListener('connect', handleConnect);
          socket.removeListener('error', handleConnectionError);
          socket.removeListener('close', handleConnectionClose);
        };
        const handleConnect = () => {
          removeConnectionListeners();

          if (terminal) {
            socket.destroy();
            settleSocketHook(deadlineError);

            return;
          }

          socket.setKeepAlive(true);
          settleSocketHook(null, { connection: socket });
        };
        const handleConnectionError = (error: Error) => {
          removeConnectionListeners();
          settleSocketHook(error);
        };
        const handleConnectionClose = () => {
          removeConnectionListeners();
          settleSocketHook(
            terminal
              ? deadlineError
              : new Error('SMTP socket closed before connecting'),
          );
        };

        socket.once('connect', handleConnect);
        socket.once('error', handleConnectionError);
        socket.once('close', handleConnectionClose);

        try {
          socket.connect(options.port, options.host);
        } catch (error) {
          handleConnectionError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    });

    deadlineTimer = setTimeout(() => {
      if (terminal) {
        return;
      }

      terminal = true;
      destroyOwnedSocket();
      settleSocketHook(deadlineError);
      clearResources();
      reject(deadlineError);
    }, deadlineMs);

    try {
      operation(transporter).then(
        (value) => settleOperation({ status: 'fulfilled', value }),
        (error) => settleOperation({ status: 'rejected', error }),
      );
    } catch (error) {
      settleOperation({ status: 'rejected', error });
    }
  });

// Internal transport seam: application callers receive the fixed-deadline client
// from SmtpClientProvider; tests may supply a shorter duration for loopback I/O.
export const createOwnedSocketSmtpClient = (
  options: OwnedSocketSmtpOptions,
  deadlineMs: number,
): SmtpClient => ({
  verify: () =>
    executeWithOwnedSocket(options, deadlineMs, (transporter) =>
      transporter.verify(),
    ),
  sendMail: (mailOptions) =>
    executeWithOwnedSocket(options, deadlineMs, (transporter) =>
      transporter.sendMail(mailOptions),
    ),
});

@Injectable()
export class SmtpClientProvider {
  constructor(
    private readonly secureHttpClientService: SecureHttpClientService,
    private readonly connectedAccountTokenEncryptionService: ConnectedAccountTokenEncryptionService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {}

  public async getClient(connectedAccountId: string): Promise<SmtpClient> {
    const connectedAccount = await this.connectedAccountRepository.findOne({
      where: { id: connectedAccountId },
    });

    if (!isDefined(connectedAccount)) {
      throw new Error(
        `Connected account ${connectedAccountId} not found while opening SMTP client`,
      );
    }

    if (
      connectedAccount.provider !== ConnectedAccountProvider.IMAP_SMTP_CALDAV ||
      !isDefined(connectedAccount.connectionParameters?.SMTP)
    ) {
      throw new Error('Connected account is not an SMTP provider');
    }

    const smtpParams =
      this.connectedAccountTokenEncryptionService.decryptProtocolPassword({
        protocolParams: connectedAccount.connectionParameters.SMTP,
        workspaceId: connectedAccount.workspaceId,
      });

    const validatedSmtpHost =
      await this.secureHttpClientService.getValidatedHost(smtpParams.host);
    const isWorkspaceMailbox =
      connectedAccount.name === MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME &&
      connectedAccount.visibility === 'workspace';

    const options: OwnedSocketSmtpOptions = {
      host: validatedSmtpHost,
      port: smtpParams.port,
      ...buildSmtpTlsOptions(smtpParams.connectionSecurity),
      connectionTimeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
      greetingTimeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
      socketTimeout: OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
      ...(isWorkspaceMailbox &&
      smtpParams.connectionSecurity === EmailConnectionSecurity.STARTTLS
        ? { requireTLS: true }
        : {}),
      auth: {
        user: smtpParams.username ?? connectedAccount.handle ?? '',
        pass: smtpParams.password,
      },
      tls: isWorkspaceMailbox
        ? {
            rejectUnauthorized: true,
            servername: getWorkspaceMailboxTlsServername(smtpParams.host),
          }
        : {
            rejectUnauthorized: false,
          },
    };

    return createOwnedSocketSmtpClient(
      options,
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    );
  }
}
