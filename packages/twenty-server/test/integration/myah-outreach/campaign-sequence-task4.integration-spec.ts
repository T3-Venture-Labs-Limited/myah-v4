import { EventEmitter2 } from '@nestjs/event-emitter';
import gql from 'graphql-tag';
import { createClient } from 'redis';
import { type QueryRunner } from 'typeorm';

import { type ProcessNestedRelationsHelper } from 'src/engine/api/common/common-nested-relations-processor/process-nested-relations.helper';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { CronTriggerDeduplicationService } from 'src/engine/core-modules/cron/services/cron-trigger-deduplication.service';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { type WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WORKFLOW_CRON_TRIGGER_CACHE_KEY } from 'src/modules/workflow/workflow-trigger/automated-trigger/crons/constants/workflow-cron-trigger-cache-key.constant';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const CAMPAIGNS = {
  softCreate: '31efb608-4e9b-47c2-aaa8-a8b6cc604075',
  softDelete: 'b05e1f78-e10e-4433-bb47-c0c7c00c03e0',
  softManyOutreach: 'a1d10a7d-6604-4cec-966c-5007647bd64c',
  softManyControl: '7f7eb624-5452-470f-a8a3-1420d6988238',
  hardCreate: 'f2534d06-477e-477f-91e5-091f943f6d8f',
  hardDelete: '4e027196-4e97-4d2c-a1e8-1b465b8a45a3',
  hardManyOutreach: '6fe04fc0-9eaa-4d49-93db-90eb8ad64745',
  hardManyControl: '73b30b71-3122-4dd0-8ba0-69e09131ae96',
  replacement: '225c37d5-4061-4d94-840e-2afd4320db12',
  mixed: '3903a9fa-a0f7-42e5-a105-a60ad0839c71',
  reassociation: 'ba6053e2-d2c8-446b-af32-7e8dcff7a8aa',
} as const;
const WORKFLOWS = {
  legacy: 'c2c130a9-6c11-4acd-9f66-480cd62de416',
  mixed: 'f708e54d-bc96-4a2f-b1b6-b0b75f366d69',
  ordinary: '3a3b0d09-de6a-4a87-8bff-b6aebd1a748c',
  reassociationSource: '0a0a1c24-f17e-4ce0-9fa9-527316ae3bd8',
  reassociationOrdinary: 'e4d8000d-662e-46d7-8369-ebab004a9b10',
  reassociationCampaign: 'f29b81c2-1282-42bb-9ab9-8c172fad03b6',
  softCreate: '35c32bb1-7ae4-4a31-86f2-63fce6e9e93d',
  softDelete: 'fb30b4c5-5d35-4195-956f-9cc769e2b5a9',
  softMany: '34e72115-a407-45c3-9f84-fbed6770460d',
  hardCreate: '4488940f-196b-4dde-8030-80b43488b990',
  hardDelete: '31112b86-c1a0-46f7-811e-e7712b5b4b41',
  hardMany: 'a639112b-d969-40de-a273-34d0530a7ca5',
  replacementCreated: '18ab738f-2254-4c67-b945-b1d213beba1d',
} as const;
const VERSIONS = {
  legacyDraft: 'b5549a47-abea-4c1d-a456-6118760bec47',
  legacyActive: 'ea2c0cb8-9f5b-46da-b0dc-47184010ea5a',
  mixedLegacy: 'd91a4980-818a-43d9-a64a-d6bfb204b7ca',
  mixedNew: 'e3c7b1d6-4821-490a-afc1-7bc4c5940161',
  ordinary: '6882865b-98ec-45d8-a839-9545a94cc45a',
  reassociation: '2e850eff-f6eb-41ac-ac04-7527e43ddbb1',
  softCreate: '076e6df6-966d-45b2-ad3b-3347d37e4469',
  softDelete: '00c4bcd7-33f7-497f-84ab-51218d0fff1b',
  softMany: '18f32ce6-e11e-46da-9637-5d725ea19e10',
  hardCreate: 'c863b26b-4c02-45b5-aa3b-addc96a85861',
  hardDelete: 'ec93c01b-3d0d-424d-b56d-0fbd8d84b37a',
  hardMany: '8fd31b32-5442-4f67-b560-bcdf4ea8f99a',
  replacementCreated: '2eac1af9-2399-4ae7-a004-68de5785e15d',
} as const;
const RUNS = {
  completed: '6d31d8db-b483-49c6-bf0b-2e938318c35a',
  stopped: '63c2df67-9268-4e47-8964-129becb69bab',
  running: '2a84806d-43dc-47e8-86a9-25343b5cd2a2',
  stopping: '69c68ee2-8a73-4516-aaf0-0402f146ca92',
  failed: 'e9e5b7da-7d83-49b9-9da9-0fc44c41fb25',
  deletedFailed: '95eecd68-e42a-4c3e-9a4e-45b391604da1',
  notStarted: '87b4ccec-7a6f-4646-be18-35deaf93231b',
  enqueued: '6850aca9-2363-4467-8d71-e9756d2c0a89',
  receipt: '554eae12-9862-48b7-b878-c75c6555d267',
  ordinaryNotStarted: '9fa71445-f6b4-44e3-81e6-5806e173905d',
  ordinaryEnqueued: '01d0356f-167e-4666-8620-14dfad0080f1',
} as const;
const RECEIPT = '6b582de4-3f30-41d7-a415-61cdce33690e';
const AUTOMATED_TRIGGER = '4fb751c9-8e8d-423f-ba49-07da4297244c';
const SUFFIX = '9f006030aa504aceb448bfa0c7e7e52d';
const CONTROL = `myah_319_task4_fix1_control_${SUFFIX}`;
const BARRIER_FUNCTION = `myah_319_task4_fix1_barrier_${SUFFIX}`;
const FAILURE_FUNCTION = `myah_319_task4_fix1_failure_${SUFFIX}`;
const CAMPAIGN_TRIGGER = `myah_319_task4_fix1_campaign_barrier_${SUFFIX}`;
const WORKFLOW_TRIGGER = `myah_319_task4_fix1_workflow_barrier_${SUFFIX}`;
const FAILURE_TRIGGER = `myah_319_task4_fix1_failure_trigger_${SUFFIX}`;
const VERSION_ID_TRIGGER = `myah_319_task4_fix1_workflow_version_id_${SUFFIX}`;
const BARRIER_KEYS = [3194, 1] as const;
const LEGACY_CRON_PATTERN = '* * * * *';
const LEGACY_CRON_TRIGGER = {
  name: 'Legacy Campaign CRON',
  settings: { pattern: LEGACY_CRON_PATTERN, type: 'CUSTOM' },
  type: 'CRON',
} as const;
const sequence = { schemaVersion: 1 as const, messages: [], delaysSeconds: [] };
const APPROVED_REDIS_KEYS = [
  `integration-tests:module:workflow:workflow-run-not-started-count:${WORKSPACE_ID}`,
  `integration-tests:module:workflow:workflow-enqueue-running:${WORKSPACE_ID}`,
  `integration-tests:module:workflow:workflow:execution-soft-throttle:${WORKSPACE_ID}`,
  'integration-tests:module:workflow:workflow-cron-triggers',
] as const;
const REDIS_SENTINEL_KEY =
  'integration-tests:module:workflow:myah-319-task4-unrelated-control:9f006030aa504aceb448bfa0c7e7e52d';
const REDIS_SENTINEL_PAYLOAD =
  'task4-fix2-control-b9ed7e78-6ae6-4ac5-b8c4-077918071add';
const REDIS_SENTINEL_TTL_MS = 60 * 60 * 1000;

type RedisSnapshot = {
  capturedAt: number;
  dump: Buffer | null;
  key: string;
  pttl: number;
  type: string;
};

type EnqueueService = {
  enqueueRunsForWorkspace(args: {
    workspaceId: string;
    isCacheMode: boolean;
  }): Promise<void>;
};

type StaleService = {
  handleStaledRunsForWorkspace(workspaceId: string): Promise<void>;
};

type CronJob = {
  handle(): Promise<void>;
};

type ThrottlingService = {
  acquireWorkflowEnqueueLock(workspaceId: string): Promise<boolean>;
  getNotStartedRunsCountFromDatabase(workspaceId: string): Promise<number>;
  getRemainingRunsToEnqueueCount(workspaceId: string): Promise<number>;
  consumeRemainingRunsToEnqueueCount(
    workspaceId: string,
    count: number,
  ): Promise<void>;
  recomputeWorkflowRunNotStartedCount(workspaceId: string): Promise<void>;
};

type LegacyCleanupService = {
  replaceLegacyCampaignSequence(args: {
    authContext: ReturnType<typeof buildSystemAuthContext>;
    campaignId: string;
    expectedWorkflowId: string;
    workspaceId: string;
  }): Promise<{ workflowId: string; versionId: string }>;
};

type AccessTokenGenerator = {
  generateAccessToken(args: {
    userId: string;
    workspaceId: string;
    authProvider: 'password';
  }): Promise<{ token: string }>;
};

const resolveProvider = <T>(type: new (...args: never[]) => T): T => {
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
  const wrapper = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.entries()])
    .find(
      ([token, provider]) =>
        token === type || provider.metatype?.name === type.name,
    )?.[1];
  if (!wrapper?.instance) throw new Error(`Missing provider ${type.name}`);
  return wrapper.instance as T;
};

const resolveProviderByName = <T>(name: string): T => {
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
  const wrapper = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.values()])
    .find((provider) => provider.metatype?.name === name);
  if (!wrapper?.instance) throw new Error(`Missing provider ${name}`);
  return wrapper.instance as T;
};

const updateWorkflowVersion = gql`
  mutation Task4UpdateWorkflowVersion(
    $id: UUID!
    $data: WorkflowVersionUpdateInput!
  ) {
    updateWorkflowVersion(id: $id, data: $data) {
      id
      workflowId
    }
  }
`;
const deleteCampaign = gql`
  mutation Task4DeleteCampaign($id: UUID!) {
    deleteCampaign(id: $id) {
      id
      deletedAt
      owner {
        id
      }
    }
  }
`;
const destroyCampaign = gql`
  mutation Task4DestroyCampaign($id: UUID!) {
    destroyCampaign(id: $id) {
      id
      owner {
        id
      }
    }
  }
`;
const deleteCampaigns = gql`
  mutation Task4DeleteCampaigns($ids: [UUID!]!) {
    deleteCampaigns(filter: { id: { in: $ids } }) {
      id
      deletedAt
    }
  }
`;
const destroyCampaigns = gql`
  mutation Task4DestroyCampaigns($ids: [UUID!]!) {
    destroyCampaigns(filter: { id: { in: $ids } }) {
      id
    }
  }
`;
const replaceLegacyCampaignSequence = gql`
  mutation Task4ReplaceLegacyCampaignSequence(
    $input: ReplaceLegacyCampaignSequenceInput!
  ) {
    replaceLegacyCampaignSequence(input: $input) {
      campaignId
      workflowId
      versionId
      sequence
      lifecycleStatus
      editable
      issues {
        code
        messageId
      }
    }
  }
`;

const waitFor = async (
  description: string,
  predicate: () => Promise<boolean>,
) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
};

describe('MYAH-319 Task 4 behavioral closure (PostgreSQL)', () => {
  const schema = getWorkspaceSchemaName(WORKSPACE_ID);
  const allCampaignIds = Object.values(CAMPAIGNS);
  const allWorkflowIds = Object.values(WORKFLOWS);
  const allVersionIds = Object.values(VERSIONS);
  const allRunIds = Object.values(RUNS);
  const authContext = buildSystemAuthContext(WORKSPACE_ID);
  let token: string;
  let memberToken: string;
  let campaignSequenceService: CampaignSequenceService;
  let cleanupService: LegacyCleanupService;
  let enqueueService: EnqueueService;
  let staleService: StaleService;
  let throttlingService: ThrottlingService;
  let workflowQueue: MessageQueueService;
  let workflowCacheStorage: CacheStorageService;
  let cronJob: CronJob;
  let cronDeduplicationService: CronTriggerDeduplicationService;
  let eventSpy: jest.SpyInstance;
  let queueSpy: jest.SpyInstance;
  let barrierRunner: QueryRunner | undefined;
  let barrierResource: OwnedRunnerResource | undefined;
  let redisClient: ReturnType<typeof createClient> | undefined;
  let redisSnapshots: RedisSnapshot[] = [];
  let sentinelPreviousTtl = REDIS_SENTINEL_TTL_MS;
  let ownsFixture = false;

  type ActiveHarnessResource = {
    abort: () => Promise<void> | void;
    drain: () => Promise<void>;
    name: string;
  };
  type OwnedRunnerResource = ActiveHarnessResource & {
    finish: (commit: boolean) => Promise<void>;
    track: (operation: Promise<unknown>) => void;
  };
  type AbortableGate = ActiveHarnessResource & {
    aborted: boolean;
    release: () => void;
    setCleanup: (cleanup: () => Promise<void> | void) => void;
    track: (operation: Promise<unknown>) => void;
    wait: Promise<void>;
  };
  const HELD_GATE_ABORT_MESSAGE = 'injected Task 4 held-gate abort';
  const HARNESS_DRAIN_TIMEOUT_MS = 5_000;
  const activeHarnessResources = new Set<ActiveHarnessResource>();
  const settleWithin = async (
    operations: Promise<unknown>[],
    description: string,
  ) => {
    if (operations.length === 0) return;

    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled(operations),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out draining Task 4 harness operations: ${description}`,
                ),
              ),
            HARNESS_DRAIN_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const reportCleanupFailure = (resource: string, error: unknown) => {
    // Cleanup diagnostics must not replace the assertion that opened the gate.
    process.stderr.write(
      `Task 4 harness cleanup failed for ${resource}: ${String(error)}\n`,
    );
  };
  const createAbortableGate = (name: string): AbortableGate => {
    let resolveGate!: () => void;
    let rejectGate!: (error: Error) => void;
    let completed = false;
    let drained = false;
    let cleanup: (() => Promise<void> | void) | undefined;
    const operations: Promise<unknown>[] = [];
    const wait = new Promise<void>((resolve, reject) => {
      resolveGate = resolve;
      rejectGate = reject;
    });
    // The operation normally observes this promise; this fallback avoids an
    // unhandled rejection if setup itself fails before the operation starts.
    void wait.catch(() => undefined);

    const resource: AbortableGate = {
      abort: () => {
        if (completed) return;
        completed = true;
        resource.aborted = true;
        rejectGate(new Error(HELD_GATE_ABORT_MESSAGE));
      },
      aborted: false,
      drain: async () => {
        if (drained) return;
        if (!completed) await resource.abort();
        await settleWithin(operations, name);
        drained = true;
        try {
          if (cleanup) await cleanup();
        } finally {
          activeHarnessResources.delete(resource);
        }
      },
      name,
      release: () => {
        if (completed) return;
        completed = true;
        resolveGate();
      },
      setCleanup: (nextCleanup) => {
        cleanup = nextCleanup;
      },
      track: (operation) => {
        operations.push(operation);
      },
      wait,
    };

    activeHarnessResources.add(resource);

    return resource;
  };
  const runWithGateCleanup = async <T>(
    gate: AbortableGate,
    callback: () => Promise<T>,
  ): Promise<T> => {
    let primaryError: unknown;
    let result: T | undefined;

    try {
      result = await callback();
    } catch (error) {
      primaryError = error;
      await gate.abort();
    }

    try {
      await gate.drain();
    } catch (cleanupError) {
      if (primaryError !== undefined) {
        reportCleanupFailure(gate.name, cleanupError);
      } else {
        throw cleanupError;
      }
    }

    if (primaryError !== undefined) throw primaryError;

    return result as T;
  };
  const runWithRunnerCleanup = async <T>(
    resource: OwnedRunnerResource,
    callback: () => Promise<T>,
  ): Promise<T> => {
    let primaryError: unknown;
    let result: T | undefined;

    try {
      result = await callback();
    } catch (error) {
      primaryError = error;
      try {
        await resource.abort();
        await resource.drain();
      } catch (cleanupError) {
        reportCleanupFailure(resource.name, cleanupError);
      }
    }

    if (primaryError !== undefined) throw primaryError;

    return result as T;
  };
  const drainActiveHarnessResources = async () => {
    const resources = [...activeHarnessResources];
    const failures: unknown[] = [];

    for (const resource of resources) {
      try {
        await resource.abort();
      } catch (error) {
        failures.push(error);
        reportCleanupFailure(resource.name, error);
      }
    }
    for (const resource of resources) {
      try {
        await resource.drain();
      } catch (error) {
        failures.push(error);
        reportCleanupFailure(resource.name, error);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Task 4 harness cleanup failed: ${failures.map(String).join('; ')}`,
      );
    }
  };

  const q = <T extends object = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => global.testDataSource.query<T[]>(sql, params);
  const snapshotRedisKey = async (key: string): Promise<RedisSnapshot> => {
    if (!redisClient) throw new Error('Redis client is not connected');
    const type = await redisClient.type(key);
    const dump = await redisClient.sendCommand<Buffer | null>(['DUMP', key], {
      returnBuffers: true,
    });
    const pttl = await redisClient.pTTL(key);

    return { capturedAt: Date.now(), dump, key, pttl, type };
  };
  const restoreRedisSnapshot = async (snapshot: RedisSnapshot) => {
    if (!redisClient) throw new Error('Redis client is not connected');

    if (!snapshot.dump) {
      await redisClient.del(snapshot.key);
      return;
    }

    const elapsed = Date.now() - snapshot.capturedAt;
    const remainingTtl =
      snapshot.pttl === -1 ? 0 : Math.max(0, snapshot.pttl - elapsed);

    if (snapshot.pttl >= 0 && remainingTtl === 0) {
      await redisClient.del(snapshot.key);
      return;
    }
    await redisClient.sendCommand([
      'RESTORE',
      snapshot.key,
      String(remainingTtl),
      snapshot.dump,
      'REPLACE',
    ]);
  };
  const assertSentinelUnchanged = async () => {
    if (!redisClient) throw new Error('Redis client is not connected');

    expect(await redisClient.type(REDIS_SENTINEL_KEY)).toBe('string');
    expect(await redisClient.get(REDIS_SENTINEL_KEY)).toBe(
      REDIS_SENTINEL_PAYLOAD,
    );
    const ttl = await redisClient.pTTL(REDIS_SENTINEL_KEY);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(sentinelPreviousTtl);
    sentinelPreviousTtl = ttl;
  };
  const setMode = async (mode: string | null) => {
    await q(`UPDATE "${schema}"."${CONTROL}" SET "mode" = $1 WHERE "id" = 1`, [
      mode,
    ]);
  };
  const insertCampaign = (id: string) =>
    q(
      `INSERT INTO "${schema}"."campaign" ("id", "name", "lifecycleStatus") VALUES ($1, $2, 'DRAFT')`,
      [id, `Task 4 ${id}`],
    );
  const insertWorkflow = (
    id: string,
    campaignId: string | null,
    statuses: string[] = [],
  ) =>
    q(
      `INSERT INTO "${schema}"."workflow" ("id", "name", "position", "outreachCampaignId", "statuses") VALUES ($1, 'Task 4 workflow', 0, $2, $3)`,
      [id, campaignId, statuses],
    );
  const insertVersion = (
    id: string,
    workflowId: string,
    campaignSequence: unknown,
    status = 'DRAFT',
    trigger: unknown = null,
  ) =>
    q(
      `INSERT INTO "${schema}"."workflowVersion" ("id", "name", "workflowId", "position", "status", "trigger", "steps", "campaignSequence") VALUES ($1, 'Task 4 version', $2, 0, $3, $4::jsonb, NULL, $5::jsonb)`,
      [
        id,
        workflowId,
        status,
        trigger === null ? null : JSON.stringify(trigger),
        campaignSequence === null ? null : JSON.stringify(campaignSequence),
      ],
    );
  const insertRun = (
    id: string,
    workflowId: string,
    workflowVersionId: string,
    status: string,
    deleted = false,
    marker?: string,
  ) =>
    q(
      `INSERT INTO "${schema}"."workflowRun" ("id", "workflowId", "workflowVersionId", "status", "state", "stepLogs", "enqueuedAt", "deletedAt") VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, CASE WHEN $8 THEN now() - interval '2 hours' ELSE NULL END, CASE WHEN $7 THEN now() ELSE NULL END)`,
      [
        id,
        workflowId,
        workflowVersionId,
        status,
        JSON.stringify(
          marker
            ? { receipt: marker }
            : status === 'NOT_STARTED' || status === 'ENQUEUED'
              ? { flow: { steps: [] }, stepInfos: {} }
              : null,
        ),
        JSON.stringify(marker ? { receipt: marker } : {}),
        deleted,
        status === 'ENQUEUED',
      ],
    );
  const trackBarrierOperation = <T>(operation: Promise<T>): Promise<T> => {
    barrierResource?.track(operation);
    return operation;
  };
  const api = (
    query: typeof deleteCampaign,
    variables: Record<string, unknown>,
  ) =>
    trackBarrierOperation(makeGraphqlAPIRequest({ query, variables }, token));
  const errorText = (response: { body: unknown }) =>
    JSON.stringify(response.body);
  const replaceLegacyViaApi = (accessToken = token) => {
    const operation = (async () => {
      const response = await makeGraphqlAPIRequest(
        {
          query: replaceLegacyCampaignSequence,
          variables: {
            input: {
              campaignId: CAMPAIGNS.replacement,
              expectedWorkflowId: WORKFLOWS.legacy,
            },
          },
        },
        accessToken,
      );
      const body = response.body as {
        data?: {
          replaceLegacyCampaignSequence?: {
            versionId: string;
            workflowId: string;
          };
        };
        errors?: unknown;
      };

      expect(body.errors).toBeUndefined();
      expect(body.data?.replaceLegacyCampaignSequence).toBeDefined();

      return body.data!.replaceLegacyCampaignSequence!;
    })();

    return trackBarrierOperation(operation);
  };

  const registerOwnedRunner = async (
    ownedRunner: QueryRunner,
    name: string,
  ): Promise<OwnedRunnerResource> => {
    let transactionCompleted = false;
    let drained = false;
    const operations: Promise<unknown>[] = [];
    const pendingOperations = new Set<Promise<unknown>>();
    const [{ pid: blockerPid }] = (await ownedRunner.query(
      'SELECT pg_backend_pid()::integer AS pid',
    )) as { pid: number }[];
    const cancelBlockedOperations = async () => {
      const deadline = Date.now() + HARNESS_DRAIN_TIMEOUT_MS;
      const waiters = await q<{
        blockingPids: number[];
        depth: number;
        pid: number;
      }>(
        `WITH RECURSIVE owned_waiters(pid, depth, path) AS (
           SELECT activity.pid, 1, ARRAY[$1::integer, activity.pid]
             FROM pg_stat_activity activity
            WHERE $1::integer = ANY(pg_blocking_pids(activity.pid))
           UNION ALL
           SELECT activity.pid, blocker.depth + 1, blocker.path || activity.pid
             FROM pg_stat_activity activity
             JOIN owned_waiters blocker
               ON blocker.pid = ANY(pg_blocking_pids(activity.pid))
            WHERE NOT activity.pid = ANY(blocker.path)
         ), deepest_waiters AS (
           SELECT pid, max(depth)::integer AS depth
             FROM owned_waiters
            GROUP BY pid
         )
         SELECT waiter.pid,
                waiter.depth,
                pg_blocking_pids(waiter.pid) AS "blockingPids"
           FROM deepest_waiters waiter
          ORDER BY waiter.depth DESC, waiter.pid`,
        [blockerPid],
      );
      const waiterPids = new Set(waiters.map(({ pid }) => pid));
      const graphIsComplete =
        waiters.length === pendingOperations.size &&
        waiterPids.size === waiters.length &&
        waiters.every(
          ({ blockingPids, depth }) =>
            blockingPids.length > 0 &&
            blockingPids.every(
              (blockingPid) =>
                (depth === 1 && blockingPid === blockerPid) ||
                (depth > 1 &&
                  waiters.some(
                    (candidate) =>
                      candidate.pid === blockingPid && candidate.depth < depth,
                  )),
            ),
        );

      if (!graphIsComplete) {
        throw new Error(
          `Incomplete Task 4 blocker graph for ${name}: discovered ${waiters.length} waiter(s) for ${pendingOperations.size} pending operation(s)`,
        );
      }

      let expectedPendingOperations = pendingOperations.size;
      const depths = [...new Set(waiters.map(({ depth }) => depth))].sort(
        (left, right) => right - left,
      );

      for (const depth of depths) {
        const layerPids = waiters
          .filter((waiter) => waiter.depth === depth)
          .map(({ pid }) => pid);
        const cancellations = await q<{ cancelled: boolean; pid: number }>(
          `SELECT target.pid, pg_cancel_backend(target.pid) AS cancelled
             FROM unnest($1::integer[]) AS target(pid)`,
          [layerPids],
        );

        if (
          cancellations.length !== layerPids.length ||
          cancellations.some(({ cancelled }) => !cancelled)
        ) {
          throw new Error(
            `Failed to cancel Task 4 blocker layer ${depth} for ${name}`,
          );
        }

        expectedPendingOperations -= layerPids.length;
        let layerSettled = false;

        while (Date.now() < deadline) {
          const [active] = await q<{ count: string }>(
            `SELECT count(*)::text AS count
               FROM pg_stat_activity
              WHERE pid = ANY($1::integer[])
                AND (state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL)`,
            [layerPids],
          );

          if (
            active.count === '0' &&
            pendingOperations.size <= expectedPendingOperations
          ) {
            layerSettled = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        if (!layerSettled) {
          throw new Error(
            `Timed out settling Task 4 blocker layer ${depth} for ${name}`,
          );
        }
      }

      if (pendingOperations.size > 0) {
        throw new Error(
          `Timed out cancelling ${pendingOperations.size} Task 4 operation(s) blocked by ${name}`,
        );
      }
    };
    const releaseOwnedBlocker = async (commit: boolean) => {
      if (ownedRunner.isTransactionActive) {
        if (commit) await ownedRunner.commitTransaction();
        else await ownedRunner.rollbackTransaction();
      } else {
        await ownedRunner.query('SELECT pg_advisory_unlock($1, $2)', [
          ...BARRIER_KEYS,
        ]);
      }
      transactionCompleted = true;
    };
    const resource: OwnedRunnerResource = {
      abort: async () => {
        if (drained || transactionCompleted) return;
        // Keep the blocker held while the complete graph is snapshotted and
        // each leaf-first layer is confirmed stopped. Unlocking first could
        // authorize the mutation that failure teardown is intended to prevent.
        await cancelBlockedOperations();
        await releaseOwnedBlocker(false);
      },
      drain: async () => {
        if (drained) return;
        if (!transactionCompleted) await resource.abort();
        await settleWithin(operations, name);
        await ownedRunner.release();
        drained = true;
        if (barrierRunner === ownedRunner) barrierRunner = undefined;
        if (barrierResource === resource) barrierResource = undefined;
        activeHarnessResources.delete(resource);
      },
      finish: async (commit) => {
        if (transactionCompleted) return;
        await releaseOwnedBlocker(commit);
        await resource.drain();
      },
      name,
      track: (operation) => {
        operations.push(operation);
        pendingOperations.add(operation);
        void operation.then(
          () => pendingOperations.delete(operation),
          () => pendingOperations.delete(operation),
        );
      },
    };

    activeHarnessResources.add(resource);

    return resource;
  };
  const holdBarrier = async () => {
    barrierRunner = global.testDataSource.createQueryRunner();
    await barrierRunner.connect();
    barrierResource = await registerOwnedRunner(
      barrierRunner,
      'fixture advisory barrier',
    );
    await barrierRunner.query('SELECT pg_advisory_lock($1, $2)', [
      ...BARRIER_KEYS,
    ]);
  };
  const waitForOwnedRunnerWaiter = (
    ownedRunner: QueryRunner,
    description: string,
  ) =>
    waitFor(description, async () => {
      const [{ pid: blockerPid }] = (await ownedRunner.query(
        'SELECT pg_backend_pid()::integer AS pid',
      )) as { pid: number }[];
      const [row] = await q<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM pg_stat_activity activity
          WHERE $1::integer = ANY(pg_blocking_pids(activity.pid))`,
        [blockerPid],
      );

      return Number(row.count) > 0;
    });
  const waitForBarrier = () =>
    waitFor('fixture advisory lock waiter', async () => {
      const [row] = await q<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_locks WHERE locktype = 'advisory' AND classid = $1::oid AND objid = $2::oid AND NOT granted`,
        [...BARRIER_KEYS],
      );
      return Number(row.count) > 0;
    });
  const waitForCampaignLockWaiters = (
    campaignId: string,
    expectedCount: number,
  ) =>
    waitFor(
      `${expectedCount} exact Campaign advisory lock waiters`,
      async () => {
        const [row] = await q<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM pg_locks lock
           INNER JOIN pg_stat_activity activity ON activity.pid = lock.pid
          WHERE lock.locktype = 'advisory'
            AND lock.classid = hashtext(($1::uuid)::text)::oid
            AND lock.objid = hashtext(($2::uuid)::text)::oid
            AND NOT lock.granted
            AND activity.query LIKE 'SELECT pg_advisory_xact_lock%'`,
          [WORKSPACE_ID, campaignId],
        );

        return Number(row.count) >= expectedCount;
      },
    );
  const releaseBarrier = async () => {
    if (!barrierResource) return;
    const resource = barrierResource;
    await resource.finish(true);
    if (barrierResource === resource) barrierResource = undefined;
  };
  const createSequence = (campaignId: string) =>
    trackBarrierOperation(
      campaignSequenceService.createInitial({
        authContext,
        campaignId,
        workspaceId: WORKSPACE_ID,
      }),
    );
  const replacementScope = {
    authContext,
    campaignId: CAMPAIGNS.replacement,
    expectedWorkflowId: WORKFLOWS.legacy,
    workspaceId: WORKSPACE_ID,
  };

  beforeAll(async () => {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required');

    redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
    for (const key of APPROVED_REDIS_KEYS) {
      redisSnapshots.push(await snapshotRedisKey(key));
    }
    const sentinelSnapshot = await snapshotRedisKey(REDIS_SENTINEL_KEY);

    expect(sentinelSnapshot).toMatchObject({
      dump: null,
      pttl: -2,
      type: 'none',
    });
    await expect(
      redisClient.set(REDIS_SENTINEL_KEY, REDIS_SENTINEL_PAYLOAD, {
        NX: true,
        PX: REDIS_SENTINEL_TTL_MS,
      }),
    ).resolves.toBe('OK');
    sentinelPreviousTtl = await redisClient.pTTL(REDIS_SENTINEL_KEY);
  });

  beforeAll(async () => {
    expect(schema).toBe('workspace_1wgvd1injqtife6y4rvfbu3h5');
    const residue = await q<{ count: string }>(
      `SELECT (SELECT count(*) FROM "${schema}"."campaign" WHERE "id" = ANY($1::uuid[])) + (SELECT count(*) FROM "${schema}"."workflow" WHERE "id" = ANY($2::uuid[])) + (SELECT count(*) FROM "${schema}"."workflowVersion" WHERE "id" = ANY($3::uuid[])) + (SELECT count(*) FROM "${schema}"."workflowRun" WHERE "id" = ANY($4::uuid[])) AS count`,
      [allCampaignIds, allWorkflowIds, allVersionIds, allRunIds],
    );
    if (residue[0].count !== '0')
      throw new Error(`Task 4 fixture residue: ${residue[0].count}`);
    ownsFixture = true;

    await q(
      `CREATE TABLE "${schema}"."${CONTROL}" ("id" integer PRIMARY KEY CHECK ("id" = 1), "mode" text NULL)`,
    );
    await q(
      `INSERT INTO "${schema}"."${CONTROL}" ("id", "mode") VALUES (1, NULL)`,
    );
    await q(`CREATE FUNCTION "${schema}"."${BARRIER_FUNCTION}"() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE configured text; fixture_id uuid; mapped_id uuid;
      BEGIN
        SELECT "mode" INTO configured FROM "${schema}"."${CONTROL}" WHERE "id" = 1;
        IF TG_TABLE_NAME = 'campaign' THEN
          fixture_id := COALESCE(NEW."id", OLD."id");
          IF configured = 'campaign:' || fixture_id::text THEN PERFORM pg_advisory_xact_lock(${BARRIER_KEYS[0]}, ${BARRIER_KEYS[1]}); END IF;
          IF configured = 'campaign-fail:' || fixture_id::text THEN RAISE EXCEPTION 'injected campaign mutation failure'; END IF;
        ELSIF TG_TABLE_NAME = 'workflow' THEN
          fixture_id := NEW."outreachCampaignId";
          mapped_id := CASE fixture_id
            WHEN '${CAMPAIGNS.softCreate}' THEN '${WORKFLOWS.softCreate}'::uuid
            WHEN '${CAMPAIGNS.softDelete}' THEN '${WORKFLOWS.softDelete}'::uuid
            WHEN '${CAMPAIGNS.softManyOutreach}' THEN '${WORKFLOWS.softMany}'::uuid
            WHEN '${CAMPAIGNS.hardCreate}' THEN '${WORKFLOWS.hardCreate}'::uuid
            WHEN '${CAMPAIGNS.hardDelete}' THEN '${WORKFLOWS.hardDelete}'::uuid
            WHEN '${CAMPAIGNS.hardManyOutreach}' THEN '${WORKFLOWS.hardMany}'::uuid
            WHEN '${CAMPAIGNS.replacement}' THEN '${WORKFLOWS.replacementCreated}'::uuid
            ELSE NULL END;
          IF mapped_id IS NOT NULL AND configured IS NOT NULL THEN NEW."id" := mapped_id; END IF;
          IF configured = 'workflow:' || fixture_id::text THEN PERFORM pg_advisory_xact_lock(${BARRIER_KEYS[0]}, ${BARRIER_KEYS[1]}); END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$`);
    await q(`CREATE FUNCTION "${schema}"."${FAILURE_FUNCTION}"() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE configured text;
      BEGIN
        SELECT "mode" INTO configured FROM "${schema}"."${CONTROL}" WHERE "id" = 1;
        IF configured = 'archive-fail' AND TG_OP = 'UPDATE' AND OLD."id" = '${WORKFLOWS.legacy}'::uuid THEN RAISE EXCEPTION 'injected archive failure'; END IF;
        IF configured = 'create-fail' AND TG_OP = 'INSERT' AND NEW."outreachCampaignId" = '${CAMPAIGNS.replacement}'::uuid THEN RAISE EXCEPTION 'injected create failure'; END IF;
        RETURN NEW;
      END $$`);
    await q(
      `CREATE TRIGGER "${CAMPAIGN_TRIGGER}" BEFORE UPDATE OF "deletedAt" OR DELETE ON "${schema}"."campaign" FOR EACH ROW EXECUTE FUNCTION "${schema}"."${BARRIER_FUNCTION}"()`,
    );
    await q(
      `CREATE TRIGGER "${WORKFLOW_TRIGGER}" BEFORE INSERT ON "${schema}"."workflow" FOR EACH ROW EXECUTE FUNCTION "${schema}"."${BARRIER_FUNCTION}"()`,
    );
    await q(
      `CREATE TRIGGER "${FAILURE_TRIGGER}" BEFORE INSERT OR UPDATE ON "${schema}"."workflow" FOR EACH ROW EXECUTE FUNCTION "${schema}"."${FAILURE_FUNCTION}"()`,
    );
    await q(
      `CREATE TRIGGER "${VERSION_ID_TRIGGER}" BEFORE INSERT ON "${schema}"."workflowVersion" FOR EACH ROW EXECUTE FUNCTION "${schema}"."${BARRIER_FUNCTION}"()`,
    );
    await q(`CREATE OR REPLACE FUNCTION "${schema}"."${BARRIER_FUNCTION}"() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE configured text; fixture_id uuid; mapped_id uuid;
      BEGIN
        SELECT "mode" INTO configured FROM "${schema}"."${CONTROL}" WHERE "id" = 1;
        IF TG_TABLE_NAME = 'campaign' THEN
          fixture_id := COALESCE(NEW."id", OLD."id");
          IF configured = 'campaign:' || fixture_id::text THEN PERFORM pg_advisory_xact_lock(${BARRIER_KEYS[0]}, ${BARRIER_KEYS[1]}); END IF;
          IF configured = 'campaign-fail:' || fixture_id::text THEN RAISE EXCEPTION 'injected campaign mutation failure'; END IF;
        ELSIF TG_TABLE_NAME = 'workflow' THEN
          fixture_id := NEW."outreachCampaignId";
          mapped_id := CASE fixture_id
            WHEN '${CAMPAIGNS.softCreate}' THEN '${WORKFLOWS.softCreate}'::uuid WHEN '${CAMPAIGNS.softDelete}' THEN '${WORKFLOWS.softDelete}'::uuid WHEN '${CAMPAIGNS.softManyOutreach}' THEN '${WORKFLOWS.softMany}'::uuid WHEN '${CAMPAIGNS.hardCreate}' THEN '${WORKFLOWS.hardCreate}'::uuid WHEN '${CAMPAIGNS.hardDelete}' THEN '${WORKFLOWS.hardDelete}'::uuid WHEN '${CAMPAIGNS.hardManyOutreach}' THEN '${WORKFLOWS.hardMany}'::uuid WHEN '${CAMPAIGNS.replacement}' THEN '${WORKFLOWS.replacementCreated}'::uuid ELSE NULL END;
          IF mapped_id IS NOT NULL AND configured IS NOT NULL THEN NEW."id" := mapped_id; END IF;
          IF configured = 'workflow:' || fixture_id::text THEN PERFORM pg_advisory_xact_lock(${BARRIER_KEYS[0]}, ${BARRIER_KEYS[1]}); END IF;
        ELSIF TG_TABLE_NAME = 'workflowVersion' THEN
          mapped_id := CASE NEW."workflowId"
            WHEN '${WORKFLOWS.softCreate}' THEN '${VERSIONS.softCreate}'::uuid WHEN '${WORKFLOWS.softDelete}' THEN '${VERSIONS.softDelete}'::uuid WHEN '${WORKFLOWS.softMany}' THEN '${VERSIONS.softMany}'::uuid WHEN '${WORKFLOWS.hardCreate}' THEN '${VERSIONS.hardCreate}'::uuid WHEN '${WORKFLOWS.hardDelete}' THEN '${VERSIONS.hardDelete}'::uuid WHEN '${WORKFLOWS.hardMany}' THEN '${VERSIONS.hardMany}'::uuid WHEN '${WORKFLOWS.replacementCreated}' THEN '${VERSIONS.replacementCreated}'::uuid ELSE NULL END;
          IF mapped_id IS NOT NULL AND configured IS NOT NULL THEN NEW."id" := mapped_id; END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$`);

    const bindings = await q<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname=$1 AND t.tgname = ANY($2::text[]) AND c.relname = ANY(ARRAY['campaign','workflow','workflowVersion']) AND p.proname = ANY($3::text[])`,
      [
        schema,
        [
          CAMPAIGN_TRIGGER,
          WORKFLOW_TRIGGER,
          FAILURE_TRIGGER,
          VERSION_ID_TRIGGER,
        ].map((name) => name.slice(0, 63)),
        [BARRIER_FUNCTION, FAILURE_FUNCTION],
      ],
    );
    expect(bindings[0].count).toBe('4');

    for (const campaignId of allCampaignIds) await insertCampaign(campaignId);
    await insertWorkflow(WORKFLOWS.legacy, CAMPAIGNS.replacement, [
      'DRAFT',
      'ACTIVE',
    ]);
    await insertVersion(
      VERSIONS.legacyDraft,
      WORKFLOWS.legacy,
      null,
      'DRAFT',
      LEGACY_CRON_TRIGGER,
    );
    await insertVersion(
      VERSIONS.legacyActive,
      WORKFLOWS.legacy,
      null,
      'ACTIVE',
      LEGACY_CRON_TRIGGER,
    );
    await q(
      `INSERT INTO "${schema}"."workflowAutomatedTrigger" ("id", "type", "settings", "workflowId") VALUES ($1, 'CRON', $3::jsonb, $2)`,
      [
        AUTOMATED_TRIGGER,
        WORKFLOWS.legacy,
        JSON.stringify({ pattern: LEGACY_CRON_PATTERN }),
      ],
    );
    await insertWorkflow(WORKFLOWS.mixed, CAMPAIGNS.mixed);
    await insertVersion(VERSIONS.mixedLegacy, WORKFLOWS.mixed, null);
    await insertVersion(VERSIONS.mixedNew, WORKFLOWS.mixed, sequence);
    await insertWorkflow(WORKFLOWS.ordinary, null);
    await insertVersion(VERSIONS.ordinary, WORKFLOWS.ordinary, sequence);
    await insertWorkflow(WORKFLOWS.reassociationSource, null);
    await insertWorkflow(WORKFLOWS.reassociationOrdinary, null);
    await insertWorkflow(
      WORKFLOWS.reassociationCampaign,
      CAMPAIGNS.reassociation,
    );
    await insertVersion(
      VERSIONS.reassociation,
      WORKFLOWS.reassociationSource,
      sequence,
    );

    campaignSequenceService = resolveProvider(CampaignSequenceService);
    cleanupService = resolveProviderByName<LegacyCleanupService>(
      'LegacyCampaignSequenceCleanupWorkspaceService',
    );
    enqueueService = resolveProviderByName<EnqueueService>(
      'WorkflowRunEnqueueWorkspaceService',
    );
    staleService = resolveProviderByName<StaleService>(
      'WorkflowHandleStaledRunsWorkspaceService',
    );
    throttlingService = resolveProviderByName<ThrottlingService>(
      'WorkflowThrottlingWorkspaceService',
    );
    workflowQueue = global.app.get<MessageQueueService>(
      getQueueToken(MessageQueue.workflowQueue),
    );
    workflowCacheStorage = global.app.get<CacheStorageService>(
      CacheStorageNamespace.ModuleWorkflow,
    );
    cronJob = resolveProviderByName<CronJob>('WorkflowCronTriggerCronJob');
    cronDeduplicationService = resolveProvider(CronTriggerDeduplicationService);
    const accessTokenService =
      resolveProviderByName<AccessTokenGenerator>('AccessTokenService');

    token = (
      await accessTokenService.generateAccessToken({
        userId: USER_DATA_SEED_IDS.JANE,
        workspaceId: WORKSPACE_ID,
        authProvider: 'password',
      })
    ).token;
    memberToken = (
      await accessTokenService.generateAccessToken({
        userId: USER_DATA_SEED_IDS.JONY,
        workspaceId: WORKSPACE_ID,
        authProvider: 'password',
      })
    ).token;
    eventSpy = jest
      .spyOn(
        (
          resolveProvider(WorkspaceEventEmitter) as unknown as {
            eventEmitter: EventEmitter2;
          }
        ).eventEmitter,
        'emit',
      )
      .mockReturnValue(false);
    queueSpy = jest.spyOn(workflowQueue, 'add').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await drainActiveHarnessResources();
    await releaseBarrier();
    if (ownsFixture) await setMode(null);
    await assertSentinelUnchanged();
    jest.restoreAllMocks();
    if (ownsFixture && workflowQueue) {
      eventSpy = jest
        .spyOn(
          (
            resolveProvider(WorkspaceEventEmitter) as unknown as {
              eventEmitter: EventEmitter2;
            }
          ).eventEmitter,
          'emit',
        )
        .mockReturnValue(false);
      queueSpy = jest.spyOn(workflowQueue, 'add').mockResolvedValue(undefined);
    }
  });

  afterAll(async () => {
    await drainActiveHarnessResources();
    await releaseBarrier();
    eventSpy?.mockRestore();
    queueSpy?.mockRestore();
    if (!ownsFixture) return;
    await setMode(null);
    await q(
      `DELETE FROM "${schema}"."workflowAutomatedTrigger" WHERE "id" = $1 OR "workflowId" = ANY($2::uuid[])`,
      [AUTOMATED_TRIGGER, allWorkflowIds],
    );
    await q(
      `DELETE FROM "${schema}"."workflowRun" WHERE "id" = ANY($1::uuid[]) OR "workflowId" = ANY($2::uuid[])`,
      [allRunIds, allWorkflowIds],
    );
    await q(
      `DELETE FROM "${schema}"."workflowVersion" WHERE "id" = ANY($1::uuid[]) OR "workflowId" = ANY($2::uuid[])`,
      [allVersionIds, allWorkflowIds],
    );
    await q(
      `DELETE FROM "${schema}"."workflow" WHERE "id" = ANY($1::uuid[]) OR "outreachCampaignId" = ANY($2::uuid[])`,
      [allWorkflowIds, allCampaignIds],
    );
    await q(`DELETE FROM "${schema}"."campaign" WHERE "id" = ANY($1::uuid[])`, [
      allCampaignIds,
    ]);
    await q(
      `DROP TRIGGER IF EXISTS "${VERSION_ID_TRIGGER}" ON "${schema}"."workflowVersion"`,
    );
    await q(
      `DROP TRIGGER IF EXISTS "${FAILURE_TRIGGER}" ON "${schema}"."workflow"`,
    );
    await q(
      `DROP TRIGGER IF EXISTS "${WORKFLOW_TRIGGER}" ON "${schema}"."workflow"`,
    );
    await q(
      `DROP TRIGGER IF EXISTS "${CAMPAIGN_TRIGGER}" ON "${schema}"."campaign"`,
    );
    await q(`DROP FUNCTION IF EXISTS "${schema}"."${FAILURE_FUNCTION}"()`);
    await q(`DROP FUNCTION IF EXISTS "${schema}"."${BARRIER_FUNCTION}"()`);
    await q(`DROP TABLE IF EXISTS "${schema}"."${CONTROL}"`);
    const [remaining] = await q<{ fixtures: string; controls: string }>(
      `SELECT ((SELECT count(*) FROM "${schema}"."campaign" WHERE "id" = ANY($1::uuid[])) + (SELECT count(*) FROM "${schema}"."workflow" WHERE "id" = ANY($2::uuid[])) + (SELECT count(*) FROM "${schema}"."workflowVersion" WHERE "id" = ANY($3::uuid[])) + (SELECT count(*) FROM "${schema}"."workflowRun" WHERE "id" = ANY($4::uuid[])))::text AS fixtures, (SELECT count(*)::text FROM pg_trigger WHERE tgname = ANY($5::text[])) AS controls`,
      [
        allCampaignIds,
        allWorkflowIds,
        allVersionIds,
        allRunIds,
        [
          CAMPAIGN_TRIGGER,
          WORKFLOW_TRIGGER,
          FAILURE_TRIGGER,
          VERSION_ID_TRIGGER,
        ].map((name) => name.slice(0, 63)),
      ],
    );
    expect(remaining).toEqual({ fixtures: '0', controls: '0' });
    const [workspace] = await q<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM core."workspace" WHERE "id"=$1) AS present`,
      [WORKSPACE_ID],
    );
    expect(workspace.present).toBe(true);
  });

  afterAll(async () => {
    if (!redisClient) return;

    let failure: unknown;

    try {
      await assertSentinelUnchanged();
    } catch (error) {
      failure = error;
    }

    try {
      await redisClient.del(REDIS_SENTINEL_KEY);
      for (const snapshot of redisSnapshots) {
        await restoreRedisSnapshot(snapshot);
      }
      for (const snapshot of redisSnapshots) {
        const restored = await snapshotRedisKey(snapshot.key);
        const expiredByElapsedBaseline =
          snapshot.pttl >= 0 &&
          Date.now() - snapshot.capturedAt >= snapshot.pttl;

        if (expiredByElapsedBaseline || snapshot.dump === null) {
          expect(restored).toMatchObject({
            dump: null,
            pttl: -2,
            type: 'none',
          });
        } else {
          expect(restored.type).toBe(snapshot.type);
          expect(restored.dump?.equals(snapshot.dump)).toBe(true);
          if (snapshot.pttl === -1) expect(restored.pttl).toBe(-1);
          else expect(restored.pttl).toBeGreaterThan(0);
        }
      }
      expect(await redisClient.type(REDIS_SENTINEL_KEY)).toBe('none');
      expect(await redisClient.pTTL(REDIS_SENTINEL_KEY)).toBe(-2);
    } catch (error) {
      failure ??= error;
    } finally {
      try {
        await redisClient.quit();
      } catch (error) {
        failure ??= error;
      }
      redisClient = undefined;
      redisSnapshots = [];
    }

    if (failure) throw failure;
  });

  it('blocks public WorkflowVersion reassociation to Campaign ownership and permits ordinary reassociation', async () => {
    for (const [id, data] of [
      [VERSIONS.reassociation, { workflowId: WORKFLOWS.reassociationCampaign }],
      [
        VERSIONS.reassociation,
        {
          workflow: {
            connect: { where: { id: WORKFLOWS.reassociationCampaign } },
          },
        },
      ],
      [VERSIONS.mixedNew, { workflow: { disconnect: true } }],
    ] as const) {
      const response = await api(updateWorkflowVersion, { id, data });
      expect(errorText(response)).toContain('Use the Campaign sequence editor');
    }
    let [row] = await q<{ workflowId: string }>(
      `SELECT "workflowId" FROM "${schema}"."workflowVersion" WHERE "id"=$1`,
      [VERSIONS.reassociation],
    );
    expect(row.workflowId).toBe(WORKFLOWS.reassociationSource);
    const response = await api(updateWorkflowVersion, {
      id: VERSIONS.reassociation,
      data: {
        workflow: {
          connect: { where: { id: WORKFLOWS.reassociationOrdinary } },
        },
      },
    });
    expect(response.body.errors).toBeUndefined();
    [row] = await q<{ workflowId: string }>(
      `SELECT "workflowId" FROM "${schema}"."workflowVersion" WHERE "id"=$1`,
      [VERSIONS.reassociation],
    );
    expect(row.workflowId).toBe(WORKFLOWS.reassociationOrdinary);
  });

  it('rejects an unauthenticated replacement request without changing persisted legacy state', async () => {
    const before = await q<{ liveVersions: string; workflowDeleted: boolean }>(
      `SELECT (SELECT count(*)::text FROM "${schema}"."workflowVersion" WHERE "workflowId"=$1 AND "deletedAt" IS NULL) AS "liveVersions", "deletedAt" IS NOT NULL AS "workflowDeleted" FROM "${schema}"."workflow" WHERE "id"=$1`,
      [WORKFLOWS.legacy],
    );
    const response = await makeGraphqlAPIRequest(
      {
        query: replaceLegacyCampaignSequence,
        variables: {
          input: {
            campaignId: CAMPAIGNS.replacement,
            expectedWorkflowId: WORKFLOWS.legacy,
          },
        },
      },
      'invalid-task4-token',
    );

    expect(response.body.errors).toBeDefined();
    expect(
      await q<{ liveVersions: string; workflowDeleted: boolean }>(
        `SELECT (SELECT count(*)::text FROM "${schema}"."workflowVersion" WHERE "workflowId"=$1 AND "deletedAt" IS NULL) AS "liveVersions", "deletedAt" IS NOT NULL AS "workflowDeleted" FROM "${schema}"."workflow" WHERE "id"=$1`,
        [WORKFLOWS.legacy],
      ),
    ).toEqual(before);
  });

  it.each([
    [
      'soft create-first',
      CAMPAIGNS.softCreate,
      WORKFLOWS.softCreate,
      deleteCampaign,
    ],
    [
      'hard create-first',
      CAMPAIGNS.hardCreate,
      WORKFLOWS.hardCreate,
      destroyCampaign,
    ],
  ] as const)(
    '%s serializes creation before parent mutation and rejects deletion',
    async (_name, campaignId, expectedWorkflowId, mutation) => {
      await setMode(`workflow:${campaignId}`);
      await holdBarrier();
      const creation = createSequence(campaignId);
      await waitForBarrier();
      const deletion = api(mutation, { id: campaignId }).then(
        (response) => response,
      );
      await waitForCampaignLockWaiters(campaignId, 1);
      await releaseBarrier();
      const created = await creation;
      expect(created.workflowId).toBe(expectedWorkflowId);
      eventSpy.mockClear();
      const deletionResponse = await deletion;
      expect(errorText(deletionResponse)).toContain(
        'Campaigns with outreach definitions cannot be deleted',
      );
      expect(eventSpy).not.toHaveBeenCalled();
      const [campaign] = await q<{ deletedAt: string | null }>(
        `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id"=$1`,
        [campaignId],
      );
      expect(campaign.deletedAt).toBeNull();
    },
  );

  it.each([
    ['soft delete-first', CAMPAIGNS.softDelete, deleteCampaign, false],
    ['hard delete-first', CAMPAIGNS.hardDelete, destroyCampaign, true],
  ] as const)(
    '%s commits parent mutation before creation rechecks and leaves no orphan',
    async (_name, campaignId, mutation, hard) => {
      await setMode(`campaign:${campaignId}`);
      await holdBarrier();
      eventSpy.mockClear();
      const deletion = api(mutation, { id: campaignId }).then(
        (response) => response,
      );
      await waitForBarrier();
      expect(eventSpy).not.toHaveBeenCalled();
      const creation = createSequence(campaignId);
      await waitForCampaignLockWaiters(campaignId, 1);
      await releaseBarrier();
      expect((await deletion).body.errors).toBeUndefined();
      await expect(creation).rejects.toThrow();
      expect(JSON.stringify(eventSpy.mock.calls)).toContain(campaignId);
      const workflows = await q(
        `SELECT "id" FROM "${schema}"."workflow" WHERE "outreachCampaignId"=$1`,
        [campaignId],
      );
      expect(workflows).toHaveLength(0);
      const campaigns = await q<{ deletedAt: string | null }>(
        `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id"=$1`,
        [campaignId],
      );
      expect(
        hard ? campaigns.length === 0 : campaigns[0].deletedAt !== null,
      ).toBeTruthy();
    },
  );

  it.each([
    [
      'soft many',
      CAMPAIGNS.softManyOutreach,
      CAMPAIGNS.softManyControl,
      WORKFLOWS.softMany,
      deleteCampaigns,
      false,
    ],
    [
      'hard many',
      CAMPAIGNS.hardManyOutreach,
      CAMPAIGNS.hardManyControl,
      WORKFLOWS.hardMany,
      destroyCampaigns,
      true,
    ],
  ] as const)(
    '%s serializes outreach creation before the parent batch and rejects all selected parents atomically',
    async (
      _name,
      outreachId,
      controlId,
      expectedWorkflowId,
      mutation,
      hard,
    ) => {
      await setMode(`workflow:${outreachId}`);
      await holdBarrier();
      const creation = createSequence(outreachId);

      await waitForBarrier();
      eventSpy.mockClear();
      const rejectedRequest = api(mutation, {
        ids: [controlId, outreachId],
      }).then((response) => response);

      await waitForCampaignLockWaiters(outreachId, 1);
      await releaseBarrier();
      const created = await creation;
      const rejected = await rejectedRequest;

      expect(created.workflowId).toBe(expectedWorkflowId);
      expect(errorText(rejected)).toContain(
        'Campaigns with outreach definitions cannot be deleted',
      );
      expect(eventSpy).not.toHaveBeenCalled();
      const rows = await q<{ deletedAt: string | null }>(
        `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id" = ANY($1::uuid[])`,
        [[controlId, outreachId]],
      );

      expect(rows).toHaveLength(2);
      expect(rows.every(({ deletedAt }) => deletedAt === null)).toBe(true);
      const controlMutation =
        mutation === deleteCampaigns ? deleteCampaign : destroyCampaign;
      const allowed = await api(controlMutation, { id: controlId });

      expect(allowed.body.errors).toBeUndefined();
      const controlRows = await q<{ deletedAt: string | null }>(
        `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id"=$1`,
        [controlId],
      );

      expect(
        hard ? controlRows.length === 0 : controlRows[0].deletedAt !== null,
      ).toBe(true);
    },
  );

  it.each([
    [
      'soft many delete-first',
      CAMPAIGNS.softManyOutreach,
      CAMPAIGNS.softManyControl,
      WORKFLOWS.softMany,
      deleteCampaigns,
      false,
    ],
    [
      'hard many delete-first',
      CAMPAIGNS.hardManyOutreach,
      CAMPAIGNS.hardManyControl,
      WORKFLOWS.hardMany,
      destroyCampaigns,
      true,
    ],
  ] as const)(
    '%s serializes the parent batch before creation and remains all-or-none',
    async (_name, outreachId, controlId, workflowId, mutation, hard) => {
      await q(
        `DELETE FROM "${schema}"."workflowVersion" WHERE "workflowId"=$1`,
        [workflowId],
      );
      await q(`DELETE FROM "${schema}"."workflow" WHERE "id"=$1`, [workflowId]);
      const existing = await q<{ id: string }>(
        `SELECT "id" FROM "${schema}"."campaign" WHERE "id" = ANY($1::uuid[])`,
        [[outreachId, controlId]],
      );
      const existingIds = new Set(existing.map(({ id }) => id));

      for (const campaignId of [outreachId, controlId]) {
        if (existingIds.has(campaignId)) {
          await q(
            `UPDATE "${schema}"."campaign" SET "deletedAt"=NULL WHERE "id"=$1`,
            [campaignId],
          );
        } else {
          await insertCampaign(campaignId);
        }
      }

      await setMode(`campaign:${outreachId}`);
      await holdBarrier();
      eventSpy.mockClear();
      const deletion = api(mutation, {
        ids: [controlId, outreachId],
      }).then((response) => response);

      await waitForBarrier();
      expect(eventSpy).not.toHaveBeenCalled();
      const creation = createSequence(outreachId);

      await waitForCampaignLockWaiters(outreachId, 1);
      await releaseBarrier();
      expect((await deletion).body.errors).toBeUndefined();
      await expect(creation).rejects.toThrow();
      expect(JSON.stringify(eventSpy.mock.calls)).toContain(outreachId);
      const workflows = await q(
        `SELECT "id" FROM "${schema}"."workflow" WHERE "outreachCampaignId"=$1`,
        [outreachId],
      );
      expect(workflows).toHaveLength(0);
      const campaigns = await q<{ deletedAt: string | null }>(
        `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id" = ANY($1::uuid[])`,
        [[outreachId, controlId]],
      );
      expect(
        hard
          ? campaigns.length === 0
          : campaigns.length === 2 &&
              campaigns.every(({ deletedAt }) => deletedAt !== null),
      ).toBe(true);
    },
  );

  it('cancels an advisory-held creation and its transitive deletion on forced assertion failure without committing or leaking', async () => {
    const campaignId = CAMPAIGNS.softCreate;

    await q(`DELETE FROM "${schema}"."workflowVersion" WHERE "workflowId"=$1`, [
      WORKFLOWS.softCreate,
    ]);
    await q(`DELETE FROM "${schema}"."workflow" WHERE "id"=$1`, [
      WORKFLOWS.softCreate,
    ]);
    await q(
      `INSERT INTO "${schema}"."campaign" ("id", "name", "lifecycleStatus", "deletedAt") VALUES ($1, $2, 'DRAFT', NULL) ON CONFLICT ("id") DO UPDATE SET "deletedAt"=NULL`,
      [campaignId, 'Task 4 advisory cancellation'],
    );
    await setMode(`workflow:${campaignId}`);
    await holdBarrier();
    const resource = barrierResource!;

    eventSpy.mockClear();
    queueSpy.mockClear();
    const creation = createSequence(campaignId);

    await waitForBarrier();
    const deletion = api(deleteCampaign, { id: campaignId });

    await waitForCampaignLockWaiters(campaignId, 1);
    await expect(
      runWithRunnerCleanup(resource, async () => {
        throw new Error('simulated advisory-held assertion failure');
      }),
    ).rejects.toThrow('simulated advisory-held assertion failure');
    await expect(creation).rejects.toThrow();
    expect((await deletion).body.errors).toBeDefined();

    expect(
      await q(
        `SELECT "id" FROM "${schema}"."workflow" WHERE "outreachCampaignId"=$1`,
        [campaignId],
      ),
    ).toHaveLength(0);
    const [campaign] = await q<{ deletedAt: string | null }>(
      `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id"=$1`,
      [campaignId],
    );
    const [heldLock] = await q<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_locks WHERE locktype='advisory' AND classid=$1::oid AND objid=$2::oid`,
      [...BARRIER_KEYS],
    );

    expect(campaign.deletedAt).toBeNull();
    expect(heldLock.count).toBe('0');
    expect(eventSpy).not.toHaveBeenCalled();
    expect(queueSpy).not.toHaveBeenCalled();
    expect(activeHarnessResources.size).toBe(0);
  });

  it.each([
    ['soft commit', CAMPAIGNS.softManyControl, deleteCampaign, false, false],
    ['hard commit', CAMPAIGNS.hardManyControl, destroyCampaign, true, false],
    ['soft rollback', CAMPAIGNS.softDelete, deleteCampaign, false, true],
    ['hard rollback', CAMPAIGNS.hardDelete, destroyCampaign, true, true],
  ] as const)(
    '%s holds after the real builder before commit and publishes or discards the buffered event with SQL outcome',
    async (_name, campaignId, mutation, hard, shouldFail) => {
      await q(
        `INSERT INTO "${schema}"."campaign" ("id", "name", "lifecycleStatus", "deletedAt") VALUES ($1, $2, 'DRAFT', NULL) ON CONFLICT ("id") DO UPDATE SET "deletedAt"=NULL`,
        [campaignId, `Task 4 nested processing ${campaignId}`],
      );
      const commonMutationRunner = resolveProviderByName<{
        processNestedRelationsHelper: ProcessNestedRelationsHelper;
      }>(
        hard
          ? 'CommonDestroyManyQueryRunnerService'
          : 'CommonDeleteManyQueryRunnerService',
      );
      const nestedRelationsHelper =
        commonMutationRunner.processNestedRelationsHelper;
      const processNestedRelations =
        nestedRelationsHelper.processNestedRelations.bind(
          nestedRelationsHelper,
        );
      let postBuilderReached = false;
      let interceptedParent = false;
      const nestedProcessingGate = createAbortableGate(
        `${_name} postbuilder gate`,
      );
      const nestedProcessingSpy = jest
        .spyOn(nestedRelationsHelper, 'processNestedRelations')
        .mockImplementationOnce(async (args) => {
          await processNestedRelations(args);
          interceptedParent = args.parentObjectRecords.some(
            (record) => record.id === campaignId,
          );
          postBuilderReached = true;
          await nestedProcessingGate.wait;
          if (shouldFail) throw new Error('injected nested processing failure');
        });

      nestedProcessingGate.setCleanup(() => nestedProcessingSpy.mockRestore());
      eventSpy.mockClear();
      const request = api(mutation, { id: campaignId }).then(
        (response) => response,
      );

      nestedProcessingGate.track(request);
      await runWithGateCleanup(nestedProcessingGate, async () => {
        await waitFor(
          `${_name} postbuilder interception`,
          async () => postBuilderReached,
        );
        expect(interceptedParent).toBe(true);
        const beforeCommit = await q<{ deletedAt: string | null }>(
          `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id"=$1`,
          [campaignId],
        );

        expect(beforeCommit).toHaveLength(1);
        expect(beforeCommit[0].deletedAt).toBeNull();
        expect(eventSpy).not.toHaveBeenCalled();
        nestedProcessingGate.release();
        const response = await request;
        const after = await q<{ deletedAt: string | null }>(
          `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id"=$1`,
          [campaignId],
        );

        if (shouldFail) {
          expect(response.body.errors).toBeDefined();
          expect(after).toHaveLength(1);
          expect(after[0].deletedAt).toBeNull();
          expect(eventSpy).not.toHaveBeenCalled();
        } else {
          expect(response.body.errors).toBeUndefined();
          expect(hard ? after.length === 0 : after[0].deletedAt !== null).toBe(
            true,
          );
          expect(JSON.stringify(eventSpy.mock.calls)).toContain(campaignId);
        }
      });
    },
  );

  it('aborts a held postbuilder operation after a caught assertion failure and drains before cleanup', async () => {
    const campaignId = CAMPAIGNS.softManyControl;

    await q(
      `INSERT INTO "${schema}"."campaign" ("id", "name", "lifecycleStatus", "deletedAt") VALUES ($1, $2, 'DRAFT', NULL) ON CONFLICT ("id") DO UPDATE SET "deletedAt"=NULL`,
      [campaignId, 'Task 4 held assertion failure'],
    );
    const commonMutationRunner = resolveProviderByName<{
      processNestedRelationsHelper: ProcessNestedRelationsHelper;
    }>('CommonDeleteManyQueryRunnerService');
    const nestedRelationsHelper =
      commonMutationRunner.processNestedRelationsHelper;
    const originalProcessNestedRelations =
      nestedRelationsHelper.processNestedRelations;
    const processNestedRelations = originalProcessNestedRelations.bind(
      nestedRelationsHelper,
    );
    let reached = false;
    let interceptedAbort: unknown;
    const gate = createAbortableGate('simulated held assertion failure');
    const interception = jest
      .spyOn(nestedRelationsHelper, 'processNestedRelations')
      .mockImplementationOnce(async (args) => {
        await processNestedRelations(args);
        reached = true;
        try {
          await gate.wait;
        } catch (error) {
          interceptedAbort = error;
          throw error;
        }
      });

    gate.setCleanup(() => interception.mockRestore());
    eventSpy.mockClear();
    queueSpy.mockClear();
    const request = api(deleteCampaign, { id: campaignId }).then(
      (response) => response,
    );

    gate.track(request);
    await expect(
      runWithGateCleanup(gate, async () => {
        await waitFor('simulated held assertion seam', async () => reached);
        throw new Error('simulated held assertion failure');
      }),
    ).rejects.toThrow('simulated held assertion failure');

    const response = await request;
    expect(response.body.errors).toBeDefined();
    expect(interceptedAbort).toEqual(
      expect.objectContaining({ message: HELD_GATE_ABORT_MESSAGE }),
    );
    expect(nestedRelationsHelper.processNestedRelations).toBe(
      originalProcessNestedRelations,
    );
    const [campaign] = await q<{ deletedAt: string | null }>(
      `SELECT "deletedAt" FROM "${schema}"."campaign" WHERE "id"=$1`,
      [campaignId],
    );

    expect(campaign.deletedAt).toBeNull();
    const [heldLock] = await q<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_locks WHERE locktype='advisory' AND classid=hashtext(($1::uuid)::text)::oid AND objid=hashtext(($2::uuid)::text)::oid`,
      [WORKSPACE_ID, campaignId],
    );

    expect(heldLock.count).toBe('0');
    expect(eventSpy).not.toHaveBeenCalled();
    expect(queueSpy).not.toHaveBeenCalled();
    expect(activeHarnessResources.size).toBe(0);
  });

  it.each([
    ['deleteOne', [CAMPAIGNS.softDelete], deleteCampaign],
    ['destroyOne', [CAMPAIGNS.hardDelete], destroyCampaign],
    [
      'deleteMany',
      [CAMPAIGNS.softManyOutreach, CAMPAIGNS.softManyControl],
      deleteCampaigns,
    ],
    [
      'destroyMany',
      [CAMPAIGNS.hardManyOutreach, CAMPAIGNS.hardManyControl],
      destroyCampaigns,
    ],
  ] as const)(
    '%s rolls back the parent mutation and discards buffered events on injected SQL failure',
    async (_name, campaignIds, mutation) => {
      for (const campaignId of campaignIds) {
        await q(
          `INSERT INTO "${schema}"."campaign" ("id", "name", "lifecycleStatus", "deletedAt") VALUES ($1, $2, 'DRAFT', NULL) ON CONFLICT ("id") DO UPDATE SET "deletedAt"=NULL`,
          [campaignId, `Task 4 rollback ${campaignId}`],
        );
      }

      await setMode(`campaign-fail:${campaignIds[0]}`);
      eventSpy.mockClear();
      const response = await api(
        mutation,
        campaignIds.length === 1
          ? { id: campaignIds[0] }
          : { ids: [...campaignIds] },
      );

      expect(response.body.errors).toBeDefined();
      expect(eventSpy).not.toHaveBeenCalled();
      const retained = await q<{ id: string; deletedAt: string | null }>(
        `SELECT "id", "deletedAt" FROM "${schema}"."campaign" WHERE "id" = ANY($1::uuid[])`,
        [[...campaignIds]],
      );

      expect(retained).toHaveLength(campaignIds.length);
      expect(retained.every(({ deletedAt }) => deletedAt === null)).toBe(true);
    },
  );

  it('rejects mixed legacy/new definitions and every persisted unsafe run, including deleted FAILED history', async () => {
    await expect(
      cleanupService.replaceLegacyCampaignSequence({
        ...replacementScope,
        campaignId: CAMPAIGNS.mixed,
        expectedWorkflowId: WORKFLOWS.mixed,
      }),
    ).rejects.toThrow();
    for (const [id, status, deleted] of [
      [RUNS.running, 'RUNNING', false],
      [RUNS.stopping, 'STOPPING', false],
      [RUNS.failed, 'FAILED', false],
      [RUNS.deletedFailed, 'FAILED', true],
    ] as const) {
      await insertRun(
        id,
        WORKFLOWS.legacy,
        VERSIONS.legacyActive,
        status,
        deleted,
      );
      await expect(
        cleanupService.replaceLegacyCampaignSequence(replacementScope),
      ).rejects.toThrow(`is still ${status}`);
      await q(`DELETE FROM "${schema}"."workflowRun" WHERE "id"=$1`, [id]);
    }
    const unchanged = await q<{ deletedAt: string | null }>(
      `SELECT "deletedAt" FROM "${schema}"."workflowVersion" WHERE "workflowId"=$1`,
      [WORKFLOWS.legacy],
    );
    expect(unchanged.every(({ deletedAt }) => deletedAt === null)).toBe(true);
  });

  it('stops pending runs, archives atomically, retains receipts, survives postcommit creation failure, and retries once', async () => {
    for (const [id, status, deleted, marker] of [
      [RUNS.completed, 'COMPLETED', false, undefined],
      [RUNS.stopped, 'STOPPED', false, undefined],
      [RUNS.notStarted, 'NOT_STARTED', false, undefined],
      [RUNS.enqueued, 'ENQUEUED', false, undefined],
      [RUNS.receipt, 'COMPLETED', false, RECEIPT],
    ] as const)
      await insertRun(
        id,
        WORKFLOWS.legacy,
        VERSIONS.legacyActive,
        status,
        deleted,
        marker,
      );

    const readRetainedHistory = () =>
      q<{ id: string; state: string; stepLogs: string }>(
        `SELECT "id", "state"::text, "stepLogs"::text AS "stepLogs" FROM "${schema}"."workflowRun" WHERE "workflowId"=$1 ORDER BY "id"`,
        [WORKFLOWS.legacy],
      );
    const readLegacyDefinition = async () => ({
      automatedTriggers: await q<{ row: string }>(
        `SELECT to_jsonb(source)::text AS row FROM "${schema}"."workflowAutomatedTrigger" source WHERE "workflowId"=$1 ORDER BY "id"`,
        [WORKFLOWS.legacy],
      ),
      versions: await q<{ row: string }>(
        `SELECT to_jsonb(source)::text AS row FROM "${schema}"."workflowVersion" source WHERE "workflowId"=$1 ORDER BY "id"`,
        [WORKFLOWS.legacy],
      ),
      workflow: await q<{ row: string }>(
        `SELECT to_jsonb(source)::text AS row FROM "${schema}"."workflow" source WHERE "id"=$1`,
        [WORKFLOWS.legacy],
      ),
    });
    const cleanupDataSource = await (
      cleanupService as unknown as {
        globalWorkspaceOrmManager: {
          getGlobalWorkspaceDataSource(): Promise<typeof global.testDataSource>;
        };
      }
    ).globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const installArchiveCommitGate = (failCommit: boolean) => {
      let archiveCommitReached = false;
      const gate = createAbortableGate(
        failCommit ? 'archival rollback gate' : 'archival commit gate',
      );
      const createQueryRunner =
        cleanupDataSource.createQueryRunner.bind(cleanupDataSource);
      const createQueryRunnerSpy = jest
        .spyOn(cleanupDataSource, 'createQueryRunner')
        .mockImplementation((mode) => {
          const queryRunner = createQueryRunner(mode);
          const query = queryRunner.query.bind(queryRunner);
          const commitTransaction =
            queryRunner.commitTransaction.bind(queryRunner);
          let archivedDefinitionMutated = false;

          queryRunner.query = (async (
            ...args: Parameters<QueryRunner['query']>
          ) => {
            const result = await query(...args);
            const sql = String(args[0]);

            if (
              sql.includes(`UPDATE "${schema}"."workflow"`) &&
              sql.includes('SET "statuses"')
            ) {
              archivedDefinitionMutated = true;
            }

            return result;
          }) as QueryRunner['query'];
          queryRunner.commitTransaction = async () => {
            if (archivedDefinitionMutated) {
              archiveCommitReached = true;
              await gate.wait;
              if (failCommit) {
                throw new Error('injected archival commit failure');
              }
            }
            await commitTransaction();
          };

          return queryRunner;
        });

      gate.setCleanup(() => createQueryRunnerSpy.mockRestore());

      return {
        gate,
        waitUntilReached: () =>
          waitFor(
            'archival post-mutation precommit seam',
            async () => archiveCommitReached,
          ),
      };
    };
    const cleanupInternals = cleanupService as unknown as {
      workflowTriggerWorkspaceService: {
        cacheStorageService: CacheStorageService;
        commandMenuItemService: {
          findByWorkflowVersionId(...args: unknown[]): Promise<unknown>;
        };
      };
    };
    const reconciliationCache =
      cleanupInternals.workflowTriggerWorkspaceService.cacheStorageService;
    const commandMenuItemService =
      cleanupInternals.workflowTriggerWorkspaceService.commandMenuItemService;
    const hashDeleteSpy = jest.spyOn(reconciliationCache, 'hashDelete');
    const commandMenuLookupSpy = jest.spyOn(
      commandMenuItemService,
      'findByWorkflowVersionId',
    );
    const reconciliationQueueCallCount = () =>
      queueSpy.mock.calls.filter(
        ([jobName, payload]) =>
          jobName === 'WorkflowStatusesUpdateJob' &&
          JSON.stringify(payload).includes(WORKFLOWS.legacy),
      ).length;
    const retainedHistoryBefore = JSON.stringify(await readRetainedHistory());

    await setMode('archive-fail');
    await expect(
      cleanupService.replaceLegacyCampaignSequence(replacementScope),
    ).rejects.toThrow('injected archive failure');
    eventSpy.mockClear();
    queueSpy.mockClear();
    await expect(
      cleanupService.replaceLegacyCampaignSequence(replacementScope),
    ).rejects.toThrow('injected archive failure');
    const before = await q<{
      versionCount: string;
      triggerCount: string;
      workflowDeleted: boolean;
    }>(
      `SELECT (SELECT count(*)::text FROM "${schema}"."workflowVersion" WHERE "workflowId"=$1 AND "deletedAt" IS NULL) AS "versionCount", (SELECT count(*)::text FROM "${schema}"."workflowAutomatedTrigger" WHERE "workflowId"=$1 AND "deletedAt" IS NULL) AS "triggerCount", (SELECT "deletedAt" IS NOT NULL FROM "${schema}"."workflow" WHERE "id"=$1) AS "workflowDeleted"`,
      [WORKFLOWS.legacy],
    );
    expect(before[0]).toEqual({
      versionCount: '2',
      triggerCount: '1',
      workflowDeleted: false,
    });
    expect(eventSpy).not.toHaveBeenCalled();
    expect(queueSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(await readRetainedHistory())).toBe(
      retainedHistoryBefore,
    );

    const definitionBeforeArchival = JSON.stringify(
      await readLegacyDefinition(),
    );
    expect(definitionBeforeArchival).toContain(LEGACY_CRON_PATTERN);
    await workflowCacheStorage.hashSet({
      field: WORKFLOWS.legacy,
      key: WORKFLOW_CRON_TRIGGER_CACHE_KEY,
      value: JSON.stringify({
        pattern: LEGACY_CRON_PATTERN,
        workflowId: WORKFLOWS.legacy,
      }),
    });
    eventSpy.mockClear();
    queueSpy.mockClear();
    hashDeleteSpy.mockClear();
    commandMenuLookupSpy.mockClear();
    await setMode(null);
    const rollbackGate = installArchiveCommitGate(true);
    const rollbackAfterPrivateMutation =
      cleanupService.replaceLegacyCampaignSequence(replacementScope);

    rollbackGate.gate.track(rollbackAfterPrivateMutation);
    await runWithGateCleanup(rollbackGate.gate, async () => {
      await rollbackGate.waitUntilReached();
      expect(JSON.stringify(await readLegacyDefinition())).toBe(
        definitionBeforeArchival,
      );
      expect(JSON.stringify(await readRetainedHistory())).toBe(
        retainedHistoryBefore,
      );
      expect(
        await workflowCacheStorage.hashGetValues(
          WORKFLOW_CRON_TRIGGER_CACHE_KEY,
        ),
      ).toContainEqual(expect.stringContaining(WORKFLOWS.legacy));
      expect(hashDeleteSpy).not.toHaveBeenCalled();
      expect(commandMenuLookupSpy).not.toHaveBeenCalled();
      expect(eventSpy).not.toHaveBeenCalled();
      expect(queueSpy).not.toHaveBeenCalled();
      rollbackGate.gate.release();
      await expect(rollbackAfterPrivateMutation).rejects.toThrow(
        'injected archival commit failure',
      );
      expect(hashDeleteSpy).not.toHaveBeenCalled();
      expect(commandMenuLookupSpy).not.toHaveBeenCalled();
      expect(eventSpy).not.toHaveBeenCalled();
      expect(queueSpy).not.toHaveBeenCalled();
      expect(
        await workflowCacheStorage.hashGetValues(
          WORKFLOW_CRON_TRIGGER_CACHE_KEY,
        ),
      ).toContainEqual(expect.stringContaining(WORKFLOWS.legacy));
    });
    expect(JSON.stringify(await readLegacyDefinition())).toBe(
      definitionBeforeArchival,
    );
    expect(JSON.stringify(await readRetainedHistory())).toBe(
      retainedHistoryBefore,
    );
    expect(hashDeleteSpy).not.toHaveBeenCalled();
    expect(commandMenuLookupSpy).not.toHaveBeenCalled();

    eventSpy.mockClear();
    queueSpy.mockClear();
    hashDeleteSpy.mockClear();
    commandMenuLookupSpy.mockClear();
    await setMode('create-fail');
    const successfulArchiveGate = installArchiveCommitGate(false);
    const createFailureAfterArchive =
      cleanupService.replaceLegacyCampaignSequence(replacementScope);

    successfulArchiveGate.gate.track(createFailureAfterArchive);
    await runWithGateCleanup(successfulArchiveGate.gate, async () => {
      await successfulArchiveGate.waitUntilReached();
      expect(JSON.stringify(await readLegacyDefinition())).toBe(
        definitionBeforeArchival,
      );
      expect(JSON.stringify(await readRetainedHistory())).toBe(
        retainedHistoryBefore,
      );
      expect(hashDeleteSpy).not.toHaveBeenCalled();
      expect(commandMenuLookupSpy).not.toHaveBeenCalled();
      expect(eventSpy).not.toHaveBeenCalled();
      expect(queueSpy).not.toHaveBeenCalled();
      successfulArchiveGate.gate.release();
      await expect(createFailureAfterArchive).rejects.toThrow(
        'injected create failure',
      );
    });
    expect(hashDeleteSpy).toHaveBeenCalledTimes(2);
    expect(reconciliationQueueCallCount()).toBe(1);
    expect(eventSpy).not.toHaveBeenCalled();
    expect(hashDeleteSpy).toHaveBeenCalledWith({
      field: WORKFLOWS.legacy,
      key: WORKFLOW_CRON_TRIGGER_CACHE_KEY,
    });
    expect(commandMenuLookupSpy).not.toHaveBeenCalled();
    expect(
      await workflowCacheStorage.hashGetValues(WORKFLOW_CRON_TRIGGER_CACHE_KEY),
    ).not.toContainEqual(expect.stringContaining(WORKFLOWS.legacy));
    expect(JSON.stringify(await readRetainedHistory())).toBe(
      retainedHistoryBefore,
    );
    const [archived] = await q<{
      statuses: object;
      liveVersions: string;
      liveTriggers: string;
      runCount: string;
      stateMarker: string;
      stepLogMarker: string;
    }>(
      `SELECT w."statuses", (SELECT count(*)::text FROM "${schema}"."workflowVersion" WHERE "workflowId"=w."id" AND "deletedAt" IS NULL) AS "liveVersions", (SELECT count(*)::text FROM "${schema}"."workflowAutomatedTrigger" WHERE "workflowId"=w."id" AND "deletedAt" IS NULL) AS "liveTriggers", (SELECT count(*)::text FROM "${schema}"."workflowRun" WHERE "workflowId"=w."id") AS "runCount", (SELECT "state"->>'receipt' FROM "${schema}"."workflowRun" WHERE "id"=$2) AS "stateMarker", (SELECT "stepLogs"->>'receipt' FROM "${schema}"."workflowRun" WHERE "id"=$2) AS "stepLogMarker" FROM "${schema}"."workflow" w WHERE w."id"=$1`,
      [WORKFLOWS.legacy, RUNS.receipt],
    );
    expect(archived).toEqual({
      statuses: '{}',
      liveVersions: '0',
      liveTriggers: '0',
      runCount: '5',
      stateMarker: RECEIPT,
      stepLogMarker: RECEIPT,
    });
    const statuses = await q<{ status: string }>(
      `SELECT "status" FROM "${schema}"."workflowRun" WHERE "id" = ANY($1::uuid[]) ORDER BY "id"`,
      [[RUNS.notStarted, RUNS.enqueued]],
    );
    expect(statuses.map(({ status }) => status)).toEqual([
      'STOPPED',
      'STOPPED',
    ]);

    const [memberRole] = await q<{
      canUpdateAllSettings: boolean;
      label: string;
    }>(
      `SELECT role."canUpdateAllSettings" AS "canUpdateAllSettings", role."label" FROM core."userWorkspace" user_workspace INNER JOIN core."roleTarget" role_target ON role_target."userWorkspaceId"=user_workspace."id" INNER JOIN core."role" role ON role."id"=role_target."roleId" WHERE user_workspace."workspaceId"=$1 AND user_workspace."userId"=$2`,
      [WORKSPACE_ID, USER_DATA_SEED_IDS.JONY],
    );

    expect(memberRole.canUpdateAllSettings).toBe(false);
    expect(memberRole.label.toLowerCase()).not.toContain('admin');

    const memberResponse = await makeGraphqlAPIRequest(
      {
        query: replaceLegacyCampaignSequence,
        variables: {
          input: {
            campaignId: CAMPAIGNS.replacement,
            expectedWorkflowId: WORKFLOWS.legacy,
          },
        },
      },
      memberToken,
    );

    expect(errorText(memberResponse)).toContain(
      'Entity performing the request does not have permission',
    );
    const [afterMemberDenial] = await q<{ liveWorkflowCount: string }>(
      `SELECT count(*)::text AS "liveWorkflowCount" FROM "${schema}"."workflow" WHERE "outreachCampaignId"=$1 AND "deletedAt" IS NULL`,
      [CAMPAIGNS.replacement],
    );

    expect(afterMemberDenial.liveWorkflowCount).toBe('0');

    await setMode(`workflow:${CAMPAIGNS.replacement}`);
    await holdBarrier();
    const firstReplacement = replaceLegacyViaApi();

    await waitForBarrier();
    const secondReplacement = replaceLegacyViaApi();
    const concurrentTask3Creation = createSequence(CAMPAIGNS.replacement);
    const rejectedSoftDelete = api(deleteCampaign, {
      id: CAMPAIGNS.replacement,
    }).then((response) => response);
    const rejectedHardDelete = api(destroyCampaign, {
      id: CAMPAIGNS.replacement,
    }).then((response) => response);
    await waitForCampaignLockWaiters(CAMPAIGNS.replacement, 4);
    await releaseBarrier();
    const [
      replacement,
      concurrentReplacement,
      task3Creation,
      softDelete,
      hardDelete,
    ] = await Promise.all([
      firstReplacement,
      secondReplacement,
      concurrentTask3Creation,
      rejectedSoftDelete,
      rejectedHardDelete,
    ]);

    expect(replacement).toEqual(concurrentReplacement);
    expect(task3Creation).toMatchObject({
      versionId: replacement.versionId,
      workflowId: replacement.workflowId,
    });
    expect(replacement.workflowId).toBe(WORKFLOWS.replacementCreated);
    expect(replacement.versionId).toBe(VERSIONS.replacementCreated);
    expect(errorText(softDelete)).toContain(
      'Campaigns with outreach definitions cannot be deleted',
    );
    expect(errorText(hardDelete)).toContain(
      'Campaigns with outreach definitions cannot be deleted',
    );
    expect(hashDeleteSpy).toHaveBeenCalledTimes(6);
    expect(reconciliationQueueCallCount()).toBe(3);
    await expect(replaceLegacyViaApi()).resolves.toEqual(replacement);
    expect(hashDeleteSpy).toHaveBeenCalledTimes(8);
    expect(reconciliationQueueCallCount()).toBe(4);
    expect(hashDeleteSpy.mock.calls).toEqual(
      Array.from({ length: 8 }, () => [
        {
          field: WORKFLOWS.legacy,
          key: WORKFLOW_CRON_TRIGGER_CACHE_KEY,
        },
      ]),
    );
    const [state] = await q<{
      campaignDeleted: boolean;
      legacyDeleted: boolean;
      legacyVersionCount: string;
      liveWorkflowCount: string;
    }>(
      `SELECT c."deletedAt" IS NOT NULL AS "campaignDeleted", (SELECT "deletedAt" IS NOT NULL FROM "${schema}"."workflow" WHERE "id"=$2) AS "legacyDeleted", (SELECT count(*)::text FROM "${schema}"."workflowVersion" WHERE "workflowId"=$2 AND "deletedAt" IS NOT NULL) AS "legacyVersionCount", (SELECT count(*)::text FROM "${schema}"."workflow" WHERE "outreachCampaignId"=c."id" AND "deletedAt" IS NULL) AS "liveWorkflowCount" FROM "${schema}"."campaign" c WHERE c."id"=$1`,
      [CAMPAIGNS.replacement, WORKFLOWS.legacy],
    );

    expect(state).toEqual({
      campaignDeleted: false,
      legacyDeleted: true,
      legacyVersionCount: '2',
      liveWorkflowCount: '1',
    });
    expect(JSON.stringify(await readRetainedHistory())).toBe(
      retainedHistoryBefore,
    );
  });

  it('serializes delete/destroy-first requests before repeat-safe replacement retries without event or state corruption', async () => {
    barrierRunner = global.testDataSource.createQueryRunner();
    await barrierRunner.connect();
    const deleteFirstBarrier = await registerOwnedRunner(
      barrierRunner,
      'delete-first Campaign transaction barrier',
    );
    barrierResource = deleteFirstBarrier;
    await barrierRunner.startTransaction();
    await barrierRunner.query(
      'SELECT "id" FROM "workspace_1wgvd1injqtife6y4rvfbu3h5"."campaign" WHERE "id"=$1 FOR UPDATE',
      [CAMPAIGNS.replacement],
    );

    eventSpy.mockClear();
    const softDeletion = api(deleteCampaign, {
      id: CAMPAIGNS.replacement,
    }).then((response) => response);

    await waitFor('delete-first Campaign advisory lock owner', async () => {
      const [row] = await q<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_locks WHERE locktype='advisory' AND granted AND classid=hashtext(($1::uuid)::text)::oid AND objid=hashtext(($2::uuid)::text)::oid`,
        [WORKSPACE_ID, CAMPAIGNS.replacement],
      );
      return Number(row.count) > 0;
    });
    const hardDeletion = api(destroyCampaign, {
      id: CAMPAIGNS.replacement,
    }).then((response) => response);
    const firstRetry = replaceLegacyViaApi();
    const secondRetry = replaceLegacyViaApi();
    await waitForCampaignLockWaiters(CAMPAIGNS.replacement, 3);
    await deleteFirstBarrier.finish(true);

    const [softDelete, hardDelete, replacement, concurrentReplacement] =
      await Promise.all([softDeletion, hardDeletion, firstRetry, secondRetry]);

    expect(errorText(softDelete)).toContain(
      'Campaigns with outreach definitions cannot be deleted',
    );
    expect(errorText(hardDelete)).toContain(
      'Campaigns with outreach definitions cannot be deleted',
    );
    expect(replacement).toEqual(concurrentReplacement);
    expect(replacement).toMatchObject({
      versionId: VERSIONS.replacementCreated,
      workflowId: WORKFLOWS.replacementCreated,
    });
    expect(eventSpy).not.toHaveBeenCalled();
    const [state] = await q<{
      campaignDeleted: boolean;
      liveWorkflowCount: string;
    }>(
      `SELECT "deletedAt" IS NOT NULL AS "campaignDeleted", (SELECT count(*)::text FROM "${schema}"."workflow" WHERE "outreachCampaignId"=$1 AND "deletedAt" IS NULL) AS "liveWorkflowCount" FROM "${schema}"."campaign" WHERE "id"=$1`,
      [CAMPAIGNS.replacement],
    );

    expect(state).toEqual({
      campaignDeleted: false,
      liveWorkflowCount: '1',
    });
  });

  it('hard-removes the legacy CRON trigger and a forced database cache rebuild dispatches only the ordinary control', async () => {
    const [legacyTriggerCount] = await q<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${schema}"."workflowAutomatedTrigger" WHERE "workflowId"=$1`,
      [WORKFLOWS.legacy],
    );

    expect(legacyTriggerCount.count).toBe('0');

    await q(
      `INSERT INTO "${schema}"."workflowAutomatedTrigger" ("id", "type", "settings", "workflowId") VALUES ($1, 'CRON', '{"pattern":"* * * * *"}'::jsonb, $2)`,
      [AUTOMATED_TRIGGER, WORKFLOWS.ordinary],
    );
    await workflowCacheStorage.del(WORKFLOW_CRON_TRIGGER_CACHE_KEY);
    jest
      .spyOn(cronDeduplicationService, 'shouldDispatch')
      .mockResolvedValue(true);
    queueSpy.mockClear();

    await cronJob.handle();

    const queuedCalls = JSON.stringify(queueSpy.mock.calls);

    expect(queuedCalls).toContain(WORKFLOWS.ordinary);
    expect(queuedCalls).not.toContain(WORKFLOWS.legacy);
    const cachedTriggers = await workflowCacheStorage.hashGetValues(
      WORKFLOW_CRON_TRIGGER_CACHE_KEY,
    );

    expect(
      cachedTriggers.some((value) => value.includes(WORKFLOWS.ordinary)),
    ).toBe(true);
    expect(
      cachedTriggers.some((value) => value.includes(WORKFLOWS.legacy)),
    ).toBe(false);
  });

  it('keeps Campaign queue candidates untouched while ordinary enqueue/stale transitions and CAS accounting use affected rows only', async () => {
    const baselineNotStartedCount =
      await throttlingService.getNotStartedRunsCountFromDatabase(WORKSPACE_ID);

    await insertRun(
      RUNS.ordinaryNotStarted,
      WORKFLOWS.ordinary,
      VERSIONS.ordinary,
      'NOT_STARTED',
      false,
    );
    await insertRun(
      RUNS.ordinaryEnqueued,
      WORKFLOWS.ordinary,
      VERSIONS.ordinary,
      'ENQUEUED',
      false,
    );
    await q(
      `UPDATE "${schema}"."workflowRun" SET "enqueuedAt"=date_trunc('milliseconds', now()) WHERE "id"=$1`,
      [RUNS.ordinaryEnqueued],
    );
    const softDeletedCampaignRun = RUNS.completed;
    const liveCampaignRun = RUNS.stopped;
    const deletedOrdinaryRun = RUNS.receipt;

    await q(
      `UPDATE "${schema}"."workflowRun" SET "status"='NOT_STARTED', "enqueuedAt"=NULL WHERE "id"=$1`,
      [softDeletedCampaignRun],
    );
    await q(
      `UPDATE "${schema}"."workflowRun" SET "workflowId"=$2, "workflowVersionId"=$3, "status"='NOT_STARTED', "enqueuedAt"=NULL, "deletedAt"=NULL WHERE "id"=$1`,
      [liveCampaignRun, WORKFLOWS.mixed, VERSIONS.mixedLegacy],
    );
    await q(
      `UPDATE "${schema}"."workflowRun" SET "workflowId"=$2, "workflowVersionId"=$3, "status"='NOT_STARTED', "enqueuedAt"=NULL, "deletedAt"=now() WHERE "id"=$1`,
      [deletedOrdinaryRun, WORKFLOWS.ordinary, VERSIONS.ordinary],
    );
    expect(
      await throttlingService.getNotStartedRunsCountFromDatabase(WORKSPACE_ID),
    ).toBe(baselineNotStartedCount + 1);
    await throttlingService.recomputeWorkflowRunNotStartedCount(WORKSPACE_ID);
    await expect(
      workflowCacheStorage.get<number>(
        `workflow-run-not-started-count:${WORKSPACE_ID}`,
      ),
    ).resolves.toBe(baselineNotStartedCount + 1);

    jest
      .spyOn(throttlingService, 'acquireWorkflowEnqueueLock')
      .mockResolvedValue(true);
    const notStartedCount = jest
      .spyOn(throttlingService, 'getNotStartedRunsCountFromDatabase')
      .mockResolvedValue(2);
    const remainingCount = jest
      .spyOn(throttlingService, 'getRemainingRunsToEnqueueCount')
      .mockResolvedValue(2);
    const consume = jest
      .spyOn(throttlingService, 'consumeRemainingRunsToEnqueueCount')
      .mockResolvedValue(undefined);
    queueSpy.mockClear();
    await enqueueService.enqueueRunsForWorkspace({
      workspaceId: WORKSPACE_ID,
      isCacheMode: false,
    });
    const enqueueRows = await q<{ id: string; status: string }>(
      `SELECT "id", "status" FROM "${schema}"."workflowRun" WHERE "id" = ANY($1::uuid[]) ORDER BY "id"`,
      [
        [
          softDeletedCampaignRun,
          liveCampaignRun,
          deletedOrdinaryRun,
          RUNS.ordinaryNotStarted,
        ],
      ],
    );

    expect(
      enqueueRows.find(({ id }) => id === softDeletedCampaignRun)?.status,
    ).toBe('NOT_STARTED');
    expect(enqueueRows.find(({ id }) => id === liveCampaignRun)?.status).toBe(
      'NOT_STARTED',
    );
    expect(
      enqueueRows.find(({ id }) => id === deletedOrdinaryRun)?.status,
    ).toBe('NOT_STARTED');
    expect(
      enqueueRows.find(({ id }) => id === RUNS.ordinaryNotStarted)?.status,
    ).toBe('ENQUEUED');
    expect(JSON.stringify(queueSpy.mock.calls)).toContain(
      RUNS.ordinaryNotStarted,
    );
    expect(JSON.stringify(queueSpy.mock.calls)).not.toContain(
      softDeletedCampaignRun,
    );
    expect(JSON.stringify(queueSpy.mock.calls)).not.toContain(liveCampaignRun);
    expect(JSON.stringify(queueSpy.mock.calls)).not.toContain(
      deletedOrdinaryRun,
    );
    expect(consume).toHaveBeenCalledWith(WORKSPACE_ID, 1);

    await q(
      `UPDATE "${schema}"."workflowRun" SET "enqueuedAt"=NULL WHERE "id"=$1`,
      [RUNS.ordinaryNotStarted],
    );
    await q(
      `UPDATE "${schema}"."workflowRun" SET "status"='ENQUEUED', "enqueuedAt"=date_trunc('milliseconds', now() - interval '2 hours') WHERE "id"=$1`,
      [liveCampaignRun],
    );
    const recompute = jest
      .spyOn(throttlingService, 'recomputeWorkflowRunNotStartedCount')
      .mockResolvedValue(undefined);
    await staleService.handleStaledRunsForWorkspace(WORKSPACE_ID);
    const revivedRows = await q<{ id: string; status: string }>(
      `SELECT "id", "status" FROM "${schema}"."workflowRun" WHERE "id" = ANY($1::uuid[])`,
      [[RUNS.ordinaryNotStarted, liveCampaignRun]],
    );

    expect(
      revivedRows.find(({ id }) => id === RUNS.ordinaryNotStarted)?.status,
    ).toBe('NOT_STARTED');
    expect(revivedRows.find(({ id }) => id === liveCampaignRun)?.status).toBe(
      'ENQUEUED',
    );
    expect(recompute).toHaveBeenCalled();

    await q(
      `UPDATE "${schema}"."workflowRun" SET "status"='ENQUEUED', "enqueuedAt"=date_trunc('milliseconds', now() - interval '2 hours') WHERE "id"=$1`,
      [RUNS.ordinaryNotStarted],
    );
    recompute.mockClear();
    const [staleCandidate] = await q<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${schema}"."workflowRun" r JOIN "${schema}"."workflow" w ON w."id"=r."workflowId" WHERE r."id"=$1 AND r."deletedAt" IS NULL AND r."status"='ENQUEUED' AND r."enqueuedAt" < now() - interval '1 hour' AND w."outreachCampaignId" IS NULL`,
      [RUNS.ordinaryNotStarted],
    );

    expect(staleCandidate.count).toBe('1');
    const [selectedBaseline] = await q<{
      enqueuedAt: Date;
      status: string;
    }>(
      `SELECT "enqueuedAt", "status" FROM "${schema}"."workflowRun" WHERE "id"=$1`,
      [RUNS.ordinaryNotStarted],
    );
    const workflowOutreachAccessGuard = (
      staleService as unknown as {
        workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService;
      }
    ).workflowOutreachAccessGuardService;
    const assertAllowed =
      workflowOutreachAccessGuard.assertGenericWorkflowRunMutationsAllowed.bind(
        workflowOutreachAccessGuard,
      );
    let selectionReached = false;
    let selectedRunIds: string[] = [];
    const selectionGate = createAbortableGate('stale postselection gate');
    const selectionSpy = jest
      .spyOn(
        workflowOutreachAccessGuard,
        'assertGenericWorkflowRunMutationsAllowed',
      )
      .mockImplementationOnce(async (args) => {
        await assertAllowed(args);
        selectedRunIds = args.workflowRunIds;
        selectionReached = true;
        await selectionGate.wait;
      });
    selectionGate.setCleanup(() => selectionSpy.mockRestore());
    const staleHandling =
      staleService.handleStaledRunsForWorkspace(WORKSPACE_ID);

    selectionGate.track(staleHandling);
    await runWithGateCleanup(selectionGate, async () => {
      await waitFor('stale postselection seam', async () => selectionReached);
      expect(selectedRunIds).toEqual([RUNS.ordinaryNotStarted]);
      expect(selectedBaseline.status).toBe('ENQUEUED');
      expect(new Date(selectedBaseline.enqueuedAt).getTime()).toBeLessThan(
        Date.now() - 60 * 60 * 1000,
      );
      await q(
        `UPDATE "${schema}"."workflowRun" SET "enqueuedAt"=date_trunc('milliseconds', now()) WHERE "id"=$1`,
        [RUNS.ordinaryNotStarted],
      );
      selectionGate.release();
      await staleHandling;
    });
    const [staleCasLoser] = await q<{
      enqueuedAtIsFresh: boolean;
      status: string;
    }>(
      `SELECT "status", "enqueuedAt" > now() - interval '1 minute' AS "enqueuedAtIsFresh" FROM "${schema}"."workflowRun" WHERE "id"=$1`,
      [RUNS.ordinaryNotStarted],
    );

    expect(staleCasLoser).toEqual({
      enqueuedAtIsFresh: true,
      status: 'ENQUEUED',
    });
    expect(recompute).not.toHaveBeenCalled();

    await q(
      `UPDATE "${schema}"."workflowRun" SET "status"='STOPPED' WHERE "id"=$1`,
      [RUNS.ordinaryNotStarted],
    );
    await q(
      `UPDATE "${schema}"."workflowRun" SET "status"='NOT_STARTED', "enqueuedAt"=NULL WHERE "id"=$1`,
      [RUNS.ordinaryEnqueued],
    );
    notStartedCount.mockResolvedValue(1);
    remainingCount.mockResolvedValue(1);
    consume.mockClear();
    eventSpy.mockClear();
    queueSpy.mockClear();

    barrierRunner = global.testDataSource.createQueryRunner();
    await barrierRunner.connect();
    const enqueueBarrier = await registerOwnedRunner(
      barrierRunner,
      'enqueue CAS transaction barrier',
    );
    barrierResource = enqueueBarrier;
    const [{ pid: cancelledBlockerPid }] = (await barrierRunner.query(
      'SELECT pg_backend_pid()::integer AS pid',
    )) as { pid: number }[];
    await barrierRunner.startTransaction();
    const lockWorkflowRunSql = `SELECT "id" FROM "${schema}"."workflowRun" WHERE "id"=$1 FOR UPDATE`;

    await barrierRunner.query(lockWorkflowRunSql, [RUNS.ordinaryEnqueued]);
    const cancelledEnqueue = trackBarrierOperation(
      enqueueService.enqueueRunsForWorkspace({
        workspaceId: WORKSPACE_ID,
        isCacheMode: false,
      }),
    );

    await waitForOwnedRunnerWaiter(
      barrierRunner,
      'forced-failure enqueue CAS row-lock waiter',
    );
    await expect(
      runWithRunnerCleanup(enqueueBarrier, async () => {
        throw new Error('simulated enqueue-held assertion failure');
      }),
    ).rejects.toThrow('simulated enqueue-held assertion failure');
    // The enqueue service intentionally contains/logs per-workspace failures;
    // cancellation is evidenced by rollback and zero queue/consume effects.
    await expect(cancelledEnqueue).resolves.toBeUndefined();
    expect(JSON.stringify(queueSpy.mock.calls)).not.toContain(
      RUNS.ordinaryEnqueued,
    );
    expect(consume).not.toHaveBeenCalled();
    const [cancelled] = await q<{ status: string }>(
      `SELECT "status" FROM "${schema}"."workflowRun" WHERE "id"=$1`,
      [RUNS.ordinaryEnqueued],
    );

    expect(cancelled.status).toBe('NOT_STARTED');
    expect(eventSpy).not.toHaveBeenCalled();
    const [cancelledLocks] = await q<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_locks WHERE pid=$1 AND locktype IN ('transactionid', 'tuple')`,
      [cancelledBlockerPid],
    );

    expect(cancelledLocks.count).toBe('0');
    expect(activeHarnessResources.size).toBe(0);

    barrierRunner = global.testDataSource.createQueryRunner();
    await barrierRunner.connect();
    const successfulEnqueueBarrier = await registerOwnedRunner(
      barrierRunner,
      'successful enqueue CAS transaction barrier',
    );
    barrierResource = successfulEnqueueBarrier;
    await barrierRunner.startTransaction();
    await barrierRunner.query(lockWorkflowRunSql, [RUNS.ordinaryEnqueued]);
    const enqueuing = trackBarrierOperation(
      enqueueService.enqueueRunsForWorkspace({
        workspaceId: WORKSPACE_ID,
        isCacheMode: false,
      }),
    );

    await waitForOwnedRunnerWaiter(
      barrierRunner,
      'successful enqueue CAS row-lock waiter',
    );
    const stopWorkflowRunSql = `UPDATE "${schema}"."workflowRun" SET "status"='STOPPED' WHERE "id"=$1`;

    await barrierRunner.query(stopWorkflowRunSql, [RUNS.ordinaryEnqueued]);
    await successfulEnqueueBarrier.finish(true);
    await enqueuing;
    expect(JSON.stringify(queueSpy.mock.calls)).not.toContain(
      RUNS.ordinaryEnqueued,
    );
    expect(consume).not.toHaveBeenCalled();
    const [stale] = await q<{ status: string }>(
      `SELECT "status" FROM "${schema}"."workflowRun" WHERE "id"=$1`,
      [RUNS.ordinaryEnqueued],
    );
    expect(stale.status).toBe('STOPPED');
  });
});
