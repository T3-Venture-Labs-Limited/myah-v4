import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
  MessageChannelType,
} from 'twenty-shared/types';
import { emailSchema } from 'twenty-shared/utils';
import { type QueryRunner, type Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';

import {
  CampaignEmailAccountHealth,
  type CampaignEmailAccountDTO,
} from 'src/modules/myah-campaign/dtos/campaign-account.dto';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';

const INTERNAL_REPOSITORY_OPTIONS = {
  shouldBypassPermissionChecks: true,
} as const;

const SUPPORTED_PROVIDERS = new Set<ConnectedAccountProvider>([
  ConnectedAccountProvider.GOOGLE,
  ConnectedAccountProvider.MICROSOFT,
  ConnectedAccountProvider.IMAP_SMTP_CALDAV,
]);

type CampaignRecord = { id: string };
type CampaignAccountRecord = {
  id: string;
  campaignId: string;
  connectedAccountId: string;
  messageChannelId: string;
  channel: 'EMAIL';
  isDefault: boolean;
  deletedAt: Date | null;
};

type CampaignAccountMutationContext = {
  queryRunner: QueryRunner;
  workspaceId: string;
  campaignId: string;
  schemaName: string;
};

@Injectable()
export class CampaignAccountService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailMailboxEntity)
    private readonly managedEmailMailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    private readonly messagingMessageOutboundService: MessagingMessageOutboundService,
  ) {}

  async list(
    campaignId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.executeInContext(authContext, async () => {
      await this.assertCampaign(campaignId, authContext);
      return this.listInWorkspace(
        campaignId,
        authContext.workspace.id,
        authContext,
      );
    });
  }

  async candidates(
    campaignId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.executeInContext(authContext, async () => {
      await this.assertCampaign(campaignId, authContext);
      const [accounts, links] = await Promise.all([
        this.connectedAccountRepository.find({
          where: { workspaceId: authContext.workspace.id },
        }),
        this.campaignAccountRepository(authContext).then((repository) =>
          repository.find({ where: { campaignId, channel: 'EMAIL' } }),
        ),
      ]);
      const linkedIds = new Set(links.map((link) => link.connectedAccountId));
      const candidates: CampaignEmailAccountDTO[] = [];
      for (const account of accounts) {
        if (
          linkedIds.has(account.id) ||
          account.archivedAt !== null ||
          !SUPPORTED_PROVIDERS.has(account.provider) ||
          !this.isEmail(account.handle)
        )
          continue;
        const channel = await this.findExactEmailChannel(
          account,
          authContext.workspace.id,
        );
        if (!channel) continue;
        candidates.push(
          this.toDto({
            id: account.id,
            connectedAccount: account,
            messageChannel: channel,
            isDefault: false,
          }),
        );
      }
      return candidates.sort((left, right) =>
        (left.senderEmail ?? left.label).localeCompare(
          right.senderEmail ?? right.label,
        ),
      );
    });
  }

  async link(
    input: { campaignId: string; connectedAccountId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    await this.mutate(input.campaignId, authContext, async (context) => {
      const account = await this.findEligibleAccountInTransaction(
        context,
        input.connectedAccountId,
      );
      if (!account) throw new Error('Connected email account is not eligible');
      const channel = await this.findExactEmailChannelInTransaction(
        context,
        account,
      );
      if (!channel)
        throw new Error('Connected email account has no exact EMAIL channel');

      const duplicate = await this.queryRows<{ id: string }>(
        context.queryRunner,
        `SELECT id FROM ${this.campaignAccountTable(context.schemaName)}
          WHERE "campaignId" = $1 AND "connectedAccountId" = $2
            AND "channel" = 'EMAIL' AND "deletedAt" IS NULL LIMIT 1`,
        [context.campaignId, account.id],
      );
      if (duplicate.length !== 0)
        throw new Error('Connected email account is already linked');

      const active = await this.queryRows<{ id: string }>(
        context.queryRunner,
        `SELECT id FROM ${this.campaignAccountTable(context.schemaName)}
          WHERE "campaignId" = $1 AND "channel" = 'EMAIL'
            AND "deletedAt" IS NULL LIMIT 1`,
        [context.campaignId],
      );
      await context.queryRunner.query(
        `INSERT INTO ${this.campaignAccountTable(context.schemaName)}
          ("campaignId", "connectedAccountId", "messageChannelId", "channel", "isDefault")
         VALUES ($1, $2, $3, 'EMAIL', $4)`,
        [context.campaignId, account.id, channel.id, active.length === 0],
      );
    });

    return this.list(input.campaignId, authContext);
  }

  async setDefault(
    input: { campaignId: string; campaignAccountId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    await this.mutate(input.campaignId, authContext, async (context) => {
      const target = await this.queryRows<{ id: string }>(
        context.queryRunner,
        `SELECT id FROM ${this.campaignAccountTable(context.schemaName)}
          WHERE id = $1 AND "campaignId" = $2 AND "channel" = 'EMAIL'
            AND "deletedAt" IS NULL`,
        [input.campaignAccountId, context.campaignId],
      );
      if (target.length !== 1)
        throw new Error('Campaign email account not found');
      await context.queryRunner.query(
        `UPDATE ${this.campaignAccountTable(context.schemaName)}
            SET "isDefault" = false, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "campaignId" = $1 AND "channel" = 'EMAIL'
            AND "isDefault" = true AND "deletedAt" IS NULL`,
        [context.campaignId],
      );
      const updated = await this.queryRows<{ id: string }>(
        context.queryRunner,
        `UPDATE ${this.campaignAccountTable(context.schemaName)}
            SET "isDefault" = true, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $1 AND "campaignId" = $2 AND "channel" = 'EMAIL'
            AND "deletedAt" IS NULL
        RETURNING id`,
        [input.campaignAccountId, context.campaignId],
      );
      if (updated.length !== 1)
        throw new Error('Campaign email account not found');
    });

    return this.list(input.campaignId, authContext);
  }

  async remove(
    input: { campaignId: string; campaignAccountId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    await this.mutate(input.campaignId, authContext, async (context) => {
      const removed = await this.queryRows<{ id: string }>(
        context.queryRunner,
        `UPDATE ${this.campaignAccountTable(context.schemaName)}
            SET "deletedAt" = NOW(), "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $1 AND "campaignId" = $2 AND "channel" = 'EMAIL'
            AND "deletedAt" IS NULL
        RETURNING id`,
        [input.campaignAccountId, context.campaignId],
      );
      if (removed.length !== 1)
        throw new Error('Campaign email account not found');
    });

    return this.list(input.campaignId, authContext);
  }

  async resolveDefaultEmailAccount(
    campaignId: string,
    workspaceId: string,
  ): Promise<CampaignEmailAccountDTO> {
    const authContext = buildSystemAuthContext(workspaceId);
    return this.executeInContext(authContext, async () => {
      const campaignAccounts =
        await this.campaignAccountRepository(authContext);
      const defaults = await campaignAccounts.find({
        where: { campaignId, channel: 'EMAIL', isDefault: true },
      });
      if (defaults.length !== 1)
        throw new Error('Campaign has no unambiguous default email account');
      const link = defaults[0];
      const account = await this.connectedAccountRepository.findOne({
        where: {
          id: link.connectedAccountId,
          workspaceId,
        },
      });
      if (
        !account ||
        account.archivedAt !== null ||
        account.authFailedAt !== null ||
        !SUPPORTED_PROVIDERS.has(account.provider) ||
        !this.isEmail(account.handle)
      )
        throw new Error('Campaign default email account is unavailable');
      const channel = await this.findExactEmailChannel(account, workspaceId);
      if (
        !channel ||
        channel.id !== link.messageChannelId ||
        !channel.isSyncEnabled ||
        channel.syncStatus !== MessageChannelSyncStatus.ACTIVE
      )
        throw new Error('Campaign default email channel is unavailable');
      const isManaged = await this.managedEmailMailboxRepository.exists(
        workspaceId,
        {
          where: [
            { connectedAccountId: account.id },
            { messageChannelId: channel.id },
          ],
        },
      );
      if (isManaged)
        throw new Error('Campaign default email account is managed');
      await this.messagingMessageOutboundService.assertConnectedAccountSendable(
        account,
      );
      return this.toDto({
        id: link.id,
        connectedAccount: account,
        messageChannel: channel,
        isDefault: true,
      });
    });
  }

  private async mutate<T>(
    campaignId: string,
    authContext: WorkspaceAuthContext,
    callback: (context: CampaignAccountMutationContext) => Promise<T>,
  ): Promise<T> {
    return this.executeInContext(authContext, async () => {
      this.assertCampaignUpdatePermission(authContext);
      this.assertUuid('workspaceId', authContext.workspace.id);
      this.assertUuid('campaignId', campaignId);
      const dataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
      const workspaceId = authContext.workspace.id;
      const schemaName = getWorkspaceSchemaName(workspaceId);

      return dataSource.transaction(async (manager: WorkspaceEntityManager) => {
        const queryRunner = manager.queryRunner;
        if (!queryRunner)
          throw new Error('Campaign account transaction has no query runner');
        // CampaignAccount is custom-API-only: raw runner queries deliberately
        // avoid Workspace ORM events before this outer transaction commits.
        await queryRunner.query(
          'SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext(($2::uuid)::text))',
          [workspaceId, campaignId],
        );
        // WorkspaceRepository.findOne keeps row-level predicates in force and
        // accepts the transaction manager, unlike its save path. Its read and
        // every raw CampaignAccount write therefore share this QueryRunner.
        const campaignRepository = await this.campaignRepository(authContext);
        const campaign = await campaignRepository.findOne(
          { where: { id: campaignId } },
          manager,
        );
        if (!campaign) throw new Error('Campaign not found');
        return callback({
          queryRunner,
          workspaceId,
          campaignId,
          schemaName,
        });
      });
    });
  }

  private async findEligibleAccountInTransaction(
    context: CampaignAccountMutationContext,
    connectedAccountId: string,
  ): Promise<ConnectedAccountEntity | null> {
    const accounts = await this.queryRows<ConnectedAccountEntity>(
      context.queryRunner,
      `SELECT id, "workspaceId", "handle", "name", "provider", "archivedAt", "authFailedAt"
         FROM core."connectedAccount"
        WHERE id = $1 AND "workspaceId" = $2 AND "archivedAt" IS NULL`,
      [connectedAccountId, context.workspaceId],
    );
    const account = accounts[0];
    if (
      !account ||
      !SUPPORTED_PROVIDERS.has(account.provider) ||
      !this.isEmail(account.handle)
    )
      return null;
    return account;
  }

  private async findExactEmailChannelInTransaction(
    context: CampaignAccountMutationContext,
    account: ConnectedAccountEntity,
  ): Promise<MessageChannelEntity | null> {
    const channels = await this.queryRows<MessageChannelEntity>(
      context.queryRunner,
      `SELECT id, "workspaceId", "connectedAccountId", "handle", "type", "isSyncEnabled", "syncStatus"
         FROM core."messageChannel"
        WHERE "workspaceId" = $1 AND "connectedAccountId" = $2
          AND "type" = 'EMAIL' AND "handle" = $3`,
      [context.workspaceId, account.id, account.handle],
    );
    return channels.length === 1 ? channels[0] : null;
  }

  private async queryRows<T>(
    queryRunner: QueryRunner,
    query: string,
    parameters: unknown[],
  ): Promise<T[]> {
    const result = await queryRunner.query(query, parameters);

    // PostgreSQL QueryRunner returns [rows, affected] for UPDATE/DELETE and
    // rows for SELECT/INSERT. Keep every mutation decision on this runner.
    return (Array.isArray(result) && Array.isArray(result[0])
      ? result[0]
      : result) as unknown as T[];
  }

  private campaignAccountTable(schemaName: string): string {
    return `"${schemaName}"."campaignAccount"`;
  }

  private assertUuid(label: string, value: string): void {
    if (!uuidValidate(value)) throw new Error(`${label} must be a UUID`);
  }

  private async executeInContext<T>(
    authContext: WorkspaceAuthContext,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      callback,
      authContext,
    );
  }

  private permissionOptions(
    authContext: WorkspaceAuthContext,
  ): RolePermissionConfig {
    const context = getWorkspaceContext();
    const options = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      apiKeyRoleMap: context.apiKeyRoleMap,
    });
    if (!options) throw new Error('Role could not be resolved');
    return options;
  }

  private assertCampaignUpdatePermission(authContext: WorkspaceAuthContext) {
    const options = this.permissionOptions(authContext);
    if ('shouldBypassPermissionChecks' in options) return;
    const context = getWorkspaceContext();
    const objectId = context.objectIdByNameSingular.campaign;
    const isUnion = 'unionOf' in options;
    const roleIds = isUnion ? options.unionOf : options.intersectionOf;
    const allowed = roleIds.map(
      (roleId) =>
        context.permissionsPerRoleId[roleId]?.[objectId]
          ?.canUpdateObjectRecords === true,
    );
    if (isUnion ? !allowed.some(Boolean) : !allowed.every(Boolean))
      throw new Error('Campaign update permission is required');
  }

  private async campaignRepository(authContext: WorkspaceAuthContext) {
    return this.globalWorkspaceOrmManager.getRepository<CampaignRecord>(
      authContext.workspace.id,
      'campaign',
      this.permissionOptions(authContext),
    );
  }

  private async campaignAccountRepository(authContext: WorkspaceAuthContext) {
    return this.globalWorkspaceOrmManager.getRepository<CampaignAccountRecord>(
      authContext.workspace.id,
      'campaignAccount',
      INTERNAL_REPOSITORY_OPTIONS,
    );
  }

  private async assertCampaign(
    campaignId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<void> {
    const repository = await this.campaignRepository(authContext);
    if (!(await repository.findOne({ where: { id: campaignId } })))
      throw new Error('Campaign not found');
  }

  private async listInWorkspace(
    campaignId: string,
    workspaceId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    const campaignAccounts = await this.campaignAccountRepository(authContext);
    const links = await campaignAccounts.find({
      where: { campaignId, channel: 'EMAIL' },
    });
    const accounts = await Promise.all(
      links.map(async (link) => {
        const account = await this.connectedAccountRepository.findOne({
          where: { id: link.connectedAccountId, workspaceId },
        });
        const channel = account
          ? await this.messageChannelRepository.findOne({
              where: {
                id: link.messageChannelId,
                workspaceId,
                connectedAccountId: link.connectedAccountId,
                type: MessageChannelType.EMAIL,
              },
            })
          : null;
        if (!account || !channel) return this.toUnavailableDto(link);
        return this.toDto({
          id: link.id,
          connectedAccount: account,
          messageChannel: channel,
          isDefault: link.isDefault,
        });
      }),
    );
    return accounts
      .filter((account): account is CampaignEmailAccountDTO => account !== null)
      .sort((left, right) =>
        (left.senderEmail ?? left.label).localeCompare(
          right.senderEmail ?? right.label,
        ),
      );
  }

  private async findExactEmailChannel(
    account: ConnectedAccountEntity,
    workspaceId: string,
  ): Promise<MessageChannelEntity | null> {
    const channels = await this.messageChannelRepository.find({
      where: {
        workspaceId,
        connectedAccountId: account.id,
        type: MessageChannelType.EMAIL,
        handle: account.handle,
      },
    });
    return channels.length === 1 ? channels[0] : null;
  }

  private isEmail(handle: string): boolean {
    return emailSchema.safeParse(handle).success;
  }

  private toUnavailableDto(
    link: CampaignAccountRecord,
  ): CampaignEmailAccountDTO {
    return {
      id: link.id,
      connectedAccountId: link.connectedAccountId,
      messageChannelId: link.messageChannelId,
      provider: null,
      senderEmail: null,
      label: 'Unavailable email account',
      isDefault: link.isDefault,
      health: CampaignEmailAccountHealth.UNAVAILABLE,
    };
  }

  private toDto({
    id,
    connectedAccount,
    messageChannel,
    isDefault,
  }: {
    id: string;
    connectedAccount: ConnectedAccountEntity;
    messageChannel: MessageChannelEntity;
    isDefault: boolean;
  }): CampaignEmailAccountDTO {
    return {
      id,
      connectedAccountId: connectedAccount.id,
      messageChannelId: messageChannel.id,
      provider: connectedAccount.provider,
      senderEmail: messageChannel.handle,
      label: connectedAccount.name?.trim() || messageChannel.handle,
      isDefault,
      health: this.health(connectedAccount, messageChannel),
    };
  }

  private health(
    account: ConnectedAccountEntity,
    channel: MessageChannelEntity,
  ): CampaignEmailAccountHealth {
    if (account.archivedAt != null || !channel.isSyncEnabled)
      return CampaignEmailAccountHealth.UNAVAILABLE;
    if (
      account.authFailedAt != null ||
      channel.syncStatus !== MessageChannelSyncStatus.ACTIVE
    )
      return CampaignEmailAccountHealth.RECONNECT_REQUIRED;
    return CampaignEmailAccountHealth.AVAILABLE;
  }
}
