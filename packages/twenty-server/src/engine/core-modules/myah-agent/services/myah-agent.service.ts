import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { isValidUuid } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MyahAgentSendingModeEnum,
  MyahCampaignPreferredChannelEnum,
  type MyahAgentDTO,
  type MyahCampaignAgentSettingDTO,
  type MyahCampaignInstagramAccountOptionDTO,
  type UpdateMyahAgentInput,
  type UpdateMyahCampaignAgentSettingInput,
} from 'src/engine/core-modules/myah-agent/dtos/myah-agent.dto';
import { type MyahAgentEntity } from 'src/engine/core-modules/myah-agent/entities/myah-agent.entity';
import { type MyahCampaignAgentSettingEntity } from 'src/engine/core-modules/myah-agent/entities/myah-campaign-agent-setting.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as Row[])
    : Array.isArray(value)
      ? (value as Row[])
      : [];
const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export type MyahAgentRecord = Pick<
  MyahAgentEntity,
  | 'tone'
  | 'responseLength'
  | 'language'
  | 'brandInformation'
  | 'replyRules'
  | 'escalationBoundaries'
  | 'sendingMode'
  | 'sendingModeEnabledByUserWorkspaceId'
>;

export type MyahCampaignAgentSettingRecord = Pick<
  MyahCampaignAgentSettingEntity,
  'preferredChannel' | 'requireReplyApproval'
> & {
  // The selected account, or the only connected one when none is selected.
  instagramAccountId: string | null;
};

const DEFAULT_AGENT: MyahAgentRecord = {
  tone: null,
  responseLength: null,
  language: null,
  brandInformation: null,
  replyRules: null,
  escalationBoundaries: null,
  sendingMode: 'DRAFT_FOR_APPROVAL',
  sendingModeEnabledByUserWorkspaceId: null,
};

@Injectable()
export class MyahAgentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  // System read for background work (reply agent, briefing).
  async getAgentRecord(workspaceId: string): Promise<MyahAgentRecord> {
    const [row] = rows(
      await this.dataSource.query(
        `SELECT * FROM core."myahAgent" WHERE "workspaceId"=$1`,
        [workspaceId],
      ),
    );
    if (!row) return DEFAULT_AGENT;
    return {
      tone: textOrNull(row.tone),
      responseLength: textOrNull(row.responseLength),
      language: textOrNull(row.language),
      brandInformation: textOrNull(row.brandInformation),
      replyRules: textOrNull(row.replyRules),
      escalationBoundaries: textOrNull(row.escalationBoundaries),
      sendingMode:
        row.sendingMode === 'SEND_AUTOMATICALLY'
          ? 'SEND_AUTOMATICALLY'
          : 'DRAFT_FOR_APPROVAL',
      sendingModeEnabledByUserWorkspaceId:
        typeof row.sendingModeEnabledByUserWorkspaceId === 'string'
          ? row.sendingModeEnabledByUserWorkspaceId
          : null,
    };
  }

  async getAgent(workspaceId: string): Promise<MyahAgentDTO> {
    const [row] = rows(
      await this.dataSource.query(
        `SELECT a.*, NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), '') AS "enabledByName"
           FROM core."myahAgent" a
           LEFT JOIN core."userWorkspace" uw ON uw.id = a."sendingModeEnabledByUserWorkspaceId"
           LEFT JOIN core."user" u ON u.id = uw."userId"
          WHERE a."workspaceId"=$1`,
        [workspaceId],
      ),
    );
    const record = row ? await this.getAgentRecord(workspaceId) : DEFAULT_AGENT;
    const automatic = record.sendingMode === 'SEND_AUTOMATICALLY';
    return {
      tone: record.tone,
      responseLength: record.responseLength,
      language: record.language,
      brandInformation: record.brandInformation,
      replyRules: record.replyRules,
      escalationBoundaries: record.escalationBoundaries,
      sendingMode: automatic
        ? MyahAgentSendingModeEnum.SEND_AUTOMATICALLY
        : MyahAgentSendingModeEnum.DRAFT_FOR_APPROVAL,
      sendingModeEnabledByName: automatic
        ? textOrNull(row?.enabledByName)
        : null,
      sendingModeEnabledAt:
        automatic && row?.sendingModeEnabledAt
          ? new Date(String(row.sendingModeEnabledAt))
          : null,
    };
  }

  async updateAgent(
    workspaceId: string,
    userWorkspaceId: string | undefined,
    input: UpdateMyahAgentInput,
  ): Promise<MyahAgentDTO> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO core."myahAgent" ("workspaceId") VALUES ($1)
         ON CONFLICT ("workspaceId") DO NOTHING`,
        [workspaceId],
      );
      const [current] = rows(
        await manager.query(
          `SELECT "sendingMode" FROM core."myahAgent" WHERE "workspaceId"=$1 FOR UPDATE`,
          [workspaceId],
        ),
      );
      const sets: string[] = [];
      const params: unknown[] = [workspaceId];
      const set = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`"${column}"=$${params.length}`);
      };
      for (const column of [
        'tone',
        'responseLength',
        'language',
        'brandInformation',
        'replyRules',
        'escalationBoundaries',
      ] as const) {
        if (input[column] !== undefined)
          set(column, textOrNull(input[column] ?? null));
      }
      if (
        input.sendingMode !== undefined &&
        input.sendingMode !== current?.sendingMode
      ) {
        const automatic =
          input.sendingMode === MyahAgentSendingModeEnum.SEND_AUTOMATICALLY;
        if (automatic && !userWorkspaceId)
          throw new ForbiddenException(
            'Automatic sending must be turned on by a signed-in member',
          );
        set('sendingMode', input.sendingMode);
        set(
          'sendingModeEnabledByUserWorkspaceId',
          automatic ? userWorkspaceId : null,
        );
        set('sendingModeEnabledAt', automatic ? new Date() : null);
      }
      if (sets.length === 0) return;
      await manager.query(
        `UPDATE core."myahAgent" SET ${sets.join(', ')}, "updatedAt"=now() WHERE "workspaceId"=$1`,
        params,
      );
    });
    return this.getAgent(workspaceId);
  }

  // System read for background work. Resolves the Instagram sender to the
  // selected account, or to the only connected account when none is chosen.
  async getCampaignSettingRecord(
    workspaceId: string,
    campaignId: string,
  ): Promise<MyahCampaignAgentSettingRecord> {
    const [row] = rows(
      await this.dataSource.query(
        `SELECT * FROM core."myahCampaignAgentSetting" WHERE "workspaceId"=$1 AND "campaignId"=$2`,
        [workspaceId, campaignId],
      ),
    );
    const accounts = await this.listInstagramAccounts(workspaceId);
    const selected =
      typeof row?.instagramAccountId === 'string' &&
      accounts.some((account) => account.id === row.instagramAccountId)
        ? row.instagramAccountId
        : null;
    return {
      preferredChannel:
        row?.preferredChannel === 'INSTAGRAM' ||
        row?.preferredChannel === 'EMAIL'
          ? row.preferredChannel
          : 'NO_PREFERENCE',
      requireReplyApproval: row?.requireReplyApproval === true,
      instagramAccountId:
        selected ?? (accounts.length === 1 ? accounts[0].id : null),
    };
  }

  async getCampaignSetting(
    campaignId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<MyahCampaignAgentSettingDTO> {
    await this.assertCampaign(campaignId, authContext, 'read');
    return this.toCampaignSettingDTO(authContext.workspace.id, campaignId);
  }

  async updateCampaignSetting(
    input: UpdateMyahCampaignAgentSettingInput,
    authContext: WorkspaceAuthContext,
  ): Promise<MyahCampaignAgentSettingDTO> {
    const campaign = await this.assertCampaign(
      input.campaignId,
      authContext,
      'update',
    );
    const workspaceId = authContext.workspace.id;
    if (input.instagramAccountId !== undefined) {
      if (!['DRAFT', 'PAUSED'].includes(campaign.lifecycleStatus))
        throw new ForbiddenException(
          'The Instagram account can be changed only while the Campaign is Draft or Stopped',
        );
      if (
        input.instagramAccountId !== null &&
        !(await this.listInstagramAccounts(workspaceId)).some(
          (account) => account.id === input.instagramAccountId,
        )
      )
        throw new NotFoundException('Instagram account not found');
    }
    await this.dataSource.query(
      `INSERT INTO core."myahCampaignAgentSetting"
         ("workspaceId","campaignId","instagramAccountId","preferredChannel","requireReplyApproval")
       VALUES ($1,$2,$3,COALESCE($4,'NO_PREFERENCE'),COALESCE($5,false))
       ON CONFLICT ("workspaceId","campaignId") DO UPDATE SET
         "instagramAccountId"=CASE WHEN $6 THEN EXCLUDED."instagramAccountId" ELSE "myahCampaignAgentSetting"."instagramAccountId" END,
         "preferredChannel"=COALESCE($4,"myahCampaignAgentSetting"."preferredChannel"),
         "requireReplyApproval"=COALESCE($5,"myahCampaignAgentSetting"."requireReplyApproval"),
         "updatedAt"=now()`,
      [
        workspaceId,
        input.campaignId,
        input.instagramAccountId ?? null,
        input.preferredChannel ?? null,
        input.requireReplyApproval ?? null,
        input.instagramAccountId !== undefined,
      ],
    );
    return this.toCampaignSettingDTO(workspaceId, input.campaignId);
  }

  async listInstagramAccounts(
    workspaceId: string,
  ): Promise<MyahCampaignInstagramAccountOptionDTO[]> {
    if (!isValidUuid(workspaceId)) throw new Error('Invalid workspace');
    const schema = getWorkspaceSchemaName(workspaceId);
    const [exists] = rows(
      await this.dataSource.query(
        'SELECT to_regclass($1) IS NOT NULL AS "ok"',
        [`${schema}."myahInstagramAccount"`],
      ),
    );
    if (exists?.ok !== true) return [];
    return rows(
      await this.dataSource.query(
        `SELECT id, username, status::text AS status FROM "${schema}"."myahInstagramAccount"
          WHERE "deletedAt" IS NULL AND "unipileAccountId" IS NOT NULL
            AND (status IS NULL OR status::text <> 'INACTIVE')
          ORDER BY username NULLS LAST, id`,
      ),
    ).map((row) => ({
      id: String(row.id),
      username: textOrNull(row.username),
      status: textOrNull(row.status),
    }));
  }

  private async toCampaignSettingDTO(
    workspaceId: string,
    campaignId: string,
  ): Promise<MyahCampaignAgentSettingDTO> {
    const record = await this.getCampaignSettingRecord(workspaceId, campaignId);
    return {
      campaignId,
      preferredChannel:
        record.preferredChannel as MyahCampaignPreferredChannelEnum,
      requireReplyApproval: record.requireReplyApproval,
      instagramAccountId: record.instagramAccountId,
      instagramAccountOptions: await this.listInstagramAccounts(workspaceId),
    };
  }

  private async assertCampaign(
    campaignId: string,
    authContext: WorkspaceAuthContext,
    access: 'read' | 'update',
  ): Promise<{ id: string; lifecycleStatus: string }> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const permissions = this.permissionOptions(authContext);
        if (access === 'update')
          this.assertCampaignUpdatePermission(permissions);
        const repository = await this.globalWorkspaceOrmManager.getRepository<{
          id: string;
          lifecycleStatus: string;
        }>(authContext.workspace.id, 'campaign', permissions);
        const campaign = await repository.findOne({
          where: { id: campaignId },
        });
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
      },
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
    if (!options) throw new ForbiddenException('Role could not be resolved');
    return options;
  }

  private assertCampaignUpdatePermission(options: RolePermissionConfig) {
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
      throw new ForbiddenException('Campaign update permission is required');
  }
}
