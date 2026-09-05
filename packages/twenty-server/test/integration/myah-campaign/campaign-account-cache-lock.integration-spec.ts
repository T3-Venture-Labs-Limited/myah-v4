import { randomUUID } from 'node:crypto';

import { type Type } from '@nestjs/common';
import { createClient } from 'redis';
import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';

import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';

type WorkspaceRow = { id: string };
type UserWorkspaceRow = { id: string };
type CampaignAccountRow = {
  connectedAccountId: string;
  isDefault: boolean;
};

const resolveProvider = <T>(type: Type<T>): T => {
  const app = global.app as typeof global.app & {
    container: {
      getModules(): Map<
        string,
        {
          providers: Map<
            unknown,
            { instance: unknown; metatype?: { name: string } }
          >;
        }
      >;
    };
  };
  const provider = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.entries()])
    .find(
      ([token, wrapper]) =>
        token === type || wrapper.metatype?.name === type.name,
    )?.[1];
  if (!provider?.instance) {
    throw new Error(`Missing provider ${type.name}`);
  }
  return provider.instance as T;
};

describe('CampaignAccountService CacheLock serialization (PostgreSQL and Redis)', () => {
  const campaignId = randomUUID();
  const connectedAccountIds = [randomUUID(), randomUUID()] as const;
  const messageChannelIds = [randomUUID(), randomUUID()] as const;
  const senderEmails = [
    `myah-270-lock-${campaignId}-one@example.test`,
    `myah-270-lock-${campaignId}-two@example.test`,
  ] as const;
  let workspaceId: string;
  let workspaceSchemaName: string;
  let userWorkspaceId: string;
  let campaignAccountService: CampaignAccountService;

  beforeAll(async () => {
    const workspaces = await global.testDataSource.query<WorkspaceRow[]>(
      `SELECT "id" FROM core."workspace" ORDER BY "createdAt"`,
    );
    for (const workspace of workspaces) {
      const candidateSchemaName = getWorkspaceSchemaName(workspace.id);
      const [{ campaignTable, campaignAccountTable }] =
        await global.testDataSource.query<
          Array<{
            campaignTable: string | null;
            campaignAccountTable: string | null;
          }>
        >(
          `SELECT to_regclass(format('%I.%I', $1::text, 'campaign'))::text AS "campaignTable",
                  to_regclass(format('%I.%I', $1::text, 'campaignAccount'))::text AS "campaignAccountTable"`,
          [candidateSchemaName],
        );
      if (campaignTable !== null && campaignAccountTable !== null) {
        workspaceId = workspace.id;
        workspaceSchemaName = candidateSchemaName;
        break;
      }
    }
    if (!workspaceId || !workspaceSchemaName) {
      throw new Error(
        'A workspace with Campaign and CampaignAccount is required',
      );
    }

    const [userWorkspace] = await global.testDataSource.query<
      UserWorkspaceRow[]
    >(
      `SELECT "id"
         FROM core."userWorkspace"
        WHERE "workspaceId" = $1
        LIMIT 1`,
      [workspaceId],
    );
    if (!userWorkspace) {
      throw new Error('A workspace member is required');
    }
    userWorkspaceId = userWorkspace.id;
    campaignAccountService = resolveProvider(CampaignAccountService);

    await global.testDataSource.query(
      `INSERT INTO "${workspaceSchemaName}"."campaign" ("id", "name")
       VALUES ($1, $2)`,
      [campaignId, `MYAH-270 CacheLock ${campaignId}`],
    );
    for (const [index, connectedAccountId] of connectedAccountIds.entries()) {
      await global.testDataSource.query(
        `INSERT INTO core."connectedAccount" (
          "id", "workspaceId", "userWorkspaceId", "handle", "name", "provider", "visibility"
        ) VALUES ($1, $2, $3, $4, $5, $6, 'workspace')`,
        [
          connectedAccountId,
          workspaceId,
          userWorkspaceId,
          senderEmails[index],
          `MYAH-270 Lock Sender ${index + 1}`,
          ConnectedAccountProvider.GOOGLE,
        ],
      );
      await global.testDataSource.query(
        `INSERT INTO core."messageChannel" (
          "id", "workspaceId", "connectedAccountId", "handle", "visibility", "type",
          "pendingGroupEmailsAction", "syncStatus", "syncStage"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          messageChannelIds[index],
          workspaceId,
          connectedAccountId,
          senderEmails[index],
          MessageChannelVisibility.SHARE_EVERYTHING,
          MessageChannelType.EMAIL,
          MessageChannelPendingGroupEmailsAction.NONE,
          MessageChannelSyncStatus.ACTIVE,
          MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
        ],
      );
    }
  });

  afterAll(async () => {
    if (!workspaceId) return;
    await global.testDataSource.query(
      `DELETE FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1`,
      [campaignId],
    );
    await global.testDataSource.query(
      `DELETE FROM "${workspaceSchemaName}"."campaign" WHERE "id" = $1`,
      [campaignId],
    );
    await global.testDataSource.query(
      `DELETE FROM core."messageChannel" WHERE "id" = ANY($1::uuid[])`,
      [messageChannelIds],
    );
    await global.testDataSource.query(
      `DELETE FROM core."connectedAccount" WHERE "id" = ANY($1::uuid[])`,
      [connectedAccountIds],
    );
    const [remainingCampaigns] = await global.testDataSource.query<
      Array<{ count: number }>
    >(
      `SELECT COUNT(*)::int AS "count"
         FROM "${workspaceSchemaName}"."campaign"
        WHERE "id" = $1`,
      [campaignId],
    );
    const [remainingConnectedAccounts] = await global.testDataSource.query<
      Array<{ count: number }>
    >(
      `SELECT COUNT(*)::int AS "count"
         FROM core."connectedAccount"
        WHERE "id" = ANY($1::uuid[])`,
      [connectedAccountIds],
    );
    expect(remainingCampaigns.count).toBe(0);
    expect(remainingConnectedAccounts.count).toBe(0);
  });

  it('serializes simultaneous first links with the production PostgreSQL repositories and Redis lock', async () => {
    const lockKey = `campaign-account:${workspaceId}:${campaignId}`;
    const redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();

    try {
      const links = await Promise.all(
        connectedAccountIds.map((connectedAccountId) =>
          campaignAccountService.link(
            { campaignId, connectedAccountId },
            buildSystemAuthContext(workspaceId),
          ),
        ),
      );
      expect(links).toHaveLength(2);

      const persisted = await global.testDataSource.query<CampaignAccountRow[]>(
        `SELECT "connectedAccountId", "isDefault"
           FROM "${workspaceSchemaName}"."campaignAccount"
          WHERE "campaignId" = $1
            AND "channel" = 'EMAIL'
            AND "deletedAt" IS NULL
          ORDER BY "connectedAccountId"`,
        [campaignId],
      );
      expect(persisted).toHaveLength(2);
      expect(persisted.map((link) => link.connectedAccountId).sort()).toEqual(
        [...connectedAccountIds].sort(),
      );
      expect(persisted.filter((link) => link.isDefault)).toHaveLength(1);
      expect(
        await redis.get(`integration-tests:engine:lock:${lockKey}`),
      ).toBeNull();

      const [{ idleInTransactionCount }] = await global.testDataSource.query<
        Array<{ idleInTransactionCount: string }>
      >(
        `SELECT COUNT(*)::text AS "idleInTransactionCount"
           FROM pg_stat_activity
          WHERE datname = current_database()
            AND state = 'idle in transaction'
            AND pid <> pg_backend_pid()
            AND query LIKE $1`,
        [`%${workspaceSchemaName}%`],
      );
      expect(Number(idleInTransactionCount)).toBe(0);
    } finally {
      await redis.quit();
    }
  });
});
