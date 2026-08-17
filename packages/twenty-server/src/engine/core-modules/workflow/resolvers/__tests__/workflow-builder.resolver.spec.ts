import { WorkflowBuilderResolver } from 'src/engine/core-modules/workflow/resolvers/workflow-builder.resolver';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowSchemaWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-schema/workflow-schema.workspace-service';

type WorkflowBuilderResolverConstructor = new (
  workflowSchemaWorkspaceService: WorkflowSchemaWorkspaceService,
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
) => WorkflowBuilderResolver;

describe('WorkflowBuilderResolver', () => {
  it('authorizes Campaign-owned workflow versions before computing their output schema', async () => {
    const computeStepOutputSchema = jest.fn().mockResolvedValue({});
    const assertWorkflowVersionIsAccessible = jest
      .fn()
      .mockResolvedValue(undefined);
    const resolver =
      new (WorkflowBuilderResolver as unknown as WorkflowBuilderResolverConstructor)(
        {
          computeStepOutputSchema,
        } as unknown as WorkflowSchemaWorkspaceService,
        {
          assertWorkflowVersionIsAccessible,
        } as unknown as WorkflowOutreachAccessGuardService,
      );

    await resolver.computeStepOutputSchema(
      { id: 'workspace-a' } as never,
      {
        step: { id: 'step-a', type: 'ITERATOR' },
        workflowVersionId: 'version-a',
      } as never,
    );

    expect(assertWorkflowVersionIsAccessible).toHaveBeenCalledWith({
      workflowVersionId: 'version-a',
      workspaceId: 'workspace-a',
    });
    expect(computeStepOutputSchema).toHaveBeenCalledWith({
      step: { id: 'step-a', type: 'ITERATOR' },
      workflowVersionId: 'version-a',
      workspaceId: 'workspace-a',
    });
  });

  it('computes a new step schema without probing an owned workflow version', async () => {
    const computeStepOutputSchema = jest.fn().mockResolvedValue({});
    const assertWorkflowVersionIsAccessible = jest
      .fn()
      .mockResolvedValue(undefined);
    const resolver =
      new (WorkflowBuilderResolver as unknown as WorkflowBuilderResolverConstructor)(
        {
          computeStepOutputSchema,
        } as unknown as WorkflowSchemaWorkspaceService,
        {
          assertWorkflowVersionIsAccessible,
        } as unknown as WorkflowOutreachAccessGuardService,
      );

    await resolver.computeStepOutputSchema(
      { id: 'workspace-a' } as never,
      { step: { id: 'step-a', type: 'ITERATOR' } } as never,
    );

    expect(assertWorkflowVersionIsAccessible).not.toHaveBeenCalled();
    expect(computeStepOutputSchema).toHaveBeenCalledWith({
      step: { id: 'step-a', type: 'ITERATOR' },
      workflowVersionId: undefined,
      workspaceId: 'workspace-a',
    });
  });
});
