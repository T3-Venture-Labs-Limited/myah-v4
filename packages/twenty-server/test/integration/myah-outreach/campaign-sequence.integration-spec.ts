import { randomUUID } from 'node:crypto';

import gql from 'graphql-tag';

import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { USER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-users.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { WorkflowStatusesUpdateJob } from 'src/modules/workflow/workflow-status/jobs/workflow-statuses-update.job';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { waitForAllJobsToFinish } from 'test/integration/utils/wait-for-all-jobs-to-finish.util';

import {
  assertPendingWriteCleanupSettled,
  drainPendingOperationCleanup,
  type PendingOperationCleanup,
  runWithPendingOperationCleanup,
} from './run-with-pending-operation-cleanup.util';

const campaignSequenceQuery = gql`
  query Task3CampaignSequence($campaignId: UUID!) {
    campaignSequence(campaignId: $campaignId) {
      __typename
      ... on CampaignSequencePresent {
        kind
        snapshot {
          campaignId
          workflowId
          versionId
          sequence
          lifecycleStatus
          editable
          issues {
            code
            path
            message
            messageId
          }
        }
      }
    }
  }
`;

const saveCampaignSequenceMutation = gql`
  mutation Task3SaveCampaignSequence($input: SaveCampaignSequenceInput!) {
    saveCampaignSequence(input: $input) {
      campaignId
      workflowId
      versionId
      sequence
      lifecycleStatus
      editable
      issues {
        code
        path
        message
        messageId
      }
    }
  }
`;

const validateCampaignSequenceMutation = gql`
  mutation Task3ValidateCampaignSequence(
    $campaignId: UUID!
    $expectedVersionId: UUID!
  ) {
    validateCampaignSequence(
      campaignId: $campaignId
      expectedVersionId: $expectedVersionId
    ) {
      versionId
      sequence
      issues {
        code
        path
        message
        messageId
      }
    }
  }
`;

type WorkspaceRow = { id: string };
type AccessTokenGenerator = {
  generateAccessToken(args: {
    userId: string;
    workspaceId: string;
    authProvider: 'password';
  }): Promise<{ token: string }>;
};
type CampaignSequenceSnapshot = Awaited<
  ReturnType<CampaignSequenceService['createInitial']>
>;

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
  const provider = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.entries()])
    .find(
      ([token, wrapper]) =>
        token === type || wrapper.metatype?.name === type.name,
    )?.[1];

  if (!provider?.instance) throw new Error(`Missing provider ${type.name}`);

  return provider.instance as T;
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
  const provider = [...app.container.getModules().values()]
    .flatMap((module) => [...module.providers.values()])
    .find((wrapper) => wrapper.metatype?.name === name);

  if (!provider?.instance) throw new Error(`Missing provider ${name}`);

  return provider.instance as T;
};

const waitFor = async (
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
};

describe('CampaignSequenceService and API (PostgreSQL)', () => {
  const campaignIds = Array.from({ length: 13 }, () => randomUUID());
  const barrierKey = randomUUID();
  const barrierSuffix = barrierKey.split('-').join('');
  const barrierFunction = `myah_319_sequence_barrier_${barrierSuffix}`;
  const versionTrigger = `myah_319_sequence_save_barrier_${barrierSuffix}`;
  let workspaceId: string;
  let schemaName: string;
  let service: CampaignSequenceService;
  let authContext: ReturnType<typeof buildSystemAuthContext>;
  let endpointToken: string;
  let eventEmitSpy: jest.SpyInstance;
  let queueAddSpies: jest.SpyInstance[];
  let workflowQueueAddSpy: jest.SpyInstance;
  let ownsFixture = false;
  const activePendingOperationCleanups = new Set<PendingOperationCleanup>();

  const editedSequence = (subject: string) => ({
    schemaVersion: 1 as const,
    messages: [
      {
        id: randomUUID(),
        channel: 'EMAIL' as const,
        subject,
        body: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: `Body for ${subject}` }],
            },
          ],
        }),
        files: [],
        replyToThread: false,
      },
    ],
    delaysSeconds: [],
  });

  const insertCampaign = async (campaignId: string) => {
    const insertCampaignStatement = `INSERT INTO "${schemaName}"."campaign" ("id", "name", "lifecycleStatus")
       VALUES ($1, $2, 'DRAFT')`;
    await global.testDataSource.query(insertCampaignStatement, [
      campaignId,
      `MYAH-319 Sequence ${campaignId}`,
    ]);
  };

  const createFixture = async (campaignId: string) => {
    await insertCampaign(campaignId);
    return service.createInitial({ authContext, campaignId, workspaceId });
  };

  const prepareSideEffectObservation = async () => {
    await waitForAllJobsToFinish();
    eventEmitSpy.mockClear();
    for (const spy of queueAddSpies) spy.mockClear();
  };

  const callContainsAnyId = (call: unknown[], ids: string[]): boolean => {
    const serialized = JSON.stringify(call);

    return ids.some((id) => serialized.includes(id));
  };

  const expectNoEscapedSideEffects = (ids: string[]) => {
    expect(
      eventEmitSpy.mock.calls.some((call) => callContainsAnyId(call, ids)),
    ).toBe(false);
    for (const spy of queueAddSpies) {
      expect(spy.mock.calls.some((call) => callContainsAnyId(call, ids))).toBe(
        false,
      );
    }
  };

  const expectPostCommitWorkflowSync = (workflowId: string) => {
    expect(workflowQueueAddSpy).toHaveBeenCalledWith(
      WorkflowStatusesUpdateJob.name,
      expect.objectContaining({ workspaceId, workflowIds: [workflowId] }),
    );
  };

  const drainActivePendingOperations = async () => {
    for (const cleanup of [...activePendingOperationCleanups]) {
      await drainPendingOperationCleanup(cleanup);
    }
  };

  beforeAll(async () => {
    const workspaces = await global.testDataSource.query<WorkspaceRow[]>(
      `SELECT "id" FROM core."workspace" ORDER BY "createdAt"`,
    );
    for (const workspace of workspaces) {
      const candidateSchema = getWorkspaceSchemaName(workspace.id);
      const [tables] = await global.testDataSource.query<
        Array<{
          campaign: string | null;
          workflow: string | null;
          workflowVersion: string | null;
          sequenceColumn: boolean;
        }>
      >(
        `SELECT
           to_regclass(format('%I.%I', $1::text, 'campaign'))::text AS campaign,
           to_regclass(format('%I.%I', $1::text, 'workflow'))::text AS workflow,
           to_regclass(format('%I.%I', $1::text, 'workflowVersion'))::text AS "workflowVersion",
           EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = 'workflowVersion'
                AND column_name = 'campaignSequence'
           ) AS "sequenceColumn"`,
        [candidateSchema],
      );
      if (
        tables.campaign !== null &&
        tables.workflow !== null &&
        tables.workflowVersion !== null &&
        tables.sequenceColumn
      ) {
        workspaceId = workspace.id;
        schemaName = candidateSchema;
        break;
      }
    }
    if (!workspaceId || !schemaName) {
      throw new Error(
        'A Myah workspace with Campaign sequence metadata is required',
      );
    }
    if (
      schemaName !== getWorkspaceSchemaName(workspaceId) ||
      !/^workspace_[a-z0-9]+$/.test(schemaName) ||
      !/^[a-z_][a-z0-9_]*$/.test(barrierFunction) ||
      !/^[a-z_][a-z0-9_]*$/.test(versionTrigger)
    ) {
      throw new Error('Unsafe PostgreSQL fixture identifier');
    }

    const residue = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT "id" FROM "${schemaName}"."campaign" WHERE "id" = ANY($1::uuid[])`,
      [campaignIds],
    );
    if (residue.length > 0) {
      throw new Error(
        `Interrupted MYAH-319 fixture residue: ${residue.map(({ id }) => id).join(', ')}`,
      );
    }

    ownsFixture = true;
    service = resolveProvider(CampaignSequenceService);
    authContext = buildSystemAuthContext(workspaceId);
    endpointToken = (
      await resolveProviderByName<AccessTokenGenerator>(
        'AccessTokenService',
      ).generateAccessToken({
        userId: USER_DATA_SEED_IDS.JANE,
        workspaceId,
        authProvider: 'password',
      })
    ).token;

    eventEmitSpy = jest.spyOn(
      resolveProvider(WorkspaceEventEmitter),
      'emitDatabaseBatchEvent',
    );
    const sideEffectQueues = [
      MessageQueue.workflowQueue,
      MessageQueue.webhookQueue,
      MessageQueue.triggerQueue,
      MessageQueue.entityEventsToDbQueue,
    ].map((queue) => global.app.get<MessageQueueService>(getQueueToken(queue)));
    queueAddSpies = sideEffectQueues.map((queue) => jest.spyOn(queue, 'add'));
    workflowQueueAddSpy = queueAddSpies[0];
  });

  afterEach(async () => {
    await drainActivePendingOperations();
    if (!ownsFixture) return;
    const dropTriggerStatement = `DROP TRIGGER IF EXISTS "${versionTrigger}" ON "${schemaName}"."workflowVersion"`;
    const dropFunctionStatement = `DROP FUNCTION IF EXISTS "${schemaName}"."${barrierFunction}"()`;
    await global.testDataSource.query(dropTriggerStatement);
    await global.testDataSource.query(dropFunctionStatement);
  });

  afterAll(async () => {
    await drainActivePendingOperations();
    eventEmitSpy?.mockRestore();
    for (const spy of queueAddSpies ?? []) spy.mockRestore();
    if (!ownsFixture) return;
    const workflows = await global.testDataSource.query<Array<{ id: string }>>(
      `SELECT "id" FROM "${schemaName}"."workflow"
        WHERE "outreachCampaignId" = ANY($1::uuid[])`,
      [campaignIds],
    );
    const workflowIds = workflows.map(({ id }) => id);
    if (workflowIds.length > 0) {
      const deleteVersionsStatement = `DELETE FROM "${schemaName}"."workflowVersion"
          WHERE "workflowId" = ANY($1::uuid[])`;
      const deleteWorkflowsStatement = `DELETE FROM "${schemaName}"."workflow" WHERE "id" = ANY($1::uuid[])`;
      await global.testDataSource.query(deleteVersionsStatement, [workflowIds]);
      await global.testDataSource.query(deleteWorkflowsStatement, [
        workflowIds,
      ]);
    }
    const deleteCampaignsStatement = `DELETE FROM "${schemaName}"."campaign" WHERE "id" = ANY($1::uuid[])`;
    await global.testDataSource.query(deleteCampaignsStatement, [campaignIds]);

    const remainingOwnedRows = await global.testDataSource.query<
      Array<{ kind: string; count: string }>
    >(
      `SELECT 'campaign' AS kind, count(*)::text AS count
         FROM "${schemaName}"."campaign" WHERE "id" = ANY($1::uuid[])
       UNION ALL
       SELECT 'workflow' AS kind, count(*)::text AS count
         FROM "${schemaName}"."workflow"
        WHERE "outreachCampaignId" = ANY($1::uuid[])
       UNION ALL
       SELECT 'workflowVersion' AS kind, count(*)::text AS count
         FROM "${schemaName}"."workflowVersion"
        WHERE "workflowId" = ANY($5::uuid[])
       UNION ALL
       SELECT 'function' AS kind, count(*)::text AS count
         FROM pg_proc AS procedure
         INNER JOIN pg_namespace AS namespace
           ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = $2 AND procedure.proname = $3
       UNION ALL
       SELECT 'trigger' AS kind, count(*)::text AS count
         FROM pg_trigger WHERE tgname = $4`,
      [campaignIds, schemaName, barrierFunction, versionTrigger, workflowIds],
    );
    if (remainingOwnedRows.some(({ count }) => count !== '0')) {
      throw new Error(
        `MYAH-319 fixture cleanup failed: ${JSON.stringify(remainingOwnedRows)}`,
      );
    }
  });

  it('creates, saves, reloads, validates, and preserves immutable content', async () => {
    const initial = await createFixture(campaignIds[0]);
    expect(initial.sequence).toEqual({
      schemaVersion: 1,
      messages: [],
      delaysSeconds: [],
    });
    const [beforeHistorical] = await global.testDataSource.query<
      Array<{ campaignSequenceText: string }>
    >(
      `SELECT "campaignSequence"::text AS "campaignSequenceText"
         FROM "${schemaName}"."workflowVersion" WHERE "id" = $1`,
      [initial.versionId],
    );
    const edited = editedSequence('Exact payload');
    const saved = await service.save({
      authContext,
      campaignId: campaignIds[0],
      expectedVersionId: initial.versionId,
      sequence: edited,
      workspaceId,
    });
    expect(saved.versionId).not.toBe(initial.versionId);
    expect(saved.sequence).toEqual(edited);

    const loaded = await service.load({
      authContext,
      campaignId: campaignIds[0],
      workspaceId,
    });
    expect(loaded).toEqual({ kind: 'SEQUENCE', snapshot: saved });
    await expect(
      service.validate({
        authContext,
        campaignId: campaignIds[0],
        expectedVersionId: saved.versionId,
        workspaceId,
      }),
    ).resolves.toEqual(saved);
    await expect(
      service.save({
        authContext,
        campaignId: campaignIds[0],
        expectedVersionId: initial.versionId,
        sequence: edited,
        workspaceId,
      }),
    ).rejects.toThrow('Sequence changed. Reload before saving.');

    const [historical] = await global.testDataSource.query<
      Array<{
        campaignSequence: unknown;
        campaignSequenceText: string;
        trigger: unknown;
        steps: unknown;
      }>
    >(
      `SELECT "campaignSequence", "campaignSequence"::text AS "campaignSequenceText",
              "trigger", "steps"
         FROM "${schemaName}"."workflowVersion" WHERE "id" = $1`,
      [initial.versionId],
    );
    expect(historical).toEqual({
      campaignSequence: initial.sequence,
      campaignSequenceText: beforeHistorical.campaignSequenceText,
      trigger: null,
      steps: null,
    });

    const foreign = await createFixture(campaignIds[1]);
    const beforeCrossCampaignSave = await global.testDataSource.query<
      Array<{ count: string }>
    >(
      `SELECT count(*)::text AS count FROM "${schemaName}"."workflowVersion"
        WHERE "workflowId" = $1`,
      [initial.workflowId],
    );
    await expect(
      service.save({
        authContext,
        campaignId: campaignIds[0],
        expectedVersionId: foreign.versionId,
        sequence: edited,
        workspaceId,
      }),
    ).rejects.toThrow('Sequence changed. Reload before saving.');
    const afterCrossCampaignSave = await global.testDataSource.query<
      Array<{ count: string }>
    >(
      `SELECT count(*)::text AS count FROM "${schemaName}"."workflowVersion"
        WHERE "workflowId" = $1`,
      [initial.workflowId],
    );
    expect(afterCrossCampaignSave).toEqual(beforeCrossCampaignSave);
  });

  it('allows exactly one of two simultaneous saves of one expected version', async () => {
    const loaded = await service.load({
      authContext,
      campaignId: campaignIds[1],
      workspaceId,
    });
    if (loaded.kind !== 'SEQUENCE') {
      throw new Error('Expected a Campaign sequence fixture');
    }
    const initial = loaded.snapshot;
    const results = await Promise.allSettled([
      service.save({
        authContext,
        campaignId: campaignIds[1],
        expectedVersionId: initial.versionId,
        sequence: editedSequence('Winner A'),
        workspaceId,
      }),
      service.save({
        authContext,
        campaignId: campaignIds[1],
        expectedVersionId: initial.versionId,
        sequence: editedSequence('Winner B'),
        workspaceId,
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(
      (
        results.find(
          ({ status }) => status === 'rejected',
        ) as PromiseRejectedResult
      ).reason,
    ).toMatchObject({
      message: 'Sequence changed. Reload before saving.',
    });
  });

  it('rolls back invalid payloads and reports incomplete content as issues', async () => {
    const initial = await createFixture(campaignIds[2]);
    const beforeCount = await global.testDataSource.query<
      Array<{ count: string }>
    >(
      `SELECT count(*)::text AS count FROM "${schemaName}"."workflowVersion"
        WHERE "workflowId" = $1`,
      [initial.workflowId],
    );
    await expect(
      service.save({
        authContext,
        campaignId: campaignIds[2],
        expectedVersionId: initial.versionId,
        sequence: {
          ...editedSequence('malicious'),
          senderId: randomUUID(),
        } as never,
        workspaceId,
      }),
    ).rejects.toThrow();
    const afterCount = await global.testDataSource.query<
      Array<{ count: string }>
    >(
      `SELECT count(*)::text AS count FROM "${schemaName}"."workflowVersion"
        WHERE "workflowId" = $1`,
      [initial.workflowId],
    );
    expect(afterCount).toEqual(beforeCount);

    const first = editedSequence('');
    const second = {
      ...editedSequence('Second').messages[0],
      id: randomUUID(),
    };
    const incomplete = {
      ...first,
      messages: [first.messages[0], second],
      delaysSeconds: [null],
    };
    const saved = await service.save({
      authContext,
      campaignId: campaignIds[2],
      expectedVersionId: initial.versionId,
      sequence: incomplete,
      workspaceId,
    });
    expect(saved.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CONTENT_REQUIRED' }),
        expect.objectContaining({ code: 'DELAY_REQUIRED' }),
      ]),
    );
  });

  it.each([null, 'ACTIVE', 'PAUSED', 'COMPLETED'])(
    'rejects authoring when persisted lifecycle is %p',
    async (status) => {
      const campaignId = campaignIds[3];
      const existing = await global.testDataSource.query<Array<{ id: string }>>(
        `SELECT "id" FROM "${schemaName}"."campaign" WHERE "id" = $1`,
        [campaignId],
      );
      const initial =
        existing.length === 0
          ? await createFixture(campaignId)
          : (
              (await service.load({
                authContext,
                campaignId,
                workspaceId,
              })) as { kind: 'SEQUENCE'; snapshot: CampaignSequenceSnapshot }
            ).snapshot;
      const setLifecycleStatement = `UPDATE "${schemaName}"."campaign" SET "lifecycleStatus" = $2 WHERE "id" = $1`;
      await global.testDataSource.query(setLifecycleStatement, [
        campaignId,
        status,
      ]);
      await expect(
        service.save({
          authContext,
          campaignId,
          expectedVersionId: initial.versionId,
          sequence: editedSequence(String(status)),
          workspaceId,
        }),
      ).rejects.toThrow('Stop Campaign outreach before editing.');
      const resetLifecycleStatement = `UPDATE "${schemaName}"."campaign" SET "lifecycleStatus" = 'DRAFT' WHERE "id" = $1`;
      await global.testDataSource.query(resetLifecycleStatement, [campaignId]);
    },
  );

  it('does not expose unsupported UNKNOWN or STOPPED persisted lifecycle values', async () => {
    const rows = await global.testDataSource.query<Array<{ label: string }>>(
      `SELECT enum_value.enumlabel AS label
         FROM pg_type AS enum_type
         INNER JOIN pg_namespace AS namespace
           ON namespace.oid = enum_type.typnamespace
         INNER JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
        WHERE namespace.nspname = $1
          AND enum_type.typname = 'campaign_lifecycleStatus_enum'`,
      [schemaName],
    );

    const labels = rows.map(({ label }) => label);

    expect(labels).toEqual(expect.arrayContaining(['DRAFT', 'ACTIVE']));
    expect(labels).not.toContain('UNKNOWN');
    expect(labels).not.toContain('STOPPED');
  });

  it('returns committed create/save snapshots with an atomic Draft projection when queueing fails', async () => {
    const campaignId = campaignIds[10];
    await insertCampaign(campaignId);
    const sequenceLogger = (
      service as unknown as {
        logger: { error: (message: string, trace?: string) => void };
      }
    ).logger;
    const diagnosticSpy = jest
      .spyOn(sequenceLogger, 'error')
      .mockImplementation(() => undefined);

    try {
      workflowQueueAddSpy.mockRejectedValueOnce(
        new Error('injected create queue failure'),
      );
      const initial = await service.createInitial({
        authContext,
        campaignId,
        workspaceId,
      });
      const selectWorkflowStatusesStatement = `SELECT
          'DRAFT' = ANY("statuses") AS "hasDraft",
          cardinality("statuses") AS "statusCount"
        FROM "${schemaName}"."workflow" WHERE "id" = $1`;
      const [createdWorkflow] = await global.testDataSource.query<
        Array<{ hasDraft: boolean; statusCount: number }>
      >(selectWorkflowStatusesStatement, [initial.workflowId]);
      expect(createdWorkflow).toEqual({ hasDraft: true, statusCount: 1 });
      const clearWorkflowStatusesStatement = `UPDATE "${schemaName}"."workflow"
        SET "statuses" = NULL WHERE "id" = $1`;
      await global.testDataSource.query(clearWorkflowStatusesStatement, [
        initial.workflowId,
      ]);
      await expect(
        service.createInitial({ authContext, campaignId, workspaceId }),
      ).resolves.toEqual(initial);
      const [repairedWorkflow] = await global.testDataSource.query<
        Array<{ hasDraft: boolean; statusCount: number }>
      >(selectWorkflowStatusesStatement, [initial.workflowId]);
      expect(repairedWorkflow).toEqual({ hasDraft: true, statusCount: 1 });

      workflowQueueAddSpy.mockRejectedValueOnce(
        new Error('injected save queue failure'),
      );
      const saved = await service.save({
        authContext,
        campaignId,
        expectedVersionId: initial.versionId,
        sequence: editedSequence('Committed despite queue failure'),
        workspaceId,
      });
      const [savedWorkflow] = await global.testDataSource.query<
        Array<{ hasDraft: boolean; statusCount: number }>
      >(selectWorkflowStatusesStatement, [saved.workflowId]);
      expect(savedWorkflow).toEqual({ hasDraft: true, statusCount: 1 });
      await expect(
        service.load({ authContext, campaignId, workspaceId }),
      ).resolves.toEqual({ kind: 'SEQUENCE', snapshot: saved });
      await expect(
        service.save({
          authContext,
          campaignId,
          expectedVersionId: initial.versionId,
          sequence: editedSequence('Stale retry'),
          workspaceId,
        }),
      ).rejects.toThrow('Sequence changed. Reload before saving.');
      expect(diagnosticSpy).toHaveBeenCalledTimes(2);
    } finally {
      diagnosticSpy.mockRestore();
    }
  });

  it.each([
    ['ACTIVE', campaignIds[11]],
    ['DEACTIVATED', campaignIds[12]],
  ])(
    'preserves an actual %s published revision and inserts one Draft successor',
    async (publishedStatus, campaignId) => {
      const initial = await createFixture(campaignId);
      const publishVersionStatement = `UPDATE "${schemaName}"."workflowVersion"
          SET "status" = $2 WHERE "id" = $1`;
      const publishWorkflowStatement = `UPDATE "${schemaName}"."workflow"
          SET "lastPublishedVersionId" = $2 WHERE "id" = $1`;
      await global.testDataSource.query(publishVersionStatement, [
        initial.versionId,
        publishedStatus,
      ]);
      await global.testDataSource.query(publishWorkflowStatement, [
        initial.workflowId,
        initial.versionId,
      ]);

      const saved = await service.save({
        authContext,
        campaignId,
        expectedVersionId: initial.versionId,
        sequence: editedSequence(`After ${publishedStatus}`),
        workspaceId,
      });
      const selectVersionsStatement = `SELECT "id", "status" FROM "${schemaName}"."workflowVersion"
        WHERE "workflowId" = $1 ORDER BY "createdAt", "id"`;
      const versions = await global.testDataSource.query<
        Array<{ id: string; status: string }>
      >(selectVersionsStatement, [initial.workflowId]);

      expect(versions).toHaveLength(2);
      expect(versions).toEqual(
        expect.arrayContaining([
          { id: initial.versionId, status: publishedStatus },
          { id: saved.versionId, status: 'DRAFT' },
        ]),
      );
    },
  );

  it('rolls back archival without emitting events or queueing side effects when the immutable successor insert fails', async () => {
    const initial = await createFixture(campaignIds[7]);
    await prepareSideEffectObservation();
    const edited = editedSequence('Must roll back');
    const [before] = await global.testDataSource.query<
      Array<{ campaignSequenceText: string; status: string; count: string }>
    >(
      `SELECT current_version."campaignSequence"::text AS "campaignSequenceText",
              current_version."status",
              version_count.count::text AS count
         FROM "${schemaName}"."workflowVersion" AS current_version
         CROSS JOIN (
           SELECT count(*) FROM "${schemaName}"."workflowVersion"
            WHERE "workflowId" = $2
         ) AS version_count
        WHERE current_version."id" = $1`,
      [initial.versionId, initial.workflowId],
    );
    if (!/^[0-9a-f-]{36}$/.test(initial.workflowId)) {
      throw new Error('Unsafe Workflow fixture ID');
    }
    const createFailureFunctionStatement = `CREATE FUNCTION "${schemaName}"."${barrierFunction}"() RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'injected MYAH-319 successor insert failure';
       END;
       $$ LANGUAGE plpgsql`;
    const createFailureTriggerStatement = `CREATE TRIGGER "${versionTrigger}" BEFORE INSERT ON "${schemaName}"."workflowVersion"
       FOR EACH ROW WHEN (NEW."workflowId" = '${initial.workflowId}'::uuid)
       EXECUTE FUNCTION "${schemaName}"."${barrierFunction}"()`;
    await global.testDataSource.query(createFailureFunctionStatement);
    await global.testDataSource.query(createFailureTriggerStatement);

    await expect(
      service.save({
        authContext,
        campaignId: campaignIds[7],
        expectedVersionId: initial.versionId,
        sequence: edited,
        workspaceId,
      }),
    ).rejects.toThrow('injected MYAH-319 successor insert failure');

    const [after] = await global.testDataSource.query<
      Array<{ campaignSequenceText: string; status: string; count: string }>
    >(
      `SELECT current_version."campaignSequence"::text AS "campaignSequenceText",
              current_version."status",
              version_count.count::text AS count
         FROM "${schemaName}"."workflowVersion" AS current_version
         CROSS JOIN (
           SELECT count(*) FROM "${schemaName}"."workflowVersion"
            WHERE "workflowId" = $2
         ) AS version_count
        WHERE current_version."id" = $1`,
      [initial.versionId, initial.workflowId],
    );
    expect(after).toEqual(before);
    expect(after.status).toBe('DRAFT');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expectNoEscapedSideEffects([initial.workflowId, initial.versionId]);
  });

  it('rolls back initial creation without emitting events or queueing side effects', async () => {
    const campaignId = campaignIds[8];
    await insertCampaign(campaignId);
    const createFailureFunctionStatement = `CREATE FUNCTION "${schemaName}"."${barrierFunction}"() RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'injected MYAH-319 initial version failure';
       END;
       $$ LANGUAGE plpgsql`;
    const createFailureTriggerStatement = `CREATE TRIGGER "${versionTrigger}" BEFORE INSERT ON "${schemaName}"."workflowVersion"
       FOR EACH ROW WHEN (NEW."campaignSequence" IS NOT NULL)
       EXECUTE FUNCTION "${schemaName}"."${barrierFunction}"()`;
    await global.testDataSource.query(createFailureFunctionStatement);
    await global.testDataSource.query(createFailureTriggerStatement);
    await prepareSideEffectObservation();

    await expect(
      service.createInitial({ authContext, campaignId, workspaceId }),
    ).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expectNoEscapedSideEffects([campaignId]);
    const [remaining] = await global.testDataSource.query<
      Array<{ count: string }>
    >(
      `SELECT count(*)::text AS count FROM "${schemaName}"."workflow"
        WHERE "outreachCampaignId" = $1`,
      [campaignId],
    );
    expect(remaining.count).toBe('0');
  });

  it('defers initial creation synchronization until commit', async () => {
    const campaignId = campaignIds[9];
    await insertCampaign(campaignId);
    const createBarrierFunctionStatement = `CREATE FUNCTION "${schemaName}"."${barrierFunction}"() RETURNS trigger AS $$
       BEGIN
         PERFORM pg_advisory_xact_lock(hashtext('${barrierKey}'));
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`;
    const createBarrierTriggerStatement = `CREATE TRIGGER "${versionTrigger}" BEFORE INSERT ON "${schemaName}"."workflowVersion"
       FOR EACH ROW WHEN (NEW."campaignSequence" IS NOT NULL)
       EXECUTE FUNCTION "${schemaName}"."${barrierFunction}"()`;
    await global.testDataSource.query(createBarrierFunctionStatement);
    await global.testDataSource.query(createBarrierTriggerStatement);
    const barrier = global.testDataSource.createQueryRunner();
    await barrier.connect();
    await barrier.query('SELECT pg_advisory_lock(hashtext($1))', [barrierKey]);
    await prepareSideEffectObservation();
    try {
      const creating = service.createInitial({
        authContext,
        campaignId,
        workspaceId,
      });
      await waitFor('initial version insert barrier', async () => {
        const [{ waiting }] = await global.testDataSource.query<
          Array<{ waiting: boolean }>
        >(
          `SELECT EXISTS (
             SELECT 1 FROM pg_locks
              WHERE locktype = 'advisory' AND granted = false
                AND objid = hashtext($1)::oid
           ) AS waiting`,
          [barrierKey],
        );
        return waiting;
      });
      expectNoEscapedSideEffects([campaignId]);
      await barrier.query('SELECT pg_advisory_unlock(hashtext($1))', [
        barrierKey,
      ]);
      const created = await creating;
      expectPostCommitWorkflowSync(created.workflowId);
      await waitForAllJobsToFinish();
      const [workflow] = await global.testDataSource.query<
        Array<{ hasDraftStatus: boolean }>
      >(
        `SELECT 'DRAFT' = ANY("statuses") AS "hasDraftStatus"
           FROM "${schemaName}"."workflow" WHERE "id" = $1`,
        [created.workflowId],
      );
      expect(workflow.hasDraftStatus).toBe(true);
    } finally {
      await barrier.query('SELECT pg_advisory_unlock(hashtext($1))', [
        barrierKey,
      ]);
      await barrier.release();
    }
  });

  it('serializes a status update that owns the Campaign row before save', async () => {
    const initial = await createFixture(campaignIds[4]);
    const runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const activateCampaignStatement = `UPDATE "${schemaName}"."campaign" SET "lifecycleStatus" = 'ACTIVE' WHERE "id" = $1`;
      await runner.query(activateCampaignStatement, [campaignIds[4]]);
      let settled = false;
      const save = service
        .save({
          authContext,
          campaignId: campaignIds[4],
          expectedVersionId: initial.versionId,
          sequence: editedSequence('Blocked save'),
          workspaceId,
        })
        .finally(() => {
          settled = true;
        });
      await waitFor('save to wait on the Campaign row', async () => {
        const [{ waiting }] = await global.testDataSource.query<
          Array<{ waiting: boolean }>
        >(
          `SELECT EXISTS (
             SELECT 1 FROM pg_stat_activity
              WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'
                AND query ILIKE '%campaign%FOR UPDATE%'
           ) AS waiting`,
        );
        return waiting || settled;
      });
      expect(settled).toBe(false);
      await runner.commitTransaction();
      await expect(save).rejects.toThrow(
        'Stop Campaign outreach before editing.',
      );
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      const resetCampaignStatement = `UPDATE "${schemaName}"."campaign" SET "lifecycleStatus" = 'DRAFT' WHERE "id" = $1`;
      await global.testDataSource.query(resetCampaignStatement, [
        campaignIds[4],
      ]);
    }
  });

  it('holds the Campaign row until save commits before a status update', async () => {
    const initial = await createFixture(campaignIds[5]);
    if (
      !/^[0-9a-f-]{36}$/.test(initial.workflowId) ||
      !/^[0-9a-f-]{36}$/.test(barrierKey)
    ) {
      throw new Error('Unsafe Campaign lock fixture identifier');
    }
    const createBarrierFunctionStatement = `CREATE FUNCTION "${schemaName}"."${barrierFunction}"() RETURNS trigger AS $$
       BEGIN
         PERFORM pg_advisory_xact_lock(hashtext('${barrierKey}'));
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`;
    const createBarrierTriggerStatement = `CREATE TRIGGER "${versionTrigger}" BEFORE INSERT ON "${schemaName}"."workflowVersion"
       FOR EACH ROW WHEN (NEW."workflowId" = '${initial.workflowId}'::uuid)
       EXECUTE FUNCTION "${schemaName}"."${barrierFunction}"()`;
    await global.testDataSource.query(createBarrierFunctionStatement);
    await global.testDataSource.query(createBarrierTriggerStatement);
    const barrier = global.testDataSource.createQueryRunner();
    const updater = global.testDataSource.createQueryRunner();
    await barrier.connect();
    await updater.connect();
    await barrier.query('SELECT pg_advisory_lock(hashtext($1))', [barrierKey]);
    const [{ pid: barrierPid }] = (await barrier.query(
      'SELECT pg_backend_pid()::integer AS pid',
    )) as Array<{ pid: number }>;
    await prepareSideEffectObservation();

    let blockerReleased = false;
    let barrierReleased = false;
    let updaterReleased = false;
    let campaignReset = false;
    let saveBackendPid: number | undefined;
    let saveCancellationConfirmed = false;
    let saveOutcome: 'PENDING' | 'REJECTED' | 'RESOLVED' = 'PENDING';
    let statusUpdate: Promise<unknown> | undefined;
    let statusUpdateOutcome: 'NOT_STARTED' | 'PENDING' | 'SETTLED' =
      'NOT_STARTED';
    const releaseBlocker = async () => {
      if (blockerReleased) return;
      await barrier.query('SELECT pg_advisory_unlock(hashtext($1))', [
        barrierKey,
      ]);
      blockerReleased = true;
    };
    const save = service
      .save({
        authContext,
        campaignId: campaignIds[5],
        expectedVersionId: initial.versionId,
        sequence: editedSequence('Save first'),
        workspaceId,
      })
      .then(
        (snapshot) => {
          saveOutcome = 'RESOLVED';
          return snapshot;
        },
        (error: unknown) => {
          saveOutcome = 'REJECTED';
          throw error;
        },
      );
    void save.catch(() => undefined);

    let cleanup!: PendingOperationCleanup;
    cleanup = {
      abort: async () => {
        if (saveOutcome !== 'PENDING') return;
        if (saveBackendPid === undefined) {
          const waiters = await global.testDataSource.query<
            Array<{ pid: number }>
          >(
            `SELECT activity.pid::integer AS pid
               FROM pg_stat_activity activity
              WHERE $1::integer = ANY(pg_blocking_pids(activity.pid))
              ORDER BY activity.pid`,
            [barrierPid],
          );
          if (waiters.length !== 1) {
            throw new Error(
              `Expected one MYAH-319 save waiter, found ${waiters.length}`,
            );
          }
          saveBackendPid = waiters[0].pid;
        }
        const [{ cancelled }] = await global.testDataSource.query<
          Array<{ cancelled: boolean }>
        >(
          `SELECT CASE
                    WHEN $1::integer = ANY(pg_blocking_pids($2::integer))
                    THEN pg_cancel_backend($2::integer)
                    ELSE false
                  END AS cancelled`,
          [barrierPid, saveBackendPid],
        );
        if (!cancelled) {
          throw new Error('Failed to cancel the owned MYAH-319 save waiter');
        }
        saveCancellationConfirmed = true;
      },
      drain: async () => {
        const [saveResult, statusUpdateResult] = await Promise.allSettled([
          save,
          ...(statusUpdate ? [statusUpdate] : []),
        ]);
        assertPendingWriteCleanupSettled({
          isExpectedSaveCancellation: (error) => {
            if (typeof error !== 'object' || error === null) return false;
            const candidate = error as {
              code?: unknown;
              driverError?: { code?: unknown };
            };

            return (
              candidate.code === '57014' ||
              candidate.driverError?.code === '57014'
            );
          },
          saveCancellationConfirmed,
          saveResult,
          statusUpdateResult,
        });
      },
      finalize: async () => {
        if (saveOutcome === 'PENDING' || statusUpdateOutcome === 'PENDING') {
          throw new Error(
            'Refusing to release MYAH-319 fixture with pending writes',
          );
        }
        await releaseBlocker();
        if (!barrierReleased) {
          await barrier.release();
          barrierReleased = true;
        }
        if (!updaterReleased) {
          await updater.release();
          updaterReleased = true;
        }
        if (!campaignReset) {
          const resetCampaignStatement = `UPDATE "${schemaName}"."campaign" SET "lifecycleStatus" = 'DRAFT' WHERE "id" = $1`;
          await global.testDataSource.query(resetCampaignStatement, [
            campaignIds[5],
          ]);
          campaignReset = true;
        }
        activePendingOperationCleanups.delete(cleanup);
      },
      reportCleanupFailure: (phase, error) => {
        process.stderr.write(
          `MYAH-319 pending-write cleanup failed during ${phase}: ${String(error)}\n`,
        );
      },
      timeoutMs: 5_000,
    };
    activePendingOperationCleanups.add(cleanup);

    await runWithPendingOperationCleanup(async () => {
      await waitFor('save insert barrier', async () => {
        const waiters = await global.testDataSource.query<
          Array<{ pid: number }>
        >(
          `SELECT activity.pid::integer AS pid
             FROM pg_stat_activity activity
            WHERE $1::integer = ANY(pg_blocking_pids(activity.pid))
            ORDER BY activity.pid`,
          [barrierPid],
        );
        if (waiters.length > 1) {
          throw new Error(
            `Expected at most one MYAH-319 save waiter, found ${waiters.length}`,
          );
        }
        saveBackendPid = waiters[0]?.pid;
        return saveBackendPid !== undefined;
      });
      expectNoEscapedSideEffects([initial.workflowId, initial.versionId]);
      const [{ pid }] = (await updater.query(
        'SELECT pg_backend_pid() AS pid',
      )) as Array<{ pid: number }>;
      const activateCampaignStatement = `UPDATE "${schemaName}"."campaign" SET "lifecycleStatus" = 'ACTIVE' WHERE "id" = $1`;
      statusUpdateOutcome = 'PENDING';
      statusUpdate = updater
        .query(activateCampaignStatement, [campaignIds[5]])
        .finally(() => {
          statusUpdateOutcome = 'SETTLED';
        });
      void statusUpdate.catch(() => undefined);
      await waitFor('status update to wait on Campaign row', async () => {
        const [{ waiting }] = await global.testDataSource.query<
          Array<{ waiting: boolean }>
        >(
          `SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = $1`,
          [pid],
        );
        return waiting;
      });
      await releaseBlocker();
      const saved = await save;
      await statusUpdate;
      expect(saved).toMatchObject({ sequence: expect.any(Object) });
      expectPostCommitWorkflowSync(initial.workflowId);
      const [campaign] = await global.testDataSource.query<
        Array<{ lifecycleStatus: string }>
      >(
        `SELECT "lifecycleStatus" FROM "${schemaName}"."campaign" WHERE "id" = $1`,
        [campaignIds[5]],
      );
      expect(campaign.lifecycleStatus).toBe('ACTIVE');
    }, cleanup);
  });

  it('serves authenticated load, save, and validation endpoints', async () => {
    const initial = await createFixture(campaignIds[6]);
    const loaded = await makeGraphqlAPIRequest(
      {
        query: campaignSequenceQuery,
        variables: { campaignId: campaignIds[6] },
      },
      endpointToken,
    );
    expect(loaded.body.errors).toBeUndefined();
    expect(loaded.body.data.campaignSequence).toMatchObject({
      __typename: 'CampaignSequencePresent',
      kind: 'SEQUENCE',
      snapshot: { versionId: initial.versionId },
    });

    const edited = editedSequence('Endpoint save');
    const saved = await makeGraphqlAPIRequest(
      {
        query: saveCampaignSequenceMutation,
        variables: {
          input: {
            campaignId: campaignIds[6],
            expectedVersionId: initial.versionId,
            sequence: edited,
          },
        },
      },
      endpointToken,
    );
    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.saveCampaignSequence).toMatchObject({
      sequence: edited,
    });

    const validated = await makeGraphqlAPIRequest(
      {
        query: validateCampaignSequenceMutation,
        variables: {
          campaignId: campaignIds[6],
          expectedVersionId: saved.body.data.saveCampaignSequence.versionId,
        },
      },
      endpointToken,
    );
    expect(validated.body.errors).toBeUndefined();
    expect(validated.body.data.validateCampaignSequence).toMatchObject({
      sequence: edited,
      issues: [],
    });
  });

  it('rejects an authenticated workspace scope paired with another workspace ID', async () => {
    const otherWorkspace = randomUUID();
    await expect(
      service.load({
        authContext,
        campaignId: campaignIds[7],
        workspaceId: otherWorkspace,
      }),
    ).rejects.toThrow('Campaign not found or inaccessible');
  });
});
