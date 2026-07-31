import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { createTransport, type Transporter } from 'nodemailer';

import type SMTPConnection from 'nodemailer/lib/smtp-connection';

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

@Injectable()
export class SmtpClientProvider {
  constructor(
    private readonly secureHttpClientService: SecureHttpClientService,
    private readonly connectedAccountTokenEncryptionService: ConnectedAccountTokenEncryptionService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {}

  public async getClient(connectedAccountId: string): Promise<Transporter> {
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

    const options: SMTPConnection.Options = {
      host: validatedSmtpHost,
      port: smtpParams.port,
      ...buildSmtpTlsOptions(smtpParams.connectionSecurity),
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

    const transporter = createTransport(options);

    return transporter;
  }
}
