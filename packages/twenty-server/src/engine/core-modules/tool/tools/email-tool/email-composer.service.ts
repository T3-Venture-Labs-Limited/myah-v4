import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { toPlainText } from '@react-email/render';
import { isNonEmptyString } from '@sniptt/guards';
import DOMPurify from 'dompurify';
import { MAX_EMAIL_RECIPIENTS } from 'twenty-shared/constants';
import {
  ConnectedAccountProvider,
  type EmailAttachment,
} from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { In, IsNull, LessThanOrEqual, type Repository } from 'typeorm';
import { z } from 'zod';

import { FileEntity } from 'src/engine/core-modules/file/entities/file.entity';
import { FileService } from 'src/engine/core-modules/file/services/file.service';
import { EMAIL_ATTACHMENT_FILE_FOLDERS } from 'src/engine/core-modules/tool/tools/email-tool/constants/email-attachment-file-folders.const';
import {
  EmailToolException,
  EmailToolExceptionCode,
} from 'src/engine/core-modules/tool/tools/email-tool/exceptions/email-tool.exception';
import { type ComposeEmailParams } from 'src/engine/core-modules/tool/tools/email-tool/types/compose-email-params.type';
import { EmailComposerResult } from 'src/engine/core-modules/tool/tools/email-tool/types/email-composer-result.type';
import { parseCommaSeparatedEmails } from 'src/engine/core-modules/tool/tools/email-tool/utils/parse-comma-separated-emails.util';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type MessageAttachment } from 'src/modules/messaging/message-import-manager/types/message';
import { streamToBuffer } from 'src/utils/stream-to-buffer';

type ParentThreadContext = {
  threadExternalId?: string;
  references?: string[];
};

type ConnectedAccountCompositionResolution = {
  connectedAccount: ConnectedAccountEntity;
  hasImapConfiguration: boolean;
  hasSmtpConfiguration: boolean;
};

type TransactionalConnectedAccountRow = {
  id: unknown;
  workspaceId: unknown;
  handle: unknown;
  provider: unknown;
  scopes: unknown;
  hasImapConfiguration: unknown;
  hasSmtpConfiguration: unknown;
  messageChannels: unknown;
};

const TRANSACTIONAL_CONNECTED_ACCOUNT_SQL = `
  SELECT
    ca.id,
    ca."workspaceId",
    ca.handle,
    ca.provider,
    ca.scopes,
    COALESCE(
      ca."connectionParameters" ? 'IMAP'
      AND ca."connectionParameters"->'IMAP' <> 'null'::jsonb,
      false
    ) AS "hasImapConfiguration",
    COALESCE(
      ca."connectionParameters" ? 'SMTP'
      AND ca."connectionParameters"->'SMTP' <> 'null'::jsonb,
      false
    ) AS "hasSmtpConfiguration",
    COALESCE(
      jsonb_agg(
        jsonb_build_object('id', mc.id, 'handle', mc.handle)
        ORDER BY mc."createdAt", mc.id
      ) FILTER (WHERE mc.id IS NOT NULL),
      '[]'::jsonb
    ) AS "messageChannels"
  FROM core."connectedAccount" ca
  LEFT JOIN core."messageChannel" mc
    ON mc."workspaceId" = ca."workspaceId"
    AND mc."connectedAccountId" = ca.id
  WHERE ca.id = $1 AND ca."workspaceId" = $2
  GROUP BY ca.id
`;

const TRANSACTIONAL_FIRST_CONNECTED_ACCOUNT_SQL = `
  SELECT id
  FROM core."connectedAccount"
  WHERE "workspaceId" = $1 AND "archivedAt" IS NULL
`;

@Injectable()
export class EmailComposerService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectWorkspaceScopedRepository(FileEntity)
    private readonly fileRepository: WorkspaceScopedRepository<FileEntity>,
    private readonly fileService: FileService,
  ) {}

  private async getConnectedAccountOrThrow(
    connectedAccountId: string,
    workspaceId: string,
    transactionManager?: WorkspaceEntityManager,
  ): Promise<ConnectedAccountCompositionResolution> {
    if (!isValidUuid(connectedAccountId)) {
      throw new EmailToolException(
        `Connected account id is not a valid UUID`,
        EmailToolExceptionCode.INVALID_CONNECTED_ACCOUNT_ID,
      );
    }

    const find = (repository: Repository<ConnectedAccountEntity>) =>
      repository.findOne({
        where: { id: connectedAccountId, workspaceId },
        relations: {
          messageChannels: {
            messageFolders: true,
          },
        },
      });
    if (transactionManager) {
      const rows = (await transactionManager.queryRunner!.query(
        TRANSACTIONAL_CONNECTED_ACCOUNT_SQL,
        [connectedAccountId, workspaceId],
      )) as TransactionalConnectedAccountRow[];
      const resolution = this.parseTransactionalConnectedAccount(
        rows,
        connectedAccountId,
        workspaceId,
      );

      if (resolution !== null) {
        return resolution;
      }

      throw new EmailToolException(
        `No connected account found for id '${connectedAccountId}'`,
        EmailToolExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    const connectedAccount =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        () => find(this.connectedAccountRepository),
        buildSystemAuthContext(workspaceId),
      );

    if (!isDefined(connectedAccount)) {
      throw new EmailToolException(
        `No connected account found for id '${connectedAccountId}'`,
        EmailToolExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    return {
      connectedAccount,
      hasImapConfiguration: isDefined(
        connectedAccount.connectionParameters?.IMAP,
      ),
      hasSmtpConfiguration: isDefined(
        connectedAccount.connectionParameters?.SMTP,
      ),
    };
  }

  private parseTransactionalConnectedAccount(
    rows: TransactionalConnectedAccountRow[],
    connectedAccountId: string,
    workspaceId: string,
  ): ConnectedAccountCompositionResolution | null {
    if (rows.length !== 1) {
      return null;
    }

    const row = rows[0];
    const messageChannels = row.messageChannels;

    if (
      row.id !== connectedAccountId ||
      row.workspaceId !== workspaceId ||
      typeof row.handle !== 'string' ||
      row.handle.trim().length === 0 ||
      !Object.values(ConnectedAccountProvider).includes(
        row.provider as ConnectedAccountProvider,
      ) ||
      (row.scopes !== null &&
        (!Array.isArray(row.scopes) ||
          !row.scopes.every((scope) => typeof scope === 'string'))) ||
      typeof row.hasImapConfiguration !== 'boolean' ||
      typeof row.hasSmtpConfiguration !== 'boolean' ||
      !Array.isArray(messageChannels) ||
      !messageChannels.every(
        (channel) =>
          channel !== null &&
          typeof channel === 'object' &&
          isValidUuid(Reflect.get(channel, 'id')) &&
          typeof Reflect.get(channel, 'handle') === 'string',
      )
    ) {
      return null;
    }

    const connectedAccount = Object.assign(new ConnectedAccountEntity(), {
      id: row.id,
      workspaceId: row.workspaceId,
      handle: row.handle,
      provider: row.provider as ConnectedAccountProvider,
      scopes: row.scopes,
      connectionParameters: null,
      messageChannels,
    });

    return {
      connectedAccount,
      hasImapConfiguration: row.hasImapConfiguration,
      hasSmtpConfiguration: row.hasSmtpConfiguration,
    };
  }

  private async getOrThrowFirstConnectedAccountId(
    workspaceId: string,
    transactionManager?: WorkspaceEntityManager,
  ): Promise<string> {
    const find = (repository: Repository<ConnectedAccountEntity>) =>
      repository.find({
        where: { workspaceId, archivedAt: IsNull() },
      });
    const allAccounts = transactionManager
      ? ((await transactionManager.queryRunner!.query(
          TRANSACTIONAL_FIRST_CONNECTED_ACCOUNT_SQL,
          [workspaceId],
        )) as Array<{ id?: unknown }>)
      : await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          () => find(this.connectedAccountRepository),
          buildSystemAuthContext(workspaceId),
        );

    if (!allAccounts || allAccounts.length === 0) {
      throw new EmailToolException(
        'No connected accounts found for this workspace',
        EmailToolExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    const firstConnectedAccountId = allAccounts[0].id;

    if (
      typeof firstConnectedAccountId !== 'string' ||
      !isValidUuid(firstConnectedAccountId)
    ) {
      throw new EmailToolException(
        'No connected accounts found for this workspace',
        EmailToolExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    return firstConnectedAccountId;
  }

  private normalizeRecipients(parameters: ComposeEmailParams): {
    to: string[];
    cc: string[];
    bcc: string[];
  } {
    if (
      !parameters.recipients ||
      !parameters.recipients.to ||
      parameters.recipients.to.trim().length === 0
    ) {
      throw new EmailToolException(
        'No recipients specified',
        EmailToolExceptionCode.INVALID_EMAIL,
      );
    }

    const to = parseCommaSeparatedEmails(parameters.recipients.to);

    if (to.length === 0) {
      throw new EmailToolException(
        'No valid recipients specified',
        EmailToolExceptionCode.INVALID_EMAIL,
      );
    }

    return {
      to,
      cc: parseCommaSeparatedEmails(parameters.recipients.cc),
      bcc: parseCommaSeparatedEmails(parameters.recipients.bcc),
    };
  }

  private validateEmails(recipients: {
    to: string[];
    cc: string[];
    bcc: string[];
  }): string[] {
    const emailSchema = z.string().trim().pipe(z.email());
    const invalidEmails: string[] = [];

    const allEmails = [...recipients.to, ...recipients.cc, ...recipients.bcc];

    for (const email of allEmails) {
      const result = emailSchema.safeParse(email);

      if (!result.success) {
        invalidEmails.push(email);
      }
    }

    return invalidEmails;
  }

  private assertRecipientCountWithinLimit(recipients: {
    to: string[];
    cc: string[];
    bcc: string[];
  }): void {
    const total =
      recipients.to.length + recipients.cc.length + recipients.bcc.length;

    if (total > MAX_EMAIL_RECIPIENTS) {
      throw new EmailToolException(
        `Too many recipients: ${total}. Maximum allowed is ${MAX_EMAIL_RECIPIENTS}.`,
        EmailToolExceptionCode.TOO_MANY_RECIPIENTS,
      );
    }
  }

  private async getAttachments(
    files: Array<EmailAttachment>,
    workspaceId: string,
    transactionManager?: WorkspaceEntityManager,
  ): Promise<MessageAttachment[]> {
    if (files.length === 0) {
      return [];
    }
    if (transactionManager) {
      throw new EmailToolException(
        'Campaign transaction attachments are unavailable',
        EmailToolExceptionCode.FILE_NOT_FOUND,
      );
    }

    const fileIds = files.map((file) => file.id);

    const fileEntities = await this.fileRepository.find(workspaceId, {
      where: { id: In(fileIds) },
    });

    const fileEntityMap = new Map(
      fileEntities.map((entity) => [entity.id, entity]),
    );

    const filesNotFound: string[] = [];

    for (const fileMetadata of files) {
      if (!fileEntityMap.has(fileMetadata.id)) {
        filesNotFound.push(`${fileMetadata.name} (${fileMetadata.id})`);
      }
    }

    if (filesNotFound.length > 0) {
      throw new EmailToolException(
        `Files not found: ${filesNotFound.join(', ')}`,
        EmailToolExceptionCode.FILE_NOT_FOUND,
      );
    }

    const attachments: MessageAttachment[] = [];

    for (const fileMetadata of files) {
      const fileEntity = fileEntityMap.get(fileMetadata.id);

      const fileStream = await this.fileService.getFileStreamById({
        fileId: fileMetadata.id,
        workspaceId,
        allowedFileFolders: EMAIL_ATTACHMENT_FILE_FOLDERS,
      });

      if (fileStream === null) {
        throw new EmailToolException(
          `Files not found: ${fileMetadata.name} (${fileMetadata.id})`,
          EmailToolExceptionCode.FILE_NOT_FOUND,
        );
      }

      const buffer = await streamToBuffer(fileStream.stream);

      attachments.push({
        filename: fileMetadata.name,
        content: buffer,
        contentType: fileEntity?.mimeType ?? 'application/octet-stream',
      });
    }

    return attachments;
  }

  // Resolve parent's root thread id (Gmail/MS native or stored) + RFC 5322 §3.6.4
  // References chain so replies thread on both Twenty and recipient mail clients.
  private async getParentThreadContext(
    workspaceId: string,
    inReplyTo: string,
    messageChannelId: string,
    transactionManager?: WorkspaceEntityManager,
  ): Promise<ParentThreadContext> {
    const load = async () => {
      const messageRepository =
        await this.globalWorkspaceOrmManager.getRepository<MessageWorkspaceEntity>(
          workspaceId,
          'message',
        );

      const parentMessage = await messageRepository.findOne(
        { where: { headerMessageId: inReplyTo } },
        transactionManager,
      );

      if (
        !isDefined(parentMessage) ||
        !isDefined(parentMessage.messageThreadId) ||
        !isDefined(parentMessage.receivedAt)
      ) {
        return {};
      }

      const associationRepository =
        await this.globalWorkspaceOrmManager.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
          workspaceId,
          'messageChannelMessageAssociation',
        );

      const [association, ancestorMessages] = await Promise.all([
        associationRepository.findOne(
          {
            where: { messageId: parentMessage.id, messageChannelId },
            select: { messageThreadExternalId: true },
          },
          transactionManager,
        ),
        messageRepository.find(
          {
            where: {
              messageThreadId: parentMessage.messageThreadId,
              receivedAt: LessThanOrEqual(parentMessage.receivedAt),
            },
            select: { headerMessageId: true },
            order: { receivedAt: 'ASC' },
          },
          transactionManager,
        ),
      ]);

      const references = ancestorMessages
        .map((message) => message.headerMessageId)
        .filter(isNonEmptyString);

      return {
        threadExternalId: association?.messageThreadExternalId ?? undefined,
        references: references.length > 0 ? references : undefined,
      };
    };

    return transactionManager
      ? load()
      : this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          load,
          buildSystemAuthContext(workspaceId),
        );
  }

  async composeEmail(
    parameters: ComposeEmailParams,
    context: ToolExecutionContext,
    transactionManager?: WorkspaceEntityManager,
  ): Promise<EmailComposerResult> {
    if (transactionManager) {
      const runner = transactionManager.queryRunner;
      if (
        !runner?.isTransactionActive ||
        runner.isReleased ||
        runner.manager !== transactionManager
      )
        throw new Error('Email composer requires the supplied active manager');
    }
    const { workspaceId } = context;
    const { subject, body, files, inReplyTo } = parameters;
    let { connectedAccountId } = parameters;

    let recipients: { to: string[]; cc: string[]; bcc: string[] };

    try {
      recipients = this.normalizeRecipients(parameters);
      this.assertRecipientCountWithinLimit(recipients);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Invalid recipients';

      return {
        success: false,
        output: {
          success: false,
          message: errorMessage,
          error: errorMessage,
        },
      };
    }

    const invalidEmails = this.validateEmails(recipients);

    if (invalidEmails.length > 0) {
      return {
        success: false,
        output: {
          success: false,
          message: `Invalid email addresses: ${invalidEmails.join(', ')}`,
          error: `Invalid email addresses: ${invalidEmails.join(', ')}`,
        },
      };
    }

    const toRecipientsDisplay = recipients.to.join(', ');

    if (!connectedAccountId) {
      connectedAccountId = await this.getOrThrowFirstConnectedAccountId(
        workspaceId,
        transactionManager,
      );
    }

    const { connectedAccount, hasImapConfiguration, hasSmtpConfiguration } =
      await this.getConnectedAccountOrThrow(
        connectedAccountId,
        workspaceId,
        transactionManager,
      );

    const messageChannel =
      connectedAccount.provider === ConnectedAccountProvider.EMAIL_GROUP
        ? connectedAccount.messageChannels[0]
        : connectedAccount.messageChannels.find(
            (channel) => channel.handle === connectedAccount.handle,
          );

    const isSmtpOnlyAccount =
      connectedAccount.provider === ConnectedAccountProvider.IMAP_SMTP_CALDAV &&
      !hasImapConfiguration;

    if (isSmtpOnlyAccount && !hasSmtpConfiguration) {
      throw new EmailToolException(
        `SMTP is not configured for connected account '${connectedAccountId}'`,
        EmailToolExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    if (!isSmtpOnlyAccount && !isDefined(messageChannel)) {
      throw new EmailToolException(
        `No message channel found for connected account '${connectedAccountId}'`,
        EmailToolExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    const attachments = await this.getAttachments(
      files || [],
      workspaceId,
      transactionManager,
    );

    const { JSDOM } = await import('jsdom');
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);

    const sanitizedHtmlBody = purify.sanitize(body || '');
    const plainTextBody = toPlainText(sanitizedHtmlBody);
    const sanitizedSubject = purify.sanitize(subject || '');

    const { threadExternalId, references } =
      isDefined(inReplyTo) && isDefined(messageChannel)
        ? await this.getParentThreadContext(
            workspaceId,
            inReplyTo,
            messageChannel.id,
            transactionManager,
          )
        : {};

    return {
      success: true,
      data: {
        recipients,
        toRecipientsDisplay,
        sanitizedSubject,
        plainTextBody,
        sanitizedHtmlBody,
        attachments,
        connectedAccount,
        messageChannelId: messageChannel?.id,
        shouldPersistMessage: isDefined(messageChannel),
        inReplyTo,
        threadExternalId,
        references,
      },
    };
  }
}
