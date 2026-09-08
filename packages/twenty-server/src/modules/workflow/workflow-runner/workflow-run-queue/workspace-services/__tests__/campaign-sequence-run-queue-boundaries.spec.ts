import { WorkflowRunStatus } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowHandleStaledRunsWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-handle-staled-runs.workspace-service';
import { WorkflowRunEnqueueWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-run-enqueue.workspace-service';

const workspaceId = '20202020-1111-4111-8111-111111111111';

const makeGlobalManager = (repository: Record<string, unknown>) => ({
  executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
    callback(),
  ),
  getRepository: jest.fn().mockResolvedValue(repository),
});

const makeThrottling = () => ({
  acquireWorkflowEnqueueLock: jest.fn().mockResolvedValue(true),
  consumeRemainingRunsToEnqueueCount: jest.fn(),
  decreaseWorkflowRunNotStartedCount: jest.fn(),
  getNotStartedRunsCountFromCache: jest.fn().mockResolvedValue(1),
  getNotStartedRunsCountFromDatabase: jest.fn().mockResolvedValue(1),
  getRemainingRunsToEnqueueCount: jest.fn().mockResolvedValue(1),
  recomputeWorkflowRunNotStartedCount: jest.fn(),
  releaseWorkflowEnqueueLock: jest.fn(),
});

const makeAccessGuard = () => ({
  assertGenericWorkflowRunMutationsAllowed: jest
    .fn()
    .mockResolvedValue(undefined),
});

const EnqueueServiceWithAccessGuard =
  WorkflowRunEnqueueWorkspaceService as unknown as new (
    throttling: never,
    globalManager: never,
    queue: never,
    metrics: never,
    accessGuard: WorkflowOutreachAccessGuardService,
  ) => WorkflowRunEnqueueWorkspaceService;

const StaleRunServiceWithAccessGuard =
  WorkflowHandleStaledRunsWorkspaceService as unknown as new (
    globalManager: never,
    throttling: never,
    accessGuard: WorkflowOutreachAccessGuardService,
  ) => WorkflowHandleStaledRunsWorkspaceService;

describe('Campaign sequence workflow queue boundaries', () => {
  it('preflights an ordinary enqueue batch, uses status CAS, and accounts only transitioned rows', async () => {
    const ordinaryRun = {
      id: 'ordinary-run',
      status: WorkflowRunStatus.NOT_STARTED,
    };
    const repository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([ordinaryRun])
        .mockResolvedValueOnce([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const globalManager = makeGlobalManager(repository);
    const throttling = makeThrottling();
    const queue = { add: jest.fn() };
    const metrics = { incrementCounterForEvent: jest.fn() };
    const accessGuard = makeAccessGuard();
    const service = new EnqueueServiceWithAccessGuard(
      throttling as never,
      globalManager as never,
      queue as never,
      metrics as never,
      accessGuard as unknown as WorkflowOutreachAccessGuardService,
    );

    await service.enqueueRunsForWorkspace({ workspaceId, isCacheMode: true });

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: WorkflowRunStatus.NOT_STARTED,
          workflow: expect.objectContaining({
            outreachCampaignId: expect.anything(),
          }),
        }),
      }),
    );
    expect(
      accessGuard.assertGenericWorkflowRunMutationsAllowed,
    ).toHaveBeenCalledWith({
      workflowRunIds: ['ordinary-run'],
      workspaceId,
    });
    expect(repository.update).toHaveBeenCalledWith(
      { id: 'ordinary-run', status: WorkflowRunStatus.NOT_STARTED },
      expect.objectContaining({ status: WorkflowRunStatus.ENQUEUED }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'RunWorkflowJob',
      expect.objectContaining({ workflowRunId: 'ordinary-run', workspaceId }),
    );
    expect(throttling.consumeRemainingRunsToEnqueueCount).toHaveBeenCalledWith(
      workspaceId,
      1,
    );
    expect(throttling.decreaseWorkflowRunNotStartedCount).toHaveBeenCalledWith(
      workspaceId,
      1,
    );
  });

  it('does not queue or consume throttle when enqueue CAS loses to a concurrent stop', async () => {
    const repository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'stopped-concurrently', status: WorkflowRunStatus.NOT_STARTED },
        ])
        .mockResolvedValueOnce([]),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const globalManager = makeGlobalManager(repository);
    const throttling = makeThrottling();
    const queue = { add: jest.fn() };
    const accessGuard = makeAccessGuard();
    const service = new EnqueueServiceWithAccessGuard(
      throttling as never,
      globalManager as never,
      queue as never,
      { incrementCounterForEvent: jest.fn() } as never,
      accessGuard as unknown as WorkflowOutreachAccessGuardService,
    );

    await service.enqueueRunsForWorkspace({ workspaceId, isCacheMode: true });

    expect(queue.add).not.toHaveBeenCalled();
    expect(
      throttling.consumeRemainingRunsToEnqueueCount,
    ).not.toHaveBeenCalled();
    expect(
      throttling.decreaseWorkflowRunNotStartedCount,
    ).not.toHaveBeenCalled();
  });

  it('preflights stale runs and does not revive or recount a row changed after selection', async () => {
    const selectedEnqueuedAt = new Date('2026-01-01T00:00:00.000Z');
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'stopped-concurrently',
          status: WorkflowRunStatus.ENQUEUED,
          enqueuedAt: selectedEnqueuedAt,
        },
      ]),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const globalManager = makeGlobalManager(repository);
    const throttling = makeThrottling();
    const accessGuard = makeAccessGuard();
    const service = new StaleRunServiceWithAccessGuard(
      globalManager as never,
      throttling as never,
      accessGuard as unknown as WorkflowOutreachAccessGuardService,
    );

    await service.handleStaledRunsForWorkspace(workspaceId);

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: WorkflowRunStatus.ENQUEUED,
          workflow: expect.objectContaining({
            outreachCampaignId: expect.anything(),
          }),
        }),
      }),
    );
    expect(
      accessGuard.assertGenericWorkflowRunMutationsAllowed,
    ).toHaveBeenCalledWith({
      workflowRunIds: ['stopped-concurrently'],
      workspaceId,
    });
    expect(repository.update).toHaveBeenCalledWith(
      {
        id: 'stopped-concurrently',
        status: WorkflowRunStatus.ENQUEUED,
        enqueuedAt: selectedEnqueuedAt,
      },
      { enqueuedAt: null, status: WorkflowRunStatus.NOT_STARTED },
    );
    expect(
      throttling.recomputeWorkflowRunNotStartedCount,
    ).not.toHaveBeenCalled();
  });
});
