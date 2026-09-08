import { ResumeDelayedWorkflowJob } from 'src/modules/workflow/workflow-executor/workflow-actions/delay/jobs/resume-delayed-workflow.job';
import { RunWorkflowJob } from 'src/modules/workflow/workflow-runner/jobs/run-workflow.job';

const campaignDenied = new Error('Use the Campaign sequence editor.');
const accessGuard = {
  assertGenericWorkflowRunMutationAllowed: jest
    .fn()
    .mockRejectedValue(campaignDenied),
};

describe('Campaign sequence queued boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a stale queued workflow job before run state or history is mutated', async () => {
    const runService = {
      endWorkflowRun: jest.fn(),
      getWorkflowRunOrFail: jest.fn(),
      startWorkflowRun: jest.fn(),
    };
    const manager = { executeInWorkspaceContext: jest.fn() };
    const executor = { executeFromSteps: jest.fn() };
    const job = new (RunWorkflowJob as unknown as new (
      ...args: never[]
    ) => RunWorkflowJob)(
      {} as never,
      {} as never,
      executor as never,
      runService as never,
      {} as never,
      manager as never,
      accessGuard as never,
    );

    await expect(
      job.handle({
        workflowRunId: 'run-a',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(manager.executeInWorkspaceContext).not.toHaveBeenCalled();
    expect(runService.endWorkflowRun).not.toHaveBeenCalled();
    expect(runService.startWorkflowRun).not.toHaveBeenCalled();
    expect(executor.executeFromSteps).not.toHaveBeenCalled();
  });

  it('rejects delayed resume before pending history is changed or another job is queued', async () => {
    const queue = { add: jest.fn() };
    const runService = {
      endWorkflowRun: jest.fn(),
      getWorkflowRunOrFail: jest.fn(),
      updateWorkflowRunStepInfo: jest.fn(),
    };
    const manager = { executeInWorkspaceContext: jest.fn() };
    const job = new (ResumeDelayedWorkflowJob as unknown as new (
      ...args: never[]
    ) => ResumeDelayedWorkflowJob)(
      queue as never,
      runService as never,
      manager as never,
      accessGuard as never,
    );

    await expect(
      job.handle({
        workflowRunId: 'run-a',
        workspaceId: 'workspace-a',
        stepId: 'delay-a',
      }),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(manager.executeInWorkspaceContext).not.toHaveBeenCalled();
    expect(runService.updateWorkflowRunStepInfo).not.toHaveBeenCalled();
    expect(runService.endWorkflowRun).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
