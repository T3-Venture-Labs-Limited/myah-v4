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
  toolkitSlug: string;
  createdAt?: string;
  updatedAt?: string;
};

const getAccountSortTime = (account: InstagramAccountStatus): number => {
  const value = account.updatedAt ?? account.createdAt;

  if (!value) {
    return 0;
  }

  const time = Date.parse(value);

  return Number.isNaN(time) ? 0 : time;
};

const selectCanonicalInstagramAccounts = (
  accounts: InstagramAccountStatus[],
): InstagramAccountStatus[] => {
  if (accounts.length <= 1) {
    return accounts;
  }

  return [...accounts]
    .sort((left, right) => {
      const timeDelta = getAccountSortTime(right) - getAccountSortTime(left);

      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.connectedAccountId.localeCompare(right.connectedAccountId);
    })
    .slice(0, 1);
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

    const instagramAccounts = accounts
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
    const canonicalInstagramAccounts =
      selectCanonicalInstagramAccounts(instagramAccounts);

    await this.upsertAgentVisibleInstagramAccounts({
      accounts: canonicalInstagramAccounts,
      workspace,
    });

    return canonicalInstagramAccounts;
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
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16
              )
              ON CONFLICT ("connectedAccountId") DO UPDATE SET
                "name" = EXCLUDED."name",
                "label" = EXCLUDED."label",
                "composioUserId" = EXCLUDED."composioUserId",
                "authConfigId" = EXCLUDED."authConfigId",
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
              'Workspace Instagram account',
              'Workspace Instagram account',
              account.connectedAccountId,
              account.composioUserId ?? null,
              account.authConfigId ?? null,
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
          multi_account: {
            enable: true,
            require_explicit_selection: true,
            max_accounts_per_toolkit: 1,
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
