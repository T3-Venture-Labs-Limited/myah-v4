import {
  AUTHORIZED_CAMPAIGN_OUTREACH_TRIGGER_MUTATION,
  createUpdateWorkflowVersionTriggerTool,
} from 'src/modules/workflow/workflow-tools/tools/update-workflow-version-trigger.tool';

const workflowVersionId = 'b3b8a4f0-0000-4000-8000-000000000000';
const trigger = { type: 'MANUAL' } as never;

const buildTool = () => {
  const workflowVersionStepHelpersService = {
    getValidatedDraftWorkflowVersion: jest.fn().mockResolvedValue(undefined),
    updateWorkflowVersionStepsAndTrigger: jest
      .fn()
      .mockResolvedValue(undefined),
  };
  const tool = createUpdateWorkflowVersionTriggerTool(
    { workflowVersionStepHelpersService } as never,
    { workspaceId: 'workspace-id' },
  );

  return { tool, workflowVersionStepHelpersService };
};

describe('createUpdateWorkflowVersionTriggerTool', () => {
  it('ignores caller-controlled Campaign authorization', async () => {
    const { tool, workflowVersionStepHelpersService } = buildTool();

    await tool.execute({
      workflowVersionId,
      trigger,
      authorizedCampaignOutreachMutation: true,
    } as never);

    expect(
      workflowVersionStepHelpersService.updateWorkflowVersionStepsAndTrigger,
    ).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      workflowVersionId,
      trigger,
      authorizedCampaignOutreachMutation: false,
    });
  });

  it('accepts only the internal Campaign authorization capability', async () => {
    const { tool, workflowVersionStepHelpersService } = buildTool();

    await tool.execute({
      workflowVersionId,
      trigger,
      [AUTHORIZED_CAMPAIGN_OUTREACH_TRIGGER_MUTATION]: true,
    } as never);

    expect(
      workflowVersionStepHelpersService.updateWorkflowVersionStepsAndTrigger,
    ).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
      workflowVersionId,
      trigger,
      authorizedCampaignOutreachMutation: true,
    });
  });
});
