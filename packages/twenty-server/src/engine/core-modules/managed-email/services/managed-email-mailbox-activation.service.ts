import { Inject, Injectable } from '@nestjs/common';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceMailboxConnectionException } from 'src/engine/core-modules/myah/exceptions/workspace-mailbox-connection.exception';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from '../enums/managed-email-infrastructure-state.enum';
import { IcemailClient } from '../providers/icemail/icemail.client';

const RECOVERY_DELAY_MS = 11 * 60_000;
export const MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK = Symbol(
  'MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK',
);

@Injectable()
export class ManagedEmailMailboxActivationService {
  constructor(
    @Inject(getWorkspaceScopedRepositoryToken(ManagedEmailMailboxEntity))
    private readonly mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    private readonly icemailClient: IcemailClient,
    private readonly connectionService: WorkspaceMailboxConnectionService,
    @Inject(MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async activateMailbox({
    mailboxId,
    workspaceId,
  }: {
    mailboxId: string;
    workspaceId: string;
  }) {
    const mailbox = await this.mailboxRepository.findOneBy(workspaceId, {
      id: mailboxId,
    });
    if (mailbox === null) {
      throw new WorkspaceMailboxConnectionException('MAILBOX_NOT_FOUND');
    }
    const credential = mailbox.providerMailboxId
      ? await this.icemailClient.getMailboxCredential(mailbox.providerMailboxId)
      : null;
    if (
      credential === null ||
      credential.username.trim().toLowerCase() !== mailbox.normalizedAddress ||
      !credential.imap ||
      !credential.smtp
    ) {
      const nextReconciliationAt = new Date(
        this.now().getTime() + RECOVERY_DELAY_MS,
      );
      const update = await this.mailboxRepository.update(
        workspaceId,
        { id: mailboxId },
        {
          infrastructureState:
            ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
          nextReconciliationAt,
          safeFailureCode: 'CREDENTIALS_UNAVAILABLE',
        },
      );
      if (update.affected !== 1)
        throw new WorkspaceMailboxConnectionException('UNKNOWN');
      return {
        state: ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
        retryScheduled: true,
      };
    }

    const connectingUpdate = await this.mailboxRepository.update(
      workspaceId,
      { id: mailboxId },
      {
        infrastructureState: ManagedEmailInfrastructureState.CONNECTING_TWENTY,
        nextReconciliationAt: new Date(
          this.now().getTime() + RECOVERY_DELAY_MS,
        ),
      },
    );
    if (connectingUpdate.affected !== 1)
      throw new WorkspaceMailboxConnectionException('UNKNOWN');
    try {
      const password = credential.appPassword as PlaintextString;
      const connection =
        await this.connectionService.connectManagedWorkspaceMailbox({
          accountType: 'IMAP_SMTP',
          connectionParameters: {
            IMAP: {
              host: credential.imap.host,
              port: credential.imap.port,
              username: credential.username,
              password,
              connectionSecurity: EmailConnectionSecurity.SSL_TLS,
            },
            SMTP: {
              host: credential.smtp.host,
              port: credential.smtp.port,
              username: credential.username,
              password,
              connectionSecurity: EmailConnectionSecurity.SSL_TLS,
            },
          },
          handle: mailbox.address,
          idempotencyKey: `managed-mailbox:${mailbox.id}`,
          workspaceId,
        });
      const activeUpdate = await this.mailboxRepository.update(
        workspaceId,
        { id: mailboxId },
        {
          connectedAccountId: connection.connectedAccountId,
          messageChannelId: connection.messageChannelId,
          infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
          campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
          nextReconciliationAt: null,
          safeFailureCode: null,
        },
      );
      if (activeUpdate.affected !== 1)
        throw new WorkspaceMailboxConnectionException('UNKNOWN');
      return {
        state: ManagedEmailInfrastructureState.ACTIVE,
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        ...connection,
      };
    } catch {
      const nextReconciliationAt = new Date(
        this.now().getTime() + RECOVERY_DELAY_MS,
      );
      const recoveryUpdate = await this.mailboxRepository.update(
        workspaceId,
        { id: mailboxId },
        {
          infrastructureState:
            ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
          nextReconciliationAt,
          safeFailureCode: 'CONNECTION_FAILED',
        },
      );
      if (recoveryUpdate.affected !== 1)
        throw new WorkspaceMailboxConnectionException('UNKNOWN');
      throw new WorkspaceMailboxConnectionException('UNKNOWN');
    }
  }
}
