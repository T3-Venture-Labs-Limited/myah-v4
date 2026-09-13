import { ConflictException } from '@nestjs/common';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

import { LegacyCampaignSequenceCleanupWorkspaceService } from '../legacy-campaign-sequence-cleanup.workspace-service';

const workspaceId = '20202020-1111-4111-8111-111111111111';
const campaignId = '20202020-2222-4222-8222-222222222222';
const legacyWorkflowId = '20202020-3333-4333-8333-333333333333';
const replacementWorkflowId = '20202020-4444-4444-8444-444444444444';
const replacementVersionId = '20202020-5555-4555-8555-555555555555';
const authContext = {
  type: 'system',
  workspace: { id: workspaceId },
} as WorkspaceAuthContext;

const snapshot = {
  campaignId,
  editable: true,
  issues: [],
  lifecycleStatus: 'DRAFT',
  sequence: { nodes: [], edges: [] },
  versionId: replacementVersionId,
  workflowId: replacementWorkflowId,
};

type ContextOptions = {
  activeWorkflowId?: string | null;
  archiveFailure?: boolean;
  campaignLifecycleStatus?: string | null;
  createFailure?: boolean;
  expectedDeletedAt?: string | null;
  reconciliationFailure?: boolean;
  replacementIsSequence?: boolean;
  runs?: Array<{ id: string; status: string }>;
};

const createContext = ({
  activeWorkflowId = legacyWorkflowId,
  archiveFailure = false,
  campaignLifecycleStatus = 'DRAFT',
  createFailure = false,
  expectedDeletedAt = null,
  reconciliationFailure = false,
  replacementIsSequence = false,
  runs = [],
}: ContextOptions = {}) => {
  const queries: string[] = [];
  let currentActiveWorkflowId = activeWorkflowId;
  let currentExpectedDeletedAt = expectedDeletedAt;
  let currentRuns = runs;
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    queries.push(sql);

    if (sql.includes('pg_advisory_xact_lock')) {
      return [];
    }
    if (sql.includes('AS "campaignLifecycleStatus"')) {
      return [{ campaignLifecycleStatus }];
    }
    if (sql.includes('AS "activeWorkflowId"')) {
      return currentActiveWorkflowId
        ? [{ activeWorkflowId: currentActiveWorkflowId }]
        : [];
    }
    if (sql.includes('AS "expectedWorkflowId"')) {
      return [
        {
          expectedWorkflowId: legacyWorkflowId,
          deletedAt: currentExpectedDeletedAt,
        },
      ];
    }
    if (sql.includes('FROM') && sql.includes('"workflowVersion"')) {
      if (parameters[0] === replacementWorkflowId) {
        return [
          {
            id: replacementVersionId,
            status: 'DRAFT',
            campaignSequence: replacementIsSequence
              ? { nodes: [], edges: [] }
              : null,
          },
        ];
      }

      return [
        {
          id: 'legacy-version',
          status: 'ACTIVE',
          campaignSequence: null,
        },
      ];
    }
    if (sql.includes('"workflowRun"') && sql.includes('SELECT')) {
      return currentRuns;
    }
    if (
      archiveFailure &&
      sql.trim().startsWith('UPDATE') &&
      sql.includes('"workflowVersion"')
    ) {
      throw new Error('injected archive failure');
    }
    if (
      sql.trim().startsWith('UPDATE') &&
      sql.includes('"workflow"') &&
      !sql.includes('"workflowVersion"')
    ) {
      currentExpectedDeletedAt = '2026-01-01T00:00:00.000Z';
      currentActiveWorkflowId = null;
    }

    return [];
  });
  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: Record<string, unknown>) => unknown) =>
        callback({ queryRunner: { query } }),
    ),
  };
  const globalWorkspaceOrmManager = {
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
  };
  const campaignSequenceService = {
    assertCampaignSequenceReplacementAllowed: jest
      .fn()
      .mockResolvedValue(undefined),
    createInitial: createFailure
      ? jest
          .fn()
          .mockRejectedValueOnce(new Error('injected create failure'))
          .mockResolvedValue(snapshot)
      : jest.fn().mockResolvedValue(snapshot),
  };
  const workflowTriggerWorkspaceService = {
    reconcileLegacyCampaignWorkflowVersionAfterReplacement:
      reconciliationFailure
        ? jest
            .fn()
            .mockRejectedValue(new Error('injected reconciliation failure'))
        : jest.fn().mockResolvedValue(undefined),
    stopPendingLegacyCampaignWorkflowRunForReplacement: jest
      .fn()
      .mockImplementation(async (workflowRunId: string) => {
        currentRuns = currentRuns.map((run) =>
          run.id === workflowRunId ? { ...run, status: 'STOPPED' } : run,
        );

        return true;
      }),
  };
  const workflowQueue = {
    add: reconciliationFailure
      ? jest.fn().mockRejectedValue(new Error('injected queue failure'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const service = new LegacyCampaignSequenceCleanupWorkspaceService(
    globalWorkspaceOrmManager as never,
    campaignSequenceService as never,
    workflowTriggerWorkspaceService as never,
    workflowQueue as never,
  );

  return {
    campaignSequenceService,
    queries,
    query,
    service,
    workflowQueue,
    workflowTriggerWorkspaceService,
  };
};

const scope = {
  authContext,
  campaignId,
  expectedWorkflowId: legacyWorkflowId,
  workspaceId,
};

describe('LegacyCampaignSequenceCleanupWorkspaceService', () => {
  it('dry-inspects the exact legacy definition without mutating it', async () => {
    const { campaignSequenceService, queries, service } = createContext({
      runs: [
        { id: 'pending-run', status: 'ENQUEUED' },
        { id: 'receipt-run', status: 'COMPLETED' },
      ],
    });

    await expect(
      service.inspectLegacyCampaignSequenceReplacement(scope),
    ).resolves.toEqual({
      campaignId,
      expectedWorkflowId: legacyWorkflowId,
      pendingRunIds: ['pending-run'],
      retainedRunIds: ['pending-run', 'receipt-run'],
      state: 'READY',
    });

    expect(
      campaignSequenceService.assertCampaignSequenceReplacementAllowed,
    ).toHaveBeenCalledWith({ authContext, campaignId, workspaceId });
    expect(queries.some((sql) => /^(UPDATE|DELETE)\b/.test(sql.trim()))).toBe(
      false,
    );
  });

  it('rechecks Draft lifecycle under the cleanup lock', async () => {
    const { campaignSequenceService, queries, service } = createContext({
      campaignLifecycleStatus: 'ACTIVE',
    });

    await expect(
      service.replaceLegacyCampaignSequence(scope),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(campaignSequenceService.createInitial).not.toHaveBeenCalled();
    expect(queries.some((sql) => /^(UPDATE|DELETE)\b/.test(sql.trim()))).toBe(
      false,
    );
  });

  it.each(['RUNNING', 'STOPPING', 'FAILED', 'UNKNOWN_PROVIDER_STATE'])(
    'fails closed while a legacy run is %s',
    async (status) => {
      const { campaignSequenceService, queries, service } = createContext({
        runs: [{ id: 'active-run', status }],
      });

      await expect(
        service.replaceLegacyCampaignSequence(scope),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(campaignSequenceService.createInitial).not.toHaveBeenCalled();
      expect(queries.some((sql) => /^(UPDATE|DELETE)\b/.test(sql.trim()))).toBe(
        false,
      );
    },
  );

  it('fails closed for retained soft-deleted failed-run history', async () => {
    const { campaignSequenceService, queries, service } = createContext({
      runs: [{ id: 'deleted-failed-run', status: 'FAILED' }],
    });

    await expect(
      service.replaceLegacyCampaignSequence(scope),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(campaignSequenceService.createInitial).not.toHaveBeenCalled();

    const runInspection = queries.find(
      (sql) => sql.includes('"workflowRun"') && sql.includes('SELECT'),
    );

    expect(runInspection).toBeDefined();
    expect(runInspection).not.toContain('"deletedAt" IS NULL');
  });

  it('stops pending runs, archives definitions, retains receipts, then creates the sequence', async () => {
    const {
      campaignSequenceService,
      queries,
      service,
      workflowQueue,
      workflowTriggerWorkspaceService,
    } = createContext({
      runs: [
        { id: 'not-started-run', status: 'NOT_STARTED' },
        { id: 'enqueued-run', status: 'ENQUEUED' },
        { id: 'completed-run', status: 'COMPLETED' },
      ],
    });

    await expect(service.replaceLegacyCampaignSequence(scope)).resolves.toEqual(
      snapshot,
    );

    expect(
      queries.some(
        (sql) =>
          sql.trim().startsWith('UPDATE') && sql.includes('"workflowRun"'),
      ),
    ).toBe(false);
    expect(
      queries.some(
        (sql) =>
          sql.trim().startsWith('UPDATE') && sql.includes('"workflowVersion"'),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (sql) => sql.trim().startsWith('UPDATE') && sql.includes('"workflow"'),
      ),
    ).toBe(true);
    const deletes = queries.filter((sql) => /^DELETE\b/.test(sql.trim()));

    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain('"workflowAutomatedTrigger"');
    expect(deletes[0]).toContain('WHERE "workflowId" = $1');
    expect(deletes[0]).not.toContain('"workflowVersion"');
    expect(deletes[0]).not.toMatch(/DELETE\s+FROM[^;]+\."workflow"\b/);
    expect(
      workflowTriggerWorkspaceService.reconcileLegacyCampaignWorkflowVersionAfterReplacement,
    ).toHaveBeenCalledWith('legacy-version', workspaceId);
    expect(workflowQueue.add).toHaveBeenCalledWith(
      'WorkflowStatusesUpdateJob',
      {
        type: 'DELETE',
        workspaceId,
        workflowIds: [legacyWorkflowId],
      },
    );
    const workflowProjectionUpdate = queries.find(
      (sql) =>
        sql.trim().startsWith('UPDATE') &&
        sql.includes('"workflow"') &&
        !sql.includes('"workflowVersion"'),
    );

    expect(workflowProjectionUpdate).toContain('"statuses" = $3');
    expect(
      workflowTriggerWorkspaceService.stopPendingLegacyCampaignWorkflowRunForReplacement,
    ).toHaveBeenCalledTimes(2);
    expect(
      workflowTriggerWorkspaceService.stopPendingLegacyCampaignWorkflowRunForReplacement,
    ).toHaveBeenCalledWith('not-started-run', workspaceId);
    expect(
      workflowTriggerWorkspaceService.stopPendingLegacyCampaignWorkflowRunForReplacement,
    ).toHaveBeenCalledWith('enqueued-run', workspaceId);
    expect(campaignSequenceService.createInitial).toHaveBeenCalledWith({
      authContext,
      campaignId,
      workspaceId,
    });
  });

  it('rolls back archival without postcommit reconciliation or creation side effects', async () => {
    const {
      campaignSequenceService,
      service,
      workflowQueue,
      workflowTriggerWorkspaceService,
    } = createContext({ archiveFailure: true });

    await expect(service.replaceLegacyCampaignSequence(scope)).rejects.toThrow(
      'injected archive failure',
    );

    expect(campaignSequenceService.createInitial).not.toHaveBeenCalled();
    expect(workflowQueue.add).not.toHaveBeenCalled();
    expect(
      workflowTriggerWorkspaceService.reconcileLegacyCampaignWorkflowVersionAfterReplacement,
    ).not.toHaveBeenCalled();
  });

  it('repairs postcommit reconciliation and creation on retry after archival committed', async () => {
    const {
      campaignSequenceService,
      queries,
      service,
      workflowQueue,
      workflowTriggerWorkspaceService,
    } = createContext({ createFailure: true });

    await expect(service.replaceLegacyCampaignSequence(scope)).rejects.toThrow(
      'injected create failure',
    );
    await expect(service.replaceLegacyCampaignSequence(scope)).resolves.toEqual(
      snapshot,
    );

    expect(
      queries.filter(
        (sql) =>
          sql.trim().startsWith('UPDATE') && sql.includes('"workflowVersion"'),
      ),
    ).toHaveLength(1);
    expect(workflowQueue.add).toHaveBeenCalledTimes(2);
    expect(
      workflowTriggerWorkspaceService.reconcileLegacyCampaignWorkflowVersionAfterReplacement,
    ).toHaveBeenCalledTimes(2);
    expect(campaignSequenceService.createInitial).toHaveBeenCalledTimes(2);
  });

  it('does not report committed archival as failed when postcommit reconciliation is unavailable', async () => {
    const { campaignSequenceService, service } = createContext({
      reconciliationFailure: true,
    });

    await expect(service.replaceLegacyCampaignSequence(scope)).resolves.toEqual(
      snapshot,
    );
    expect(campaignSequenceService.createInitial).toHaveBeenCalledTimes(1);
  });

  it('is repeat-safe after the legacy receipt has been archived and replacement exists', async () => {
    const { queries, service } = createContext({
      activeWorkflowId: replacementWorkflowId,
      expectedDeletedAt: '2025-01-01T00:00:00.000Z',
      replacementIsSequence: true,
    });

    await expect(
      service.inspectLegacyCampaignSequenceReplacement(scope),
    ).resolves.toEqual({
      campaignId,
      expectedWorkflowId: legacyWorkflowId,
      pendingRunIds: [],
      retainedRunIds: [],
      state: 'ALREADY_REPLACED',
    });
    await expect(service.replaceLegacyCampaignSequence(scope)).resolves.toEqual(
      snapshot,
    );

    expect(queries.some((sql) => /^(UPDATE|DELETE)\b/.test(sql.trim()))).toBe(
      false,
    );
  });

  it('rejects a stale expected legacy identity before mutation', async () => {
    const { campaignSequenceService, queries, service } = createContext({
      activeWorkflowId: replacementWorkflowId,
      replacementIsSequence: false,
    });

    await expect(
      service.replaceLegacyCampaignSequence(scope),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(campaignSequenceService.createInitial).not.toHaveBeenCalled();
    expect(queries.some((sql) => /^(UPDATE|DELETE)\b/.test(sql.trim()))).toBe(
      false,
    );
  });
});
