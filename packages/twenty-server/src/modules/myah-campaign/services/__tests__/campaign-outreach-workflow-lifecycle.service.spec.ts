import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';

describe('CampaignOutreachWorkflowLifecycleService', () => {
  const workflowRepository = {
    delete: jest.fn(),
    find: jest.fn(),
    softDelete: jest.fn(),
  };
  const getRepository = jest.fn().mockResolvedValue(workflowRepository);
  const globalWorkspaceOrmManager = {
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager;
  const handleWorkflowSubEntities = jest.fn();
  const workflowCommonWorkspaceService = {
    handleWorkflowSubEntities,
  } as unknown as WorkflowCommonWorkspaceService;
  const service = new CampaignOutreachWorkflowLifecycleWorkspaceService(
    globalWorkspaceOrmManager,
    workflowCommonWorkspaceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cleans the Campaign workflow before a hard Campaign deletion', async () => {
    workflowRepository.find.mockResolvedValue([{ id: 'workflow-a' }]);

    await service.handleCampaignDeletion({
      campaignIds: ['campaign-a'],
      operation: 'destroy',
      workspaceId: 'workspace-a',
    });

    expect(handleWorkflowSubEntities).toHaveBeenCalledWith({
      operation: 'destroy',
      workflowIds: ['workflow-a'],
      workspaceId: 'workspace-a',
    });

    expect(workflowRepository.delete).toHaveBeenCalledWith(['workflow-a']);

    expect(workflowRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
  });

  it('deactivates and soft-deletes Campaign workflow resources after a Campaign soft deletion', async () => {
    workflowRepository.find.mockResolvedValue([{ id: 'workflow-a' }]);

    await service.handleCampaignDeletion({
      campaignIds: ['campaign-a'],
      operation: 'delete',
      workspaceId: 'workspace-a',
    });

    expect(handleWorkflowSubEntities).toHaveBeenCalledWith({
      operation: 'delete',
      workflowIds: ['workflow-a'],
      workspaceId: 'workspace-a',
    });

    expect(workflowRepository.softDelete).toHaveBeenCalledWith(['workflow-a']);
  });

  it('does nothing when deleted Campaigns do not own an Outreach workflow', async () => {
    workflowRepository.find.mockResolvedValue([]);

    await service.handleCampaignDeletion({
      campaignIds: ['campaign-a'],
      operation: 'delete',
      workspaceId: 'workspace-a',
    });

    expect(handleWorkflowSubEntities).not.toHaveBeenCalled();
  });
});
