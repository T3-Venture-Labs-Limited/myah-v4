import { CampaignWorkflowResolver } from 'src/engine/core-modules/workflow/resolvers/campaign-workflow.resolver';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

describe('CampaignWorkflowResolver', () => {
  const workflowCampaignAssignmentService = {
    prepareCreateOne: jest.fn(),
  };
  const workflowVersionWorkspaceService = {
    duplicateWorkflow: jest.fn(),
  };
  const resolver = new CampaignWorkflowResolver(
    workflowCampaignAssignmentService as never,
    workflowVersionWorkspaceService as never,
  );
  const authContext = {
    type: 'system',
    workspace: { id: 'workspace-a' },
  } as WorkspaceAuthContext;
  const input = {
    campaignId: 'campaign-a',
    sourceWorkflowId: 'general-source',
    sourceWorkflowVersionId: 'version-draft',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates Campaign ownership before creating an already assigned copy', async () => {
    workflowCampaignAssignmentService.prepareCreateOne.mockResolvedValue(
      undefined,
    );
    workflowVersionWorkspaceService.duplicateWorkflow.mockResolvedValue({
      workflowId: 'workflow-copy',
    });

    await expect(
      withWorkspaceAuthContext(authContext, () =>
        resolver.copyGeneralAutomationToCampaign(
          { id: 'workspace-a' } as never,
          input,
        ),
      ),
    ).resolves.toEqual({ workflowId: 'workflow-copy' });

    expect(
      workflowCampaignAssignmentService.prepareCreateOne,
    ).toHaveBeenCalledWith(authContext, 'workflow', {
      data: {
        campaignId: 'campaign-a',
        sourceWorkflowId: 'general-source',
      },
    });
    expect(
      workflowVersionWorkspaceService.duplicateWorkflow,
    ).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      workflowIdToDuplicate: 'general-source',
      workflowVersionIdToCopy: 'version-draft',
      workflowAssignment: {
        campaignId: 'campaign-a',
        sourceWorkflowId: 'general-source',
      },
    });
  });

  it('does not duplicate when Campaign ownership validation fails', async () => {
    workflowCampaignAssignmentService.prepareCreateOne.mockRejectedValue(
      new Error('Campaign is not accessible'),
    );

    await expect(
      withWorkspaceAuthContext(authContext, () =>
        resolver.copyGeneralAutomationToCampaign(
          { id: 'workspace-a' } as never,
          input,
        ),
      ),
    ).rejects.toThrow('Campaign is not accessible');
    expect(
      workflowVersionWorkspaceService.duplicateWorkflow,
    ).not.toHaveBeenCalled();
  });
});
