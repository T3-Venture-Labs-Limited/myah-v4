import { Injectable } from '@nestjs/common';

import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
} from 'twenty-shared/types';
import { validate as uuidValidate } from 'uuid';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
  CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
  type CampaignSenderBlockedReason,
  type CampaignSenderCandidateReadiness,
  type CampaignSenderPoolSnapshot,
  type CampaignSenderReadiness,
  type ReadyCampaignSenderReadiness,
  computeCampaignSenderPoolFingerprint,
} from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

type CampaignRecord = { id: string };

type SenderPoolRow = {
  campaignAccountId: string;
  connectedAccountId: string;
  messageChannelId: string;
  accountWorkspaceId: string | null;
  channelWorkspaceId: string | null;
  channelConnectedAccountId?: string | null;
  accountHandle: string | null;
  channelHandle: string | null;
  provider: ConnectedAccountProvider | null;
  archivedAt: Date | null;
  authFailedAt: Date | null;
  scopes: string[] | null;
  dailySendLimit: number | null;
  minimumSendIntervalMs: number | null;
  isSyncEnabled: boolean | null;
  syncStatus: MessageChannelSyncStatus | null;
  isManaged: boolean;
};

type ResolvedSenderEligibilityRow = Pick<
  SenderPoolRow,
  | 'connectedAccountId'
  | 'messageChannelId'
  | 'accountWorkspaceId'
  | 'channelWorkspaceId'
  | 'channelConnectedAccountId'
  | 'accountHandle'
  | 'channelHandle'
  | 'provider'
  | 'archivedAt'
  | 'authFailedAt'
  | 'scopes'
  | 'isSyncEnabled'
  | 'syncStatus'
  | 'isManaged'
>;

type ExactSenderResult =
  | { status: 'READY'; sender: ReadyCampaignSenderReadiness }
  | { status: 'STALE_POOL' }
  | { status: 'BLOCKED'; reason: CampaignSenderBlockedReason };

const SUPPORTED_PROVIDERS = new Set<ConnectedAccountProvider>([
  ConnectedAccountProvider.GOOGLE,
  ConnectedAccountProvider.MICROSOFT,
  ConnectedAccountProvider.IMAP_SMTP_CALDAV,
]);

const GOOGLE_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const MICROSOFT_SEND_SCOPE = 'Mail.Send';

@Injectable()
export class CampaignSenderReadinessService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async getCampaignEmailSenderPool(
    input: { campaignId: string },
    authContext: WorkspaceAuthContext,
  ): Promise<CampaignSenderPoolSnapshot> {
    return this.withAuthorizedCampaign(input, authContext, (manager) =>
      this.getCampaignEmailSenderPoolInTransaction(
        { workspaceId: authContext.workspace.id, campaignId: input.campaignId },
        manager,
      ),
    );
  }

  async resolveExactCampaignEmailSender(
    input: {
      campaignId: string;
      connectedAccountId: string;
      expectedSenderPoolFingerprint: string;
    },
    authContext: WorkspaceAuthContext,
  ): Promise<ExactSenderResult> {
    return this.withAuthorizedCampaign(input, authContext, (manager) =>
      this.resolveExactCampaignEmailSenderInTransaction(
        {
          workspaceId: authContext.workspace.id,
          ...input,
        },
        manager,
      ),
    );
  }

  evaluateCandidateSenderReadiness(
    input: ResolvedSenderEligibilityRow & { workspaceId: string },
  ): CampaignSenderCandidateReadiness {
    const { senderHandle, reason } = this.evaluateResolvedSenderBinding(
      input,
      input.workspaceId,
    );
    const common = {
      rotationPolicyId: CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
      connectedAccountId: input.connectedAccountId,
      messageChannelId: input.messageChannelId,
      senderHandle,
    };

    return reason === null
      ? { ...common, status: 'READY', reason: null }
      : { ...common, status: 'BLOCKED', reason };
  }

  async getCampaignEmailSenderPoolInTransaction(
    input: { workspaceId: string; campaignId: string },
    manager: WorkspaceEntityManager,
  ): Promise<CampaignSenderPoolSnapshot> {
    this.assertUuid('workspaceId', input.workspaceId);
    this.assertUuid('campaignId', input.campaignId);
    const queryRunner = manager.queryRunner;
    if (!queryRunner)
      throw new Error('Campaign sender pool transaction has no query runner');

    const schemaName = getWorkspaceSchemaName(input.workspaceId);
    const rows = await this.queryRows<SenderPoolRow>(
      queryRunner,
      `SELECT
          ca.id AS "campaignAccountId",
          ca."connectedAccountId",
          ca."messageChannelId",
          account."workspaceId" AS "accountWorkspaceId",
          channel."workspaceId" AS "channelWorkspaceId",
          channel."connectedAccountId" AS "channelConnectedAccountId",
          account.handle AS "accountHandle",
          channel.handle AS "channelHandle",
          account.provider,
          account."archivedAt",
          account."authFailedAt",
          account.scopes,
          account."dailySendLimit",
          account."minimumSendIntervalMs",
          channel."isSyncEnabled",
          channel."syncStatus",
          EXISTS (
            SELECT 1 FROM core."managedEmailMailbox" managed
             WHERE managed."workspaceId" = $2
               AND (managed."connectedAccountId"::text = ca."connectedAccountId"
                 OR managed."messageChannelId"::text = ca."messageChannelId")
          ) AS "isManaged"
        FROM ${this.campaignAccountTable(schemaName)} ca
        LEFT JOIN core."connectedAccount" account
          ON account.id::text = ca."connectedAccountId"
        LEFT JOIN core."messageChannel" channel
          ON channel.id::text = ca."messageChannelId"
       WHERE ca."campaignId" = $1
         AND ca.channel = 'EMAIL'
         AND ca."deletedAt" IS NULL
       ORDER BY ca."connectedAccountId", ca."messageChannelId", ca.id`,
      [input.campaignId, input.workspaceId],
    );
    const mailboxes = rows
      .map((row) => this.toReadiness(row, input.workspaceId))
      .sort((left, right) =>
        [left.connectedAccountId, left.messageChannelId]
          .join('\u0000')
          .localeCompare(
            [right.connectedAccountId, right.messageChannelId].join('\u0000'),
          ),
      );

    return {
      rotationPolicyId: CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
      serializationRevision: CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
      mailboxes,
      senderPoolFingerprint: computeCampaignSenderPoolFingerprint(mailboxes),
    };
  }

  async resolveExactCampaignEmailSenderInTransaction(
    input: {
      workspaceId: string;
      campaignId: string;
      connectedAccountId: string;
      expectedSenderPoolFingerprint: string;
    },
    manager: WorkspaceEntityManager,
  ): Promise<ExactSenderResult> {
    const snapshot = await this.getCampaignEmailSenderPoolInTransaction(
      input,
      manager,
    );
    if (snapshot.senderPoolFingerprint !== input.expectedSenderPoolFingerprint)
      return { status: 'STALE_POOL' };

    const sender = snapshot.mailboxes.find(
      (mailbox) => mailbox.connectedAccountId === input.connectedAccountId,
    );
    if (!sender) return { status: 'BLOCKED', reason: 'ACCOUNT_UNAVAILABLE' };
    if (sender.status === 'BLOCKED')
      return {
        status: 'BLOCKED',
        reason: sender.reason,
      };
    return { status: 'READY', sender };
  }

  private async withAuthorizedCampaign<T>(
    input: { campaignId: string },
    authContext: WorkspaceAuthContext,
    callback: (manager: WorkspaceEntityManager) => Promise<T>,
  ): Promise<T> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        this.assertUuid('workspaceId', authContext.workspace.id);
        this.assertUuid('campaignId', input.campaignId);
        const repository =
          await this.globalWorkspaceOrmManager.getRepository<CampaignRecord>(
            authContext.workspace.id,
            'campaign',
            this.permissionOptions(authContext),
          );
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        return dataSource.transaction(
          async (manager: WorkspaceEntityManager) => {
            if (
              !(await repository.findOne(
                { where: { id: input.campaignId } },
                manager,
              ))
            )
              throw new Error('Campaign not found');
            return callback(manager);
          },
        );
      },
      authContext,
    );
  }

  private toReadiness(
    row: SenderPoolRow,
    workspaceId: string,
  ): CampaignSenderReadiness {
    const isAccountMissing = row.accountWorkspaceId === null;
    const isChannelMissing = row.channelWorkspaceId === null;
    if (isAccountMissing || isChannelMissing) {
      return {
        bindingStatus: 'MISSING_CORE_BINDING',
        campaignAccountId: row.campaignAccountId,
        connectedAccountId: row.connectedAccountId,
        messageChannelId: row.messageChannelId,
        senderHandle: null,
        provider: null,
        dailySendLimit: null,
        minimumSendIntervalMs: null,
        status: 'BLOCKED',
        reason: 'ACCOUNT_UNAVAILABLE',
        recoveryPath: null,
        missingBinding:
          isAccountMissing && isChannelMissing
            ? 'BOTH'
            : isAccountMissing
              ? 'CONNECTED_ACCOUNT'
              : 'MESSAGE_CHANNEL',
      };
    }
    if (
      row.provider === null ||
      row.accountHandle === null ||
      row.channelHandle === null ||
      row.dailySendLimit === null ||
      row.minimumSendIntervalMs === null
    )
      throw new Error('Resolved Campaign sender binding is incomplete');

    const { senderHandle, reason } = this.evaluateResolvedSenderBinding(
      row,
      workspaceId,
    );
    const common = {
      bindingStatus: 'RESOLVED_BINDING' as const,
      campaignAccountId: row.campaignAccountId,
      connectedAccountId: row.connectedAccountId,
      messageChannelId: row.messageChannelId,
      senderHandle,
      provider: row.provider,
      recoveryPath: null,
      dailySendLimit: row.dailySendLimit,
      minimumSendIntervalMs: row.minimumSendIntervalMs,
      missingBinding: null,
    };

    return reason === null
      ? { ...common, status: 'READY', reason: null }
      : { ...common, status: 'BLOCKED', reason };
  }

  private evaluateResolvedSenderBinding(
    row: ResolvedSenderEligibilityRow,
    workspaceId: string,
  ): {
    senderHandle: string;
    reason: CampaignSenderBlockedReason | null;
  } {
    if (row.accountHandle === null || row.channelHandle === null)
      throw new Error('Resolved Campaign sender binding is incomplete');
    const senderHandle = row.channelHandle.trim().toLowerCase();

    return {
      senderHandle,
      reason: this.blockedReason(row, workspaceId, senderHandle),
    };
  }

  private blockedReason(
    row: ResolvedSenderEligibilityRow,
    workspaceId: string,
    senderHandle: string,
  ): CampaignSenderBlockedReason | null {
    if (
      row.accountWorkspaceId !== workspaceId ||
      row.channelWorkspaceId !== workspaceId
    )
      return 'WRONG_WORKSPACE';
    if (
      row.archivedAt !== null ||
      !SUPPORTED_PROVIDERS.has(row.provider as ConnectedAccountProvider) ||
      (row.channelConnectedAccountId !== undefined &&
        row.channelConnectedAccountId !== row.connectedAccountId) ||
      senderHandle === '' ||
      row.accountHandle?.trim().toLowerCase() !== senderHandle
    )
      return 'ACCOUNT_UNAVAILABLE';
    if (row.authFailedAt !== null) return 'AUTH_EXPIRED';
    if (
      row.syncStatus ===
        MessageChannelSyncStatus.FAILED_INSUFFICIENT_PERMISSIONS ||
      this.hasMissingSendPermission(row)
    )
      return 'MISSING_PERMISSION';
    if (row.isSyncEnabled !== true) return 'SYNC_DISABLED';
    if (row.syncStatus !== MessageChannelSyncStatus.ACTIVE)
      return 'ACCOUNT_UNAVAILABLE';
    if (row.isManaged) return 'UNAUTHORIZED';
    return null;
  }

  private hasMissingSendPermission(
    row: Pick<SenderPoolRow, 'provider' | 'scopes'>,
  ): boolean {
    if (row.provider === ConnectedAccountProvider.GOOGLE)
      return !row.scopes?.includes(GOOGLE_SEND_SCOPE);
    if (row.provider === ConnectedAccountProvider.MICROSOFT)
      return !row.scopes?.includes(MICROSOFT_SEND_SCOPE);
    return false;
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

  private async queryRows<T>(
    queryRunner: NonNullable<WorkspaceEntityManager['queryRunner']>,
    query: string,
    parameters: unknown[],
  ): Promise<T[]> {
    const result = await queryRunner.query(query, parameters);
    // SAFETY: the runner result is the row shape selected by the caller's static SQL.
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
}
