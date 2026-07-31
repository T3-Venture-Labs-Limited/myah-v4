import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ImapFlow } from 'imapflow';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { buildImapTlsOptions } from 'src/engine/core-modules/imap-smtp-caldav-connection/utils/build-imap-tls-options.util';
import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { getWorkspaceMailboxTlsServername } from 'src/engine/core-modules/myah/utils/get-workspace-mailbox-tls-servername.util';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import {
  MessageImportDriverException,
  MessageImportDriverExceptionCode,
} from 'src/modules/messaging/message-import-manager/drivers/exceptions/message-import-driver.exception';
import { parseImapAuthenticationError } from 'src/modules/messaging/message-import-manager/drivers/imap/utils/parse-imap-authentication-error.util';

@Injectable()
export class ImapClientProvider {
  private readonly logger = new Logger(ImapClientProvider.name);

  private static readonly CONNECTION_TIMEOUT_MS = 30000;
  private static readonly GREETING_TIMEOUT_MS = 16000;
  private readonly workspaceMailboxClients = new WeakSet<ImapFlow>();

  constructor(
    private readonly secureHttpClientService: SecureHttpClientService,
    private readonly connectedAccountTokenEncryptionService: ConnectedAccountTokenEncryptionService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {}

  async getClient(connectedAccountId: string): Promise<ImapFlow> {
    const connectedAccount =
      await this.loadConnectedAccount(connectedAccountId);

    try {
      return await this.createConnection(connectedAccount);
    } catch (error) {
      const parsedError = parseImapAuthenticationError(error);

      if (this.isWorkspaceMailbox(connectedAccount)) {
        this.logger.error('workspace_mailbox_imap_connection_failed');

        throw new MessageImportDriverException(
          'Workspace mailbox IMAP connection failed',
          parsedError.code,
        );
      }

      this.logger.error(
        `Failed to establish IMAP connection for ${connectedAccount.handle}: ${error.message}`,
        error.stack,
      );

      throw parsedError;
    }
  }

  async closeClient(client: ImapFlow): Promise<void> {
    const isWorkspaceMailbox = this.workspaceMailboxClients.has(client);

    try {
      await client.logout();
      this.logger.log(
        isWorkspaceMailbox
          ? 'workspace_mailbox_imap_closed'
          : 'Closed IMAP client',
      );
    } catch (error) {
      this.logger.error(
        isWorkspaceMailbox
          ? 'workspace_mailbox_imap_logout_failed'
          : `Error closing IMAP client: ${error.message}`,
      );
    } finally {
      this.workspaceMailboxClients.delete(client);
    }
  }

  private async loadConnectedAccount(
    connectedAccountId: string,
  ): Promise<ConnectedAccountEntity> {
    const connectedAccount = await this.connectedAccountRepository.findOne({
      where: { id: connectedAccountId },
    });

    if (
      !isDefined(connectedAccount) ||
      connectedAccount.provider !== ConnectedAccountProvider.IMAP_SMTP_CALDAV ||
      !isDefined(connectedAccount.connectionParameters?.IMAP)
    ) {
      throw new MessageImportDriverException(
        `Missing IMAP credentials for connected account ${connectedAccountId}`,
        MessageImportDriverExceptionCode.INSUFFICIENT_PERMISSIONS,
      );
    }

    return connectedAccount;
  }

  private async createConnection(
    connectedAccount: ConnectedAccountEntity,
  ): Promise<ImapFlow> {
    if (!isDefined(connectedAccount.connectionParameters?.IMAP)) {
      throw new Error('Connected account is not an IMAP provider');
    }

    const imapParams =
      this.connectedAccountTokenEncryptionService.decryptProtocolPassword({
        protocolParams: connectedAccount.connectionParameters.IMAP,
        workspaceId: connectedAccount.workspaceId,
      });
    const isWorkspaceMailbox = this.isWorkspaceMailbox(connectedAccount);

    const validatedImapHost =
      await this.secureHttpClientService.getValidatedHost(imapParams.host);

    const client = new ImapFlow({
      host: validatedImapHost,
      port: imapParams.port || 993,
      ...buildImapTlsOptions(imapParams.connectionSecurity),
      ...(isWorkspaceMailbox &&
      imapParams.connectionSecurity === EmailConnectionSecurity.STARTTLS
        ? { doSTARTTLS: true }
        : {}),
      auth: {
        user: isDefined(imapParams.username)
          ? imapParams.username
          : connectedAccount.handle,
        pass: imapParams.password,
      },
      logger: false,
      tls: isWorkspaceMailbox
        ? {
            rejectUnauthorized: true,
            servername: getWorkspaceMailboxTlsServername(imapParams.host),
          }
        : {
            rejectUnauthorized: false,
          },
      connectionTimeout: ImapClientProvider.CONNECTION_TIMEOUT_MS,
      greetingTimeout: ImapClientProvider.GREETING_TIMEOUT_MS,
    });

    // ImapFlow is long-lived EventEmitter — missing 'error' listener crashes process on socket timeout.
    client.on('error', (error) => {
      if (isWorkspaceMailbox) {
        this.logger.error('workspace_mailbox_imap_transport_error');

        return;
      }

      this.logger.error(
        `IMAP client error for ${connectedAccount.handle}: ${error.message}`,
        error.stack,
      );
    });

    try {
      await client.connect();

      if (isWorkspaceMailbox) {
        this.workspaceMailboxClients.add(client);
      }

      this.logger.log(
        isWorkspaceMailbox
          ? 'workspace_mailbox_imap_connected'
          : `Connected to IMAP server for ${connectedAccount.handle}`,
      );

      return client;
    } catch (error) {
      try {
        await client.logout();
      } catch {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  private isWorkspaceMailbox(
    connectedAccount: ConnectedAccountEntity,
  ): boolean {
    return (
      connectedAccount.name === MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME &&
      connectedAccount.visibility === 'workspace'
    );
  }
}
