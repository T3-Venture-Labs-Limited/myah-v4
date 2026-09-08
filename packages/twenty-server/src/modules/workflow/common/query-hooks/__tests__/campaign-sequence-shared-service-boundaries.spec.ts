import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';
import { WorkflowVersionWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version/workflow-version.workspace-service';
import { WorkflowVersionEdgeWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version-edge/workflow-version-edge.workspace-service';
import { WorkflowVersionStepOperationsWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version-step/workflow-version-step-operations.workspace-service';
import { WorkflowVersionStepWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version-step/workflow-version-step.workspace-service';
import { WorkflowExecutorWorkspaceService } from 'src/modules/workflow/workflow-executor/workspace-services/workflow-executor.workspace-service';
import { WorkflowRunnerWorkspaceService } from 'src/modules/workflow/workflow-runner/workspace-services/workflow-runner.workspace-service';
import { WorkflowTriggerWorkspaceService } from 'src/modules/workflow/workflow-trigger/workspace-services/workflow-trigger.workspace-service';

const campaignDenied = new Error('Use the Campaign sequence editor.');

const versionGuard = {
  assertGenericWorkflowVersionMutationAllowed: jest
    .fn()
    .mockRejectedValue(campaignDenied),
};
const workflowGuard = {
  ...versionGuard,
  assertGenericWorkflowMutationAllowed: jest
    .fn()
    .mockRejectedValue(campaignDenied),
  assertGenericWorkflowRunMutationAllowed: jest
    .fn()
    .mockRejectedValue(campaignDenied),
};

describe('Campaign sequence shared service boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks direct Campaign workflow cascades before sub-entity repositories', async () => {
    const manager = { executeInWorkspaceContext: jest.fn() };
    const service = new (WorkflowCommonWorkspaceService as unknown as new (
      ...args: never[]
    ) => WorkflowCommonWorkspaceService)(
      manager as never,
      {} as never,
      {} as never,
      {} as never,
      workflowGuard as never,
    );

    await expect(
      service.handleWorkflowSubEntities({
        workflowIds: ['workflow-a'],
        workspaceId: 'workspace-a',
        operation: 'delete',
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(manager.executeInWorkspaceContext).not.toHaveBeenCalled();
  });

  it('keeps direct ordinary Automation cascades available', async () => {
    const manager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const ordinaryGuard = {
      assertGenericWorkflowMutationAllowed: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const service = new (WorkflowCommonWorkspaceService as unknown as new (
      ...args: never[]
    ) => WorkflowCommonWorkspaceService)(
      manager as never,
      {} as never,
      {} as never,
      {} as never,
      ordinaryGuard as never,
    );

    await expect(
      service.handleWorkflowSubEntities({
        workflowIds: ['workflow-a'],
        workspaceId: 'workspace-a',
        operation: 'delete',
      }),
    ).resolves.toBeUndefined();

    expect(manager.executeInWorkspaceContext).toHaveBeenCalled();
  });

  it('blocks workflow duplication before repositories or step side effects', async () => {
    const manager = { executeInWorkspaceContext: jest.fn() };
    const stepOperations = { cloneStep: jest.fn() };
    const service = new (WorkflowVersionWorkspaceService as unknown as new (
      ...args: never[]
    ) => WorkflowVersionWorkspaceService)(
      manager as never,
      {} as never,
      stepOperations as never,
      {} as never,
      {} as never,
      workflowGuard as never,
    );

    await expect(
      service.duplicateWorkflow({
        workspaceId: 'workspace-a',
        workflowIdToDuplicate: 'workflow-a',
        workflowVersionIdToCopy: 'version-a',
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(manager.executeInWorkspaceContext).not.toHaveBeenCalled();
    expect(stepOperations.cloneStep).not.toHaveBeenCalled();
  });

  it.each([
    [
      'create',
      'createWorkflowVersionStep',
      { input: { workflowVersionId: 'version-a' } },
    ],
    [
      'update',
      'updateWorkflowVersionStep',
      { workflowVersionId: 'version-a', step: { id: 'step-a' } },
    ],
    [
      'delete',
      'deleteWorkflowVersionStep',
      { workflowVersionId: 'version-a', stepIdToDelete: 'step-a' },
    ],
    [
      'duplicate',
      'duplicateWorkflowVersionStep',
      { workflowVersionId: 'version-a', stepId: 'step-a' },
    ],
  ])(
    'blocks generic step %s before delegation',
    async (_label, method, args) => {
      const creation = {
        createWorkflowVersionStep: jest.fn(),
        duplicateWorkflowVersionStep: jest.fn(),
      };
      const update = { updateWorkflowVersionStep: jest.fn() };
      const deletion = { deleteWorkflowVersionStep: jest.fn() };
      const service =
        new (WorkflowVersionStepWorkspaceService as unknown as new (
          ...args: never[]
        ) => WorkflowVersionStepWorkspaceService)(
          creation as never,
          update as never,
          deletion as never,
          workflowGuard as never,
        );

      await expect(
        (
          service[method as keyof WorkflowVersionStepWorkspaceService] as (
            value: Record<string, unknown>,
          ) => Promise<unknown>
        )({ workspaceId: 'workspace-a', ...args }),
      ).rejects.toThrow('Use the Campaign sequence editor.');

      expect(creation.createWorkflowVersionStep).not.toHaveBeenCalled();
      expect(creation.duplicateWorkflowVersionStep).not.toHaveBeenCalled();
      expect(update.updateWorkflowVersionStep).not.toHaveBeenCalled();
      expect(deletion.deleteWorkflowVersionStep).not.toHaveBeenCalled();
    },
  );

  it('blocks direct step creation side effects before external resources are created', async () => {
    const codeStepBuild = { createCodeStepLogicFunction: jest.fn() };
    const service =
      new (WorkflowVersionStepOperationsWorkspaceService as unknown as new (
        ...args: never[]
      ) => WorkflowVersionStepOperationsWorkspaceService)(
        {} as never,
        {} as never,
        codeStepBuild as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        workflowGuard as never,
      );

    await expect(
      service.runStepCreationSideEffectsAndBuildStep({
        type: 'CODE' as never,
        workflowVersionId: 'version-a',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(codeStepBuild.createCodeStepLogicFunction).not.toHaveBeenCalled();
  });

  it('blocks edge creation before loading or writing the version', async () => {
    const common = { getWorkflowVersionOrFail: jest.fn() };
    const service = new (WorkflowVersionEdgeWorkspaceService as unknown as new (
      ...args: never[]
    ) => WorkflowVersionEdgeWorkspaceService)(
      {} as never,
      common as never,
      workflowGuard as never,
    );

    await expect(
      service.createWorkflowVersionEdge({
        source: 'source-a',
        target: 'target-a',
        workflowVersionId: 'version-a',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(common.getWorkflowVersionOrFail).not.toHaveBeenCalled();
  });

  it.each([
    ['activateWorkflowVersion', ['version-a', 'workspace-a']],
    ['deactivateWorkflowVersion', ['version-a', 'workspace-a']],
    [
      'runWorkflowVersion',
      [
        {
          workflowVersionId: 'version-a',
          workspaceId: 'workspace-a',
          payload: {},
          createdBy: { source: 'MANUAL' },
        },
      ],
    ],
  ])(
    'blocks generic trigger %s before any trigger side effect',
    async (method, args) => {
      const manager = { executeInWorkspaceContext: jest.fn() };
      const runner = { run: jest.fn() };
      const service = new (WorkflowTriggerWorkspaceService as unknown as new (
        ...args: never[]
      ) => WorkflowTriggerWorkspaceService)(
        manager as never,
        { getWorkflowVersionOrFail: jest.fn() } as never,
        {} as never,
        runner as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        workflowGuard as never,
      );

      await expect(
        (
          service[method as keyof WorkflowTriggerWorkspaceService] as (
            ...values: unknown[]
          ) => Promise<unknown>
        )(...args),
      ).rejects.toThrow('Use the Campaign sequence editor.');

      expect(manager.executeInWorkspaceContext).not.toHaveBeenCalled();
      expect(runner.run).not.toHaveBeenCalled();
    },
  );

  it('blocks generic runner start before billing, run creation, or queueing', async () => {
    const billing = { canFeatureBeUsed: jest.fn() };
    const runService = { createWorkflowRun: jest.fn() };
    const queue = { add: jest.fn() };
    const service = new (WorkflowRunnerWorkspaceService as unknown as new (
      ...args: never[]
    ) => WorkflowRunnerWorkspaceService)(
      runService as never,
      {} as never,
      queue as never,
      billing as never,
      {} as never,
      {} as never,
      {} as never,
      workflowGuard as never,
    );

    await expect(
      service.run({
        workspaceId: 'workspace-a',
        workflowVersionId: 'version-a',
        payload: {},
        source: { source: 'MANUAL' } as never,
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(billing.canFeatureBeUsed).not.toHaveBeenCalled();
    expect(runService.createWorkflowRun).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('stops a pending legacy run through the existing run lifecycle', async () => {
    const runService = {
      endWorkflowRun: jest.fn().mockResolvedValue(undefined),
      getWorkflowRunOrFail: jest.fn().mockResolvedValue({
        id: 'run-a',
        status: 'ENQUEUED',
      }),
    };
    const replacementGuard = {
      assertLegacyCampaignWorkflowRunReplacementAllowed: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const service = new (WorkflowRunnerWorkspaceService as unknown as new (
      ...args: never[]
    ) => WorkflowRunnerWorkspaceService)(
      runService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      replacementGuard as never,
    );

    await expect(
      service.stopPendingLegacyCampaignWorkflowRunForReplacement(
        'workspace-a',
        'run-a',
      ),
    ).resolves.toEqual({ id: 'run-a', status: 'STOPPED' });

    expect(runService.endWorkflowRun).toHaveBeenCalledWith({
      workflowRunId: 'run-a',
      workspaceId: 'workspace-a',
      status: 'STOPPED',
    });
  });

  it('blocks direct executor invocation before run history or action execution', async () => {
    const actionFactory = { get: jest.fn() };
    const runService = {
      getWorkflowRunOrFail: jest.fn(),
      updateWorkflowRunStepInfo: jest.fn(),
    };
    const service = new (WorkflowExecutorWorkspaceService as unknown as new (
      ...args: never[]
    ) => WorkflowExecutorWorkspaceService)(
      actionFactory as never,
      {} as never,
      runService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workflowGuard as never,
    );

    await expect(
      service.executeFromSteps({
        stepIds: ['step-a'],
        workflowRunId: 'run-a',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(runService.getWorkflowRunOrFail).not.toHaveBeenCalled();
    expect(runService.updateWorkflowRunStepInfo).not.toHaveBeenCalled();
    expect(actionFactory.get).not.toHaveBeenCalled();
  });
});
