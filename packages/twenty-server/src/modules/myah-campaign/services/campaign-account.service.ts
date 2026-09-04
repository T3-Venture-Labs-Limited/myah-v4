import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
  MessageChannelType,
} from 'twenty-shared/types';
import { emailSchema } from 'twenty-shared/utils';
import { IsNull, type Repository } from 'typeorm';

import {
  CampaignEmailAccountHealth,
  type CampaignEmailAccountDTO,
} from 'src/modules/myah-campaign/dtos/campaign-account.dto';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
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

@Injectable()
export class CampaignAccountService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
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
          where: {
            workspaceId: authContext.workspace.id,
            visibility: 'workspace',
          },
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
        left.senderEmail.localeCompare(right.senderEmail),
      );
    });
  }

  async link(
    input: { campaignId: string; connectedAccountId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.mutate(input.campaignId, authContext, async (manager) => {
      await this.assertCampaign(input.campaignId, authContext, manager);
      const account = await this.connectedAccountRepository.findOne({
        where: {
          id: input.connectedAccountId,
          workspaceId: authContext.workspace.id,
          visibility: 'workspace',
        },
      });
      if (
        !account ||
        account.archivedAt !== null ||
        !SUPPORTED_PROVIDERS.has(account.provider) ||
        !this.isEmail(account.handle)
      )
        throw new Error('Connected email account is not eligible');
      const channel = await this.findExactEmailChannel(
        account,
        authContext.workspace.id,
      );
      if (!channel)
        throw new Error('Connected email account has no exact EMAIL channel');
      const campaignAccounts =
        await this.campaignAccountRepository(authContext);
      if (
        await campaignAccounts.findOne(
          {
            where: {
              campaignId: input.campaignId,
              connectedAccountId: input.connectedAccountId,
              channel: 'EMAIL',
            },
          },
          manager,
        )
      )
        throw new Error('Connected email account is already linked');
      const hasDefault = await campaignAccounts.findOne(
        {
          where: {
            campaignId: input.campaignId,
            channel: 'EMAIL',
            isDefault: true,
          },
        },
        manager,
      );
      await campaignAccounts.save(
        campaignAccounts.create({
          campaignId: input.campaignId,
          connectedAccountId: account.id,
          messageChannelId: channel.id,
          channel: 'EMAIL',
          isDefault: !hasDefault,
        }),
        undefined,
        manager,
      );
      return this.listInWorkspace(
        input.campaignId,
        authContext.workspace.id,
        authContext,
        manager,
      );
    });
  }

  async setDefault(
    input: { campaignId: string; campaignAccountId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.mutate(input.campaignId, authContext, async (manager) => {
      await this.assertCampaign(input.campaignId, authContext, manager);
      const campaignAccounts =
        await this.campaignAccountRepository(authContext);
      const target = await campaignAccounts.findOne(
        {
          where: {
            id: input.campaignAccountId,
            campaignId: input.campaignId,
            channel: 'EMAIL',
            deletedAt: IsNull(),
          },
        },
        manager,
      );
      if (!target) throw new Error('Campaign email account not found');
      await campaignAccounts.update(
        {
          campaignId: input.campaignId,
          channel: 'EMAIL',
          isDefault: true,
          deletedAt: IsNull(),
        },
        { isDefault: false },
        undefined,
        manager,
      );
      const result = await campaignAccounts.update(
        {
          id: input.campaignAccountId,
          campaignId: input.campaignId,
          channel: 'EMAIL',
          deletedAt: IsNull(),
        },
        { isDefault: true },
        undefined,
        manager,
      );
      if (result.affected !== 1)
        throw new Error('Campaign email account not found');
      return this.listInWorkspace(
        input.campaignId,
        authContext.workspace.id,
        authContext,
        manager,
      );
    });
  }

  async remove(
    input: { campaignId: string; campaignAccountId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignEmailAccountDTO[]> {
    return this.mutate(input.campaignId, authContext, async (manager) => {
      await this.assertCampaign(input.campaignId, authContext, manager);
      const campaignAccounts =
        await this.campaignAccountRepository(authContext);
      const result = await campaignAccounts.softDelete(
        {
          id: input.campaignAccountId,
          campaignId: input.campaignId,
          channel: 'EMAIL',
          deletedAt: IsNull(),
        },
        manager,
      );
      if (result.affected !== 1)
        throw new Error('Campaign email account not found');
      return this.listInWorkspace(
        input.campaignId,
        authContext.workspace.id,
        authContext,
        manager,
      );
    });
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
          visibility: 'workspace',
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
      const channel = await this.messageChannelRepository.findOne({
        where: {
          id: link.messageChannelId,
          workspaceId,
          connectedAccountId: account.id,
          type: MessageChannelType.EMAIL,
          handle: account.handle,
        },
      });
      if (
        !channel ||
        !channel.isSyncEnabled ||
        channel.syncStatus !== MessageChannelSyncStatus.ACTIVE
      )
        throw new Error('Campaign default email channel is unavailable');
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
    callback: (manager: WorkspaceEntityManager) => Promise<T>,
  ): Promise<T> {
    return this.executeInContext(authContext, async () => {
      const dataSource =
        await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
      return dataSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `campaign-account:${authContext.workspace.id}:${campaignId}`,
        ]);
        return callback(manager as WorkspaceEntityManager);
      });
    });
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
    manager?: WorkspaceEntityManager,
  ): Promise<void> {
    const repository = await this.campaignRepository(authContext);
    if (
      !(await repository.findOne(
        manager
          ? {
              where: { id: campaignId },
              lock: { mode: 'pessimistic_write' },
            }
          : { where: { id: campaignId } },
        manager,
      ))
    )
      throw new Error('Campaign not found');
  }

  private async listInWorkspace(
    campaignId: string,
    workspaceId: string,
    authContext: WorkspaceAuthContext,
    manager?: WorkspaceEntityManager,
  ): Promise<CampaignEmailAccountDTO[]> {
    const campaignAccounts = await this.campaignAccountRepository(authContext);
    const links = await campaignAccounts.find(
      { where: { campaignId, channel: 'EMAIL' } },
      manager,
    );
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
        if (!account || !channel) return null;
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
      .sort((left, right) => left.senderEmail.localeCompare(right.senderEmail));
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
