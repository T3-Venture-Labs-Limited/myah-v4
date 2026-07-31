import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isEmail } from 'class-validator';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IsNull, type Repository } from 'typeorm';

import { ImapSmtpCaldavService } from 'src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service';
import { type PlaintextImapSmtpCaldavParams } from 'src/engine/core-modules/imap-smtp-caldav-connection/types/imap-smtp-caldav-connection.type';
import { MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME } from 'src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant';
import { WorkspaceMailboxConnectionException } from 'src/engine/core-modules/myah/exceptions/workspace-mailbox-connection.exception';
import {
  type ConnectWorkspaceMailboxInput,
  type ConnectWorkspaceMailboxResult,
  type ReplaceWorkspaceMailboxCredentialsInput,
  type RevokeWorkspaceMailboxResult,
  type WorkspaceMailboxConnectionStatus,
  type WorkspaceMailboxLastSafeOperation,
} from 'src/engine/core-modules/myah/types/workspace-mailbox-connection.type';
import { maskWorkspaceMailboxHandle } from 'src/engine/core-modules/myah/utils/mask-workspace-mailbox-handle.util';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { WorkspaceSharedConnectedAccountConflictError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-conflict.error';
import { WorkspaceSharedConnectedAccountNotFoundError } from 'src/modules/connected-account/exceptions/workspace-shared-connected-account-not-found.error';
import {
  ImapSmtpCalDavAPIService,
  type UpsertConnectedAccountInput,
  type UpsertConnectedAccountResult,
} from 'src/modules/connected-account/services/imap-smtp-caldav-apis.service';

@Injectable()
export class WorkspaceMailboxConnectionService {
  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly imapSmtpCaldavService: ImapSmtpCaldavService,
    private readonly imapSmtpCalDavAPIService: ImapSmtpCalDavAPIService,
    private readonly connectedAccountTokenEncryptionService: ConnectedAccountTokenEncryptionService,
    private readonly connectedAccountMetadataService: ConnectedAccountMetadataService,
  ) {}

  async connectWorkspaceMailbox(
    input: ConnectWorkspaceMailboxInput,
  ): Promise<ConnectWorkspaceMailboxResult> {
    const handle = input.handle.trim().toLowerCase();

    if (input.accountType !== 'IMAP_SMTP' || !isEmail(handle)) {
      throw new WorkspaceMailboxConnectionException('INVALID_CONFIGURATION');
    }

    const userWorkspace = await this.userWorkspaceRepository.findOne(
      isDefined(input.userWorkspaceId)
        ? {
            where: {
              id: input.userWorkspaceId,
              workspaceId: input.workspaceId,
            },
          }
        : {
            order: { createdAt: 'ASC' },
            where: { workspaceId: input.workspaceId },
          },
    );

    if (!isDefined(userWorkspace)) {
      throw new WorkspaceMailboxConnectionException('MAILBOX_NOT_FOUND');
    }

    const existingAccount = await this.findWorkspaceMailboxAccount({
      workspaceId: input.workspaceId,
    });

    if (isDefined(existingAccount) && existingAccount.handle !== handle) {
      throw new WorkspaceMailboxConnectionException(
        'MAILBOX_ALREADY_CONNECTED',
      );
    }

    const connectionParameters =
      await this.imapSmtpCaldavService.validateAndTestWorkspaceMailboxConnection(
        {
          connectionParameters: input.connectionParameters,
          handle,
        },
      );
    const { connectedAccountId, messageChannelId } =
      await this.upsertWorkspaceMailbox({
        connectionParameters,
        existingAccount,
        handle,
        name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
        userWorkspaceId: userWorkspace.id,
        visibility: 'workspace',
        workspaceId: input.workspaceId,
      });

    if (!isDefined(messageChannelId)) {
      throw new WorkspaceMailboxConnectionException('UNKNOWN');
    }

    const messageChannel = await this.messageChannelRepository.findOne({
      where: {
        connectedAccountId,
        id: messageChannelId,
        workspaceId: input.workspaceId,
      },
    });

    if (!isDefined(messageChannel)) {
      throw new WorkspaceMailboxConnectionException('UNKNOWN');
    }

    return {
      connectedAccountId,
      messageChannelId,
      status: this.buildSafeStatus({
        connectedAccountId,
        handle,
        lastSafeOperation: 'CONNECTED',
        messageChannel,
      }),
    };
  }

  rotateWorkspaceMailbox(
    input: ReplaceWorkspaceMailboxCredentialsInput,
  ): Promise<ConnectWorkspaceMailboxResult> {
    return this.replaceWorkspaceMailboxCredentials(input, 'ROTATED');
  }

  reconnectWorkspaceMailbox(
    input: ReplaceWorkspaceMailboxCredentialsInput,
  ): Promise<ConnectWorkspaceMailboxResult> {
    return this.replaceWorkspaceMailboxCredentials(input, 'RECONNECTED');
  }

  async getWorkspaceMailboxStatus({
    connectedAccountId,
    workspaceId,
  }: {
    connectedAccountId: string;
    workspaceId: string;
  }): Promise<WorkspaceMailboxConnectionStatus> {
    const existingAccount = await this.findWorkspaceMailboxAccount({
      connectedAccountId,
      workspaceId,
    });

    if (!isDefined(existingAccount)) {
      throw new WorkspaceMailboxConnectionException('MAILBOX_NOT_FOUND');
    }

    const messageChannel = await this.messageChannelRepository.findOne({
      where: {
        connectedAccountId,
        workspaceId,
      },
    });

    if (!isDefined(messageChannel)) {
      throw new WorkspaceMailboxConnectionException('MAILBOX_NOT_FOUND');
    }

    return this.buildSafeStatus({
      authFailedAt: existingAccount.authFailedAt,
      connectedAccountId,
      handle: existingAccount.handle,
      lastSafeOperation: 'CONNECTED',
      messageChannel,
    });
  }

  async revokeWorkspaceMailbox({
    connectedAccountId,
    workspaceId,
  }: {
    connectedAccountId: string;
    workspaceId: string;
  }): Promise<RevokeWorkspaceMailboxResult> {
    const existingAccount = await this.findWorkspaceMailboxAccount({
      connectedAccountId,
      workspaceId,
    });

    if (isDefined(existingAccount)) {
      try {
        await this.connectedAccountMetadataService.delete({
          allowWorkspaceMailbox: true,
          id: connectedAccountId,
          workspaceId,
        });
      } catch (cause) {
        if (
          !(
            cause instanceof ConnectedAccountException &&
            cause.code ===
              ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND
          )
        ) {
          throw new WorkspaceMailboxConnectionException('UNKNOWN', { cause });
        }
      }
    }

    return {
      connectedAccountId,
      revoked: true,
      state: 'REVOKED',
    };
  }

  private async replaceWorkspaceMailboxCredentials(
    input: ReplaceWorkspaceMailboxCredentialsInput,
    lastSafeOperation: 'ROTATED' | 'RECONNECTED',
  ): Promise<ConnectWorkspaceMailboxResult> {
    const existingAccount = await this.findWorkspaceMailboxAccount({
      connectedAccountId: input.connectedAccountId,
      workspaceId: input.workspaceId,
    });

    if (
      !isDefined(existingAccount) ||
      !isDefined(existingAccount.connectionParameters)
    ) {
      throw new WorkspaceMailboxConnectionException('MAILBOX_NOT_FOUND');
    }

    let existingConnectionParameters: PlaintextImapSmtpCaldavParams;

    try {
      existingConnectionParameters =
        this.connectedAccountTokenEncryptionService.decryptConnectionParameters(
          {
            connectionParameters: existingAccount.connectionParameters,
            workspaceId: input.workspaceId,
          },
        );
    } catch (cause) {
      throw new WorkspaceMailboxConnectionException('UNKNOWN', { cause });
    }
    const mergedConnectionParameters = {
      IMAP:
        input.connectionParameters.IMAP ?? existingConnectionParameters.IMAP,
      SMTP:
        input.connectionParameters.SMTP ?? existingConnectionParameters.SMTP,
      ...(isDefined(input.connectionParameters.CALDAV)
        ? { CALDAV: input.connectionParameters.CALDAV }
        : {}),
    };
    const connectionParameters =
      await this.imapSmtpCaldavService.validateAndTestWorkspaceMailboxConnection(
        {
          connectionParameters: mergedConnectionParameters,
          handle: existingAccount.handle,
        },
      );
    const { connectedAccountId, messageChannelId } =
      await this.upsertWorkspaceMailbox({
        connectionParameters,
        existingAccount,
        handle: existingAccount.handle,
        name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
        userWorkspaceId: existingAccount.userWorkspaceId,
        visibility: 'workspace',
        workspaceId: input.workspaceId,
      });

    if (!isDefined(messageChannelId)) {
      throw new WorkspaceMailboxConnectionException('UNKNOWN');
    }

    const messageChannel = await this.messageChannelRepository.findOne({
      where: {
        connectedAccountId,
        id: messageChannelId,
        workspaceId: input.workspaceId,
      },
    });

    if (!isDefined(messageChannel)) {
      throw new WorkspaceMailboxConnectionException('UNKNOWN');
    }

    return {
      connectedAccountId,
      messageChannelId,
      status: this.buildSafeStatus({
        connectedAccountId,
        handle: existingAccount.handle,
        lastSafeOperation,
        messageChannel,
      }),
    };
  }

  private findWorkspaceMailboxAccount({
    connectedAccountId,
    workspaceId,
  }: {
    connectedAccountId?: string;
    workspaceId: string;
  }): Promise<ConnectedAccountEntity | null> {
    return this.connectedAccountRepository.findOne({
      where: {
        archivedAt: IsNull(),
        ...(isDefined(connectedAccountId) ? { id: connectedAccountId } : {}),
        name: MYAH_WORKSPACE_MAILBOX_CONNECTED_ACCOUNT_NAME,
        provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
        visibility: 'workspace',
        workspaceId,
      },
    });
  }

  private async upsertWorkspaceMailbox(
    input: UpsertConnectedAccountInput,
  ): Promise<UpsertConnectedAccountResult> {
    try {
      return await this.imapSmtpCalDavAPIService.upsertConnectedAccount(input);
    } catch (error) {
      if (error instanceof WorkspaceSharedConnectedAccountConflictError) {
        throw new WorkspaceMailboxConnectionException(
          'MAILBOX_ALREADY_CONNECTED',
          { cause: error },
        );
      }

      if (error instanceof WorkspaceSharedConnectedAccountNotFoundError) {
        throw new WorkspaceMailboxConnectionException('MAILBOX_NOT_FOUND', {
          cause: error,
        });
      }

      throw error;
    }
  }

  private buildSafeStatus({
    authFailedAt,
    connectedAccountId,
    handle,
    lastSafeOperation,
    messageChannel,
  }: {
    authFailedAt?: Date | null;
    connectedAccountId: string;
    handle: string;
    lastSafeOperation: WorkspaceMailboxLastSafeOperation;
    messageChannel: MessageChannelEntity;
  }): WorkspaceMailboxConnectionStatus {
    const reconnectRequired = isDefined(authFailedAt);
    const reconnectError = reconnectRequired
      ? new WorkspaceMailboxConnectionException('RECONNECT_REQUIRED')
      : null;

    return {
      connectedAccountId,
      errorCode: reconnectError?.code ?? null,
      errorMessage: reconnectError?.message ?? null,
      lastSafeOperation,
      maskedHandle: maskWorkspaceMailboxHandle(handle),
      messageChannelId: messageChannel.id,
      state: reconnectRequired ? 'RECONNECT_REQUIRED' : 'CONNECTED',
      syncStage: messageChannel.syncStage,
      syncStatus: messageChannel.syncStatus,
      updatedAt: messageChannel.updatedAt,
    };
  }
}
