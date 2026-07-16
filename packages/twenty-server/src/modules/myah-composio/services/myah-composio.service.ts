import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { FieldActorSource } from 'twenty-shared/types';

const COMPOSIO_API_BASE_URL = 'https://backend.composio.dev/api/v3.1';
const INSTAGRAM_TOOLKIT_SLUG = 'instagram';

export const INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG =
  'INSTAGRAM_LIST_ALL_MESSAGES';
export const INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG =
  'INSTAGRAM_SEND_TEXT_MESSAGE';
const INSTAGRAM_GET_USER_INFO_TOOL_SLUG = 'INSTAGRAM_GET_USER_INFO';
export const buildInstagramComposioUserId = (workspaceId: string): string =>
  `workspace:${workspaceId}:instagram`;

export const buildInstagramConnectionAlias = (now = Date.now()): string =>
  `myah-instagram-${now}`;

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();

  return value ? value : undefined;
};

type ComposioLinkResponse = {
  id?: string;
  connected_account_id?: string;
  redirect_url?: string;
  redirectUrl?: string;
  link?: string;
  linkUrl?: string;
  url?: string;
};

type ComposioToolRouterSessionResponse = {
  id?: string;
  session_id?: string;
  sessionId?: string;
};

type ComposioConnectedAccount = {
  id?: string;
  nanoid?: string;
  status?: string;
  user_id?: string;
  auth_config_id?: string;
  auth_config?: {
    id?: string;
  };
  toolkit?:
    | string
    | {
        slug?: string;
      };
  created_at?: string;
  updated_at?: string;
};

type ComposioConnectedAccountsResponse = {
  items?: ComposioConnectedAccount[];
  data?: ComposioConnectedAccount[];
};

type ComposioToolExecutionResponse = {
  successful?: boolean;
  successfull?: boolean;
  data?: unknown;
  error?:
    | string
    | {
        error_subcode?: string | number;
      };
};

export type InstagramToolSlug =
  | typeof INSTAGRAM_LIST_ALL_MESSAGES_TOOL_SLUG
  | typeof INSTAGRAM_SEND_TEXT_MESSAGE_TOOL_SLUG;

export type InstagramToolExecutionResult =
  | { kind: 'success'; data: unknown }
  | { kind: 'provider_failure'; providerSubcode?: string }
  | { kind: 'unknown' };

type InstagramProfile = {
  igUserId?: string;
  username?: string;
};

const getConnectedAccountId = (
  account: ComposioConnectedAccount,
): string | undefined => account.id ?? account.nanoid;

const getToolkitSlug = (
  account: ComposioConnectedAccount,
): string | undefined =>
  typeof account.toolkit === 'string' ? account.toolkit : account.toolkit?.slug;

const getAuthConfigId = (
  account: ComposioConnectedAccount,
): string | undefined => account.auth_config_id ?? account.auth_config?.id;

const extractRedirectUrl = (body: ComposioLinkResponse): string | undefined =>
  body.redirect_url ??
  body.redirectUrl ??
  body.linkUrl ??
  body.link ??
  body.url;

const extractSessionId = (
  body: ComposioToolRouterSessionResponse,
): string | undefined => body.id ?? body.session_id ?? body.sessionId;

const toTrimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const extractInstagramProfile = (data: unknown): InstagramProfile => {
  let profile = data;

  if (typeof profile === 'string') {
    try {
      profile = JSON.parse(profile) as unknown;
    } catch {
      return {};
    }
  }

  if (!profile || typeof profile !== 'object') {
    return {};
  }

  const record = profile as Record<string, unknown>;

  return {
    igUserId: toTrimmedString(record.id),
    username: toTrimmedString(record.username),
  };
};

export type StartInstagramOAuthInput = {
  userId: string;
  callbackUrl?: string;
};

export type StartInstagramOAuthResult = {
  connectionRequestId?: string;
  redirectUrl: string;
};

export type ListInstagramAccountsInput = {
  userId: string;
  workspace?: FlatWorkspace;
};

export type InstagramAccountStatus = {
  connectedAccountId: string;
  status: string;
  composioUserId?: string;
  authConfigId?: string;
  igUserId?: string;
  username?: string;
  toolkitSlug: string;
  createdAt?: string;
  updatedAt?: string;
};

@Injectable()
export class MyahComposioService {
  private readonly logger = new Logger(MyahComposioService.name);

  constructor(
    private readonly globalWorkspaceOrmManager?: GlobalWorkspaceOrmManager,
  ) {}

  async listInstagramAccounts({
    userId,
    workspace,
  }: ListInstagramAccountsInput): Promise<InstagramAccountStatus[]> {
    const activeInstagramAccounts =
      await this.fetchActiveInstagramAccounts(userId);
    const enrichedInstagramAccounts = await Promise.all(
      activeInstagramAccounts.map((account) =>
        this.enrichInstagramAccountWithProfile(account),
      ),
    );

    await this.upsertAgentVisibleInstagramAccounts({
      accounts: enrichedInstagramAccounts,
      workspace,
    });

    return enrichedInstagramAccounts;
  }

  async getActiveInstagramAccount({
    workspaceId,
    connectedAccountId,
  }: {
    workspaceId: string;
    connectedAccountId: string;
  }): Promise<InstagramAccountStatus> {
    const userId = buildInstagramComposioUserId(workspaceId);
    const activeAccounts = await this.fetchActiveInstagramAccounts(userId);

    if (activeAccounts.length === 0) {
      throw new BadGatewayException(
        'The approved Instagram account is no longer active.',
      );
    }

    if (activeAccounts.length !== 1) {
      throw new BadGatewayException(
        'More than one active Instagram account is connected to this workspace.',
      );
    }

    const [account] = activeAccounts;

    if (account.composioUserId !== userId) {
      throw new BadGatewayException(
        'The active Instagram account could not be verified for this workspace.',
      );
    }

    if (account.connectedAccountId !== connectedAccountId) {
      throw new BadGatewayException(
        'The approved Instagram account is no longer active.',
      );
    }

    return account;
  }

  async executeInstagramTool({
    workspaceId,
    connectedAccountId,
    toolSlug,
    arguments: toolArguments,
  }: {
    workspaceId: string;
    connectedAccountId: string;
    toolSlug: InstagramToolSlug;
    arguments: Record<string, string | number>;
  }): Promise<InstagramToolExecutionResult> {
    const apiKey = getEnv('COMPOSIO_API_KEY');
    if (!apiKey) {
      return { kind: 'provider_failure' };
    }

    let response: Response;
    try {
      response = await fetch(
        `${COMPOSIO_API_BASE_URL}/tools/execute/${toolSlug}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            connected_account_id: connectedAccountId,
            user_id: buildInstagramComposioUserId(workspaceId),
            arguments: toolArguments,
          }),
        },
      );
    } catch {
      return { kind: 'unknown' };
    }

    let body: ComposioToolExecutionResponse;
    try {
      body = (await response.json()) as ComposioToolExecutionResponse;
    } catch {
      return { kind: 'unknown' };
    }

    if (
      !response.ok ||
      body.error ||
      body.successful === false ||
      body.successfull === false
    ) {
      const providerSubcode =
        typeof body.error === 'object' && body.error !== null
          ? toTrimmedString(body.error.error_subcode)?.toString() ??
            (typeof body.error.error_subcode === 'number'
              ? String(body.error.error_subcode)
              : undefined)
          : undefined;

      return { kind: 'provider_failure', providerSubcode };
    }

    return { kind: 'success', data: body.data ?? body };
  }

  private async fetchActiveInstagramAccounts(
    userId: string,
  ): Promise<InstagramAccountStatus[]> {
    const apiKey = getEnv('COMPOSIO_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException(
        'COMPOSIO_API_KEY is not configured on the Twenty server.',
      );
    }

    const query = new URLSearchParams({
      user_ids: userId,
      statuses: 'ACTIVE',
      limit: '50',
    });
    const response = await fetch(
      `${COMPOSIO_API_BASE_URL}/connected_accounts?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
      },
    );

    let body: ComposioConnectedAccountsResponse;

    try {
      body = (await response.json()) as ComposioConnectedAccountsResponse;
    } catch {
      throw new BadGatewayException('Composio returned a non-JSON response.');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        'Composio could not list Instagram connected accounts.',
      );
    }

    const accounts = body.items ?? body.data ?? [];

    return accounts
      .filter((account) => getToolkitSlug(account) === INSTAGRAM_TOOLKIT_SLUG)
      .flatMap((account): InstagramAccountStatus[] => {
        const connectedAccountId = getConnectedAccountId(account);

        if (!connectedAccountId) {
          return [];
        }

        return [
          {
            connectedAccountId,
            status: account.status ?? 'UNKNOWN',
            composioUserId: account.user_id,
            authConfigId: getAuthConfigId(account),
            toolkitSlug: INSTAGRAM_TOOLKIT_SLUG,
            createdAt: account.created_at,
            updatedAt: account.updated_at,
          },
        ];
      });
  }

  private async enrichInstagramAccountWithProfile(
    account: InstagramAccountStatus,
  ): Promise<InstagramAccountStatus> {
    if (!account.composioUserId) {
      return account;
    }

    const apiKey = getEnv('COMPOSIO_API_KEY');

    if (!apiKey) {
      return account;
    }

    let response: Response;

    try {
      response = await fetch(
        `${COMPOSIO_API_BASE_URL}/tools/execute/${INSTAGRAM_GET_USER_INFO_TOOL_SLUG}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            connected_account_id: account.connectedAccountId,
            user_id: account.composioUserId,
            arguments: { ig_user_id: 'me' },
          }),
        },
      );
    } catch {
      return account;
    }

    if (!response.ok) {
      return account;
    }

    let body: ComposioToolExecutionResponse;

    try {
      body = (await response.json()) as ComposioToolExecutionResponse;
    } catch {
      return account;
    }

    if (body.successful !== true && body.successfull !== true) {
      return account;
    }

    return {
      ...account,
      ...extractInstagramProfile(body.data),
    };
  }

  private async upsertAgentVisibleInstagramAccounts({
    accounts,
    workspace,
  }: {
    accounts: InstagramAccountStatus[];
    workspace?: FlatWorkspace;
  }): Promise<void> {
    if (
      !workspace ||
      !this.globalWorkspaceOrmManager ||
      accounts.length === 0
    ) {
      return;
    }

    const globalWorkspaceOrmManager = this.globalWorkspaceOrmManager;

    try {
      await globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
        const dataSource =
          await globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);
        const lastCheckedAt = new Date().toISOString();
        const systemActor = 'System';
        const connectedAccountIds = accounts.map(
          (account) => account.connectedAccountId,
        );
        const composioUserIds = [
          ...new Set(
            accounts
              .map((account) => account.composioUserId)
              .filter((composioUserId): composioUserId is string =>
                Boolean(composioUserId?.trim()),
              ),
          ),
        ];

        for (const composioUserId of composioUserIds) {
          await dataSource.query(
            `
              DELETE FROM "${schemaName}"."_myahInstagramAccount"
              WHERE "composioUserId" = $1
                AND NOT ("connectedAccountId" = ANY($2::text[]))
            `,
            [composioUserId, connectedAccountIds],
            undefined,
            { shouldBypassPermissionChecks: true },
          );
        }

        for (const account of accounts) {
          await dataSource.query(
            `
              INSERT INTO "${schemaName}"."_myahInstagramAccount" (
                "name",
                "label",
                "connectedAccountId",
                "composioUserId",
                "authConfigId",
                "igUserId",
                "username",
                "status",
                "lastCheckedAt",
                "lastError",
                "createdBySource",
                "createdByWorkspaceMemberId",
                "createdByName",
                "createdByContext",
                "updatedBySource",
                "updatedByWorkspaceMemberId",
                "updatedByName",
                "updatedByContext"
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17, $18
              )
              ON CONFLICT ("connectedAccountId") DO UPDATE SET
                "name" = EXCLUDED."name",
                "label" = EXCLUDED."label",
                "composioUserId" = EXCLUDED."composioUserId",
                "authConfigId" = EXCLUDED."authConfigId",
                "igUserId" = EXCLUDED."igUserId",
                "username" = EXCLUDED."username",
                "status" = EXCLUDED."status",
                "lastCheckedAt" = EXCLUDED."lastCheckedAt",
                "lastError" = EXCLUDED."lastError",
                "updatedAt" = now(),
                "updatedBySource" = EXCLUDED."updatedBySource",
                "updatedByWorkspaceMemberId" = EXCLUDED."updatedByWorkspaceMemberId",
                "updatedByName" = EXCLUDED."updatedByName",
                "updatedByContext" = EXCLUDED."updatedByContext"
            `,
            [
              account.username
                ? `@${account.username}`
                : 'Workspace Instagram account',
              account.username
                ? `@${account.username}`
                : 'Workspace Instagram account',
              account.connectedAccountId,
              account.composioUserId ?? null,
              account.authConfigId ?? null,
              account.igUserId ?? null,
              account.username ?? null,
              account.status,
              lastCheckedAt,
              null,
              FieldActorSource.SYSTEM,
              null,
              systemActor,
              {},
              FieldActorSource.SYSTEM,
              null,
              systemActor,
              {},
            ],
            undefined,
            { shouldBypassPermissionChecks: true },
          );
        }
      }, buildSystemAuthContext({ workspace }));
    } catch {
      this.logger.warn(
        'Could not mirror Instagram connected account state into the agent-visible app object table. The Settings account status response will still return the Composio connection state.',
      );
    }
  }

  async startInstagramOAuth({
    userId,
    callbackUrl,
  }: StartInstagramOAuthInput): Promise<StartInstagramOAuthResult> {
    const apiKey = getEnv('COMPOSIO_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException(
        'COMPOSIO_API_KEY is not configured on the Twenty server.',
      );
    }

    const instagramAuthConfigId = getEnv('COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID');

    if (!instagramAuthConfigId) {
      throw new InternalServerErrorException(
        'COMPOSIO_INSTAGRAM_AUTH_CONFIG_ID is not configured on the Twenty server.',
      );
    }

    const createSessionResponse = await fetch(
      `${COMPOSIO_API_BASE_URL}/tool_router/session`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          user_id: userId,
          auth_configs: {
            [INSTAGRAM_TOOLKIT_SLUG]: instagramAuthConfigId,
          },
          multi_account: {
            enable: true,
            require_explicit_selection: true,
            max_accounts_per_toolkit: 2,
          },
        }),
      },
    );

    let sessionBody: ComposioToolRouterSessionResponse;

    try {
      sessionBody =
        (await createSessionResponse.json()) as ComposioToolRouterSessionResponse;
    } catch {
      throw new BadGatewayException('Composio returned a non-JSON response.');
    }

    if (!createSessionResponse.ok) {
      throw new BadGatewayException(
        'Composio could not create an Instagram authorization session.',
      );
    }

    const sessionId = extractSessionId(sessionBody);

    if (!sessionId) {
      throw new BadGatewayException(
        'Composio did not return an Instagram authorization session ID.',
      );
    }

    const response = await fetch(
      `${COMPOSIO_API_BASE_URL}/tool_router/session/${encodeURIComponent(
        sessionId,
      )}/link`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          toolkit: INSTAGRAM_TOOLKIT_SLUG,
          alias: buildInstagramConnectionAlias(),
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        }),
      },
    );

    let body: ComposioLinkResponse;

    try {
      body = (await response.json()) as ComposioLinkResponse;
    } catch {
      throw new BadGatewayException('Composio returned a non-JSON response.');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        'Composio could not create an Instagram OAuth link.',
      );
    }

    const redirectUrl = extractRedirectUrl(body);

    if (!redirectUrl) {
      throw new BadGatewayException(
        'Composio did not return an Instagram OAuth redirect URL.',
      );
    }

    return {
      connectionRequestId: body.connected_account_id ?? body.id,
      redirectUrl,
    };
  }
}
