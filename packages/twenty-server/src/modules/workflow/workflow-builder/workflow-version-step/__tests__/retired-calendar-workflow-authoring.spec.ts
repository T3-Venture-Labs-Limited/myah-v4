import { WorkflowActionType } from 'twenty-shared/workflow';

import { WorkflowVersionStepCreationWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version-step/workflow-version-step-creation.workspace-service';
import { WorkflowVersionStepUpdateWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version-step/workflow-version-step-update.workspace-service';

const calendarStep = {
  id: 'calendar-step-id',
  name: 'Create Calendar Event',
  nextStepIds: [],
  position: { x: 0, y: 0 },
  settings: {},
  type: WorkflowActionType.CREATE_CALENDAR_EVENT,
} as const;

const workflowVersion = {
  id: 'workflow-version-id',
  steps: [calendarStep],
  trigger: undefined,
};

const guard = {
  assertGenericWorkflowVersionMutationAllowed: jest.fn(),
};
const helpers = {
  getValidatedDraftWorkflowVersion: jest
    .fn()
    .mockResolvedValue(workflowVersion),
  updateWorkflowVersionStepsAndTrigger: jest.fn(),
};

describe('retired calendar workflow authoring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects updates to persisted calendar actions without rewriting them', async () => {
    const operations = {
      runStepCreationSideEffectsAndBuildStep: jest.fn(),
      runWorkflowVersionStepDeletionSideEffects: jest.fn(),
    };
    const service = new WorkflowVersionStepUpdateWorkspaceService(
      { enrichOutputSchema: jest.fn() } as never,
      operations as never,
      helpers as never,
      guard as never,
    );

    await expect(
      service.updateWorkflowVersionStep({
        step: calendarStep as never,
        workflowVersionId: workflowVersion.id,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toThrow('Calendar event creation is no longer available');

    expect(
      operations.runStepCreationSideEffectsAndBuildStep,
    ).not.toHaveBeenCalled();
    expect(helpers.updateWorkflowVersionStepsAndTrigger).not.toHaveBeenCalled();
  });

  it.each([WorkflowActionType.CODE, WorkflowActionType.AI_AGENT])(
    'rejects changing a %s action to a calendar action before side effects',
    async (existingStepType) => {
      const retainedStep = {
        ...calendarStep,
        id: 'retained-step-id',
        type: existingStepType,
      } as never;
      helpers.getValidatedDraftWorkflowVersion.mockResolvedValueOnce({
        ...workflowVersion,
        steps: [retainedStep],
      });
      const operations = {
        runStepCreationSideEffectsAndBuildStep: jest.fn(),
        runWorkflowVersionStepDeletionSideEffects: jest.fn(),
      };
      const service = new WorkflowVersionStepUpdateWorkspaceService(
        { enrichOutputSchema: jest.fn() } as never,
        operations as never,
        helpers as never,
        guard as never,
      );

      await expect(
        service.updateWorkflowVersionStep({
          step: { ...calendarStep, id: 'retained-step-id' } as never,
          workflowVersionId: workflowVersion.id,
          workspaceId: 'workspace-id',
        }),
      ).rejects.toThrow('Calendar event creation is no longer available');

      expect(
        operations.runWorkflowVersionStepDeletionSideEffects,
      ).not.toHaveBeenCalled();
      expect(
        operations.runStepCreationSideEffectsAndBuildStep,
      ).not.toHaveBeenCalled();
      expect(
        helpers.updateWorkflowVersionStepsAndTrigger,
      ).not.toHaveBeenCalled();
    },
  );

  it('rejects duplication of persisted calendar actions without rewriting them', async () => {
    const operations = {
      cloneStep: jest.fn(),
      markStepAsDuplicate: jest.fn(),
    };
    const service = new WorkflowVersionStepCreationWorkspaceService(
      { enrichOutputSchema: jest.fn() } as never,
      operations as never,
      helpers as never,
      guard as never,
    );

    await expect(
      service.duplicateWorkflowVersionStep({
        stepId: 'calendar-step-id',
        workflowVersionId: workflowVersion.id,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toThrow('Calendar event creation is no longer available');

    expect(operations.cloneStep).not.toHaveBeenCalled();
    expect(helpers.updateWorkflowVersionStepsAndTrigger).not.toHaveBeenCalled();
  });
});
