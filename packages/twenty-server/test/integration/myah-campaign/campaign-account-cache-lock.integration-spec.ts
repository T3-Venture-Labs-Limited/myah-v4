import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';

type WorkspaceRow = { id: string };
type UserWorkspaceRow = { id: string };
type CampaignAccountRow = {
  connectedAccountId: string;
  isDefault: boolean;
};
type PhysicalIndexRow = {
  indexName: string;
  isUnique: boolean;
  isValid: boolean;
  isReady: boolean;
  columns: string;
  predicate: string;
};

const execFileAsync = promisify(execFile);
const CAMPAIGN_ACCOUNT_METADATA_COMMAND =
  'upgrade:2-20:synchronize-myah-campaign-account-metadata';

const synchronizeCampaignAccountMetadata = async (workspaceId: string) => {
  await execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      CAMPAIGN_ACCOUNT_METADATA_COMMAND,
      '--workspace-id',
      workspaceId,
    ],
    { cwd: process.cwd(), env: process.env },
  );
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
  const leaseRaceCampaignId = randomUUID();
  const connectedAccountIds = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ] as const;
  const messageChannelIds = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ] as const;
  const senderEmails = connectedAccountIds.map(
    (id, index) => `myah-270-lock-${id}-${index}@example.test`,
  ) as [string, string, string, string];
  let workspaceId: string;
  let workspaceSchemaName: string;
  let userWorkspaceId: string;
  let campaignAccountService: CampaignAccountService;
  let globalWorkspaceOrmManager: GlobalWorkspaceOrmManager;

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
    globalWorkspaceOrmManager = resolveProvider(GlobalWorkspaceOrmManager);

    await synchronizeCampaignAccountMetadata(workspaceId);
    await synchronizeCampaignAccountMetadata(workspaceId);

    await global.testDataSource.query(
      `INSERT INTO "${workspaceSchemaName}"."campaign" ("id", "name")
       VALUES ($1, $2), ($3, $4)`,
      [
        campaignId,
        `MYAH-270 CacheLock ${campaignId}`,
        leaseRaceCampaignId,
        `MYAH-270 Lease Race ${leaseRaceCampaignId}`,
      ],
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
        WHERE "campaignId" = ANY($1::uuid[])`,
      [[campaignId, leaseRaceCampaignId]],
    );
    await global.testDataSource.query(
      `DELETE FROM "${workspaceSchemaName}"."campaign"
        WHERE "id" = ANY($1::uuid[])`,
      [[campaignId, leaseRaceCampaignId]],
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
        WHERE "id" = ANY($1::uuid[])`,
      [[campaignId, leaseRaceCampaignId]],
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

  it('installs the Campaign default partial unique index through the idempotent workspace command', async () => {
    const indexes = await global.testDataSource.query<PhysicalIndexRow[]>(
      `SELECT index_class.relname AS "indexName",
              index_row.indisunique AS "isUnique",
              index_row.indisvalid AS "isValid",
              index_row.indisready AS "isReady",
              string_agg(attribute.attname, ',' ORDER BY key_columns.ordinality) AS "columns",
              pg_get_expr(index_row.indpred, index_row.indrelid) AS "predicate"
         FROM pg_index AS index_row
         INNER JOIN pg_class AS table_class ON table_class.oid = index_row.indrelid
         INNER JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
         INNER JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
         INNER JOIN unnest(index_row.indkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
           ON key_columns.attnum > 0
         INNER JOIN pg_attribute AS attribute
           ON attribute.attrelid = table_class.oid
          AND attribute.attnum = key_columns.attnum
        WHERE namespace.nspname = $1
          AND table_class.relname = 'campaignAccount'
          AND index_row.indisunique
          AND pg_get_expr(index_row.indpred, index_row.indrelid) IS NOT NULL
        GROUP BY index_class.relname,
                 index_row.indisunique,
                 index_row.indisvalid,
                 index_row.indisready,
                 index_row.indpred,
                 index_row.indrelid`,
      [workspaceSchemaName],
    );
    const defaultIndex = indexes.find(
      (index) =>
        index.columns === 'campaignId,channel' &&
        index.predicate.includes('"deletedAt" IS NULL') &&
        index.predicate.includes('"isDefault" = true'),
    );

    expect(defaultIndex).toMatchObject({
      isUnique: true,
      isValid: true,
      isReady: true,
      columns: 'campaignId,channel',
    });
  });

  it('serializes simultaneous first links with the production PostgreSQL repositories and Redis lock', async () => {
    const lockKey = `campaign-account:${workspaceId}:${campaignId}`;
    const redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();

    try {
      const links = await Promise.all(
        connectedAccountIds.slice(0, 2).map((connectedAccountId) =>
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
        [...connectedAccountIds.slice(0, 2)].sort(),
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

  it('rejects direct duplicate defaults while allowing non-default and soft-deleted rows', async () => {
    const links = await global.testDataSource.query<
      Array<{ id: string; isDefault: boolean }>
    >(
      `SELECT id, "isDefault"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL
        ORDER BY "isDefault" DESC`,
      [campaignId],
    );
    const [defaultLink, nonDefaultLink] = links;
    expect(defaultLink.isDefault).toBe(true);
    expect(nonDefaultLink.isDefault).toBe(false);

    await expect(
      global.testDataSource.query(
        `UPDATE "${workspaceSchemaName}"."campaignAccount"
            SET "isDefault" = true WHERE id = $1`,
        [nonDefaultLink.id],
      ),
    ).rejects.toThrow();

    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "deletedAt" = NOW() WHERE id = $1`,
      [defaultLink.id],
    );
    const [{ defaultCount }] = await global.testDataSource.query<
      Array<{ defaultCount: string }>
    >(
      `SELECT COUNT(*)::text AS "defaultCount"
         FROM "${workspaceSchemaName}"."campaignAccount"
        WHERE "campaignId" = $1 AND "deletedAt" IS NULL AND "isDefault" = true`,
      [campaignId],
    );
    expect(defaultCount).toBe('0');

    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "isDefault" = true WHERE id = $1`,
      [nonDefaultLink.id],
    );
    await expect(
      global.testDataSource.query(
        `UPDATE "${workspaceSchemaName}"."campaignAccount"
            SET "deletedAt" = NULL WHERE id = $1`,
        [defaultLink.id],
      ),
    ).rejects.toThrow();
    await global.testDataSource.query(
      `UPDATE "${workspaceSchemaName}"."campaignAccount"
          SET "isDefault" = false WHERE id = $1`,
      [nonDefaultLink.id],
    );
  });

  it('persists the lease-overrun first-link loser as non-default through the real Redis lock and ORM', async () => {
    const redis = createClient({ url: process.env.REDIS_URL });
    await redis.connect();
    const lockKey = `integration-tests:engine:lock:campaign-account:${workspaceId}:${leaseRaceCampaignId}`;
    let releaseFirstRead: (() => void) | undefined;
    let firstReadObserved: (() => void) | undefined;
    const firstRead = new Promise<void>((resolve) => {
      firstReadObserved = resolve;
    });
    const resumeFirstRead = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let interleaved = false;
    const originalGetRepository = globalWorkspaceOrmManager.getRepository.bind(
      globalWorkspaceOrmManager,
    );
    const repositorySpy = jest
      .spyOn(globalWorkspaceOrmManager, 'getRepository')
      .mockImplementation(async (...args) => {
        const repository = await originalGetRepository(...args);
        if (args[1] !== 'campaignAccount') return repository;
        return new Proxy(repository, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property !== 'findOne' || typeof value !== 'function') {
              return value;
            }
            return async (options: { where?: Record<string, unknown> }) => {
              const result = await value.call(target, options);
              const where = options.where;
              if (
                !interleaved &&
                where?.campaignId === leaseRaceCampaignId &&
                where.channel === 'EMAIL' &&
                where.connectedAccountId === undefined &&
                where.isDefault === undefined
              ) {
                interleaved = true;
                await redis.del(lockKey);
                firstReadObserved?.();
                await resumeFirstRead;
              }
              return result;
            };
          },
        });
      });

    try {
      const firstLink = campaignAccountService.link(
        {
          campaignId: leaseRaceCampaignId,
          connectedAccountId: connectedAccountIds[2],
        },
        buildSystemAuthContext(workspaceId),
      );
      await firstRead;
      await campaignAccountService.link(
        {
          campaignId: leaseRaceCampaignId,
          connectedAccountId: connectedAccountIds[3],
        },
        buildSystemAuthContext(workspaceId),
      );
      releaseFirstRead?.();
      await firstLink;

      const persisted = await global.testDataSource.query<CampaignAccountRow[]>(
        `SELECT "connectedAccountId", "isDefault"
           FROM "${workspaceSchemaName}"."campaignAccount"
          WHERE "campaignId" = $1 AND "deletedAt" IS NULL
          ORDER BY "connectedAccountId"`,
        [leaseRaceCampaignId],
      );
      expect(persisted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            connectedAccountId: connectedAccountIds[2],
            isDefault: false,
          }),
          expect.objectContaining({
            connectedAccountId: connectedAccountIds[3],
            isDefault: true,
          }),
        ]),
      );
      expect(persisted.filter((link) => link.isDefault)).toHaveLength(1);
    } finally {
      repositorySpy.mockRestore();
      await redis.quit();
    }
  });
});
