import { CampaignOutreachWorkflowResolver } from 'src/modules/myah-outreach/resolvers/campaign-outreach-workflow.resolver';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';

describe('CampaignOutreachWorkflowResolver', () => {
  const workspace = { id: 'workspace-a' };
  const campaignId = 'campaign-a';
  const workflow = {
    campaignId,
    currentVersionId: 'version-a',
    name: 'Campaign Outreach',
    workflowId: 'workflow-a',
  };

  it('finds Outreach only through the authenticated workspace Campaign', async () => {
    const campaignOutreachWorkflowService = {
      find: jest.fn().mockResolvedValue(workflow),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      campaignOutreachWorkflowService as never,
    );

    await expect(
      resolver.findCampaignOutreachWorkflow(campaignId, workspace as never),
    ).resolves.toEqual(workflow);

    expect(campaignOutreachWorkflowService.find).toHaveBeenCalledWith({
      campaignId,
      workspaceId: workspace.id,
    });
  });

  it('creates or returns Outreach only through the authenticated workspace Campaign', async () => {
    const campaignOutreachWorkflowService = {
      createOrGet: jest.fn().mockResolvedValue(workflow),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      campaignOutreachWorkflowService as never,
    );

    await expect(
      resolver.createCampaignOutreachWorkflow(campaignId, workspace as never),
    ).resolves.toEqual(workflow);

    expect(campaignOutreachWorkflowService.createOrGet).toHaveBeenCalledWith({
      campaignId,
      workspaceId: workspace.id,
    });
  });
});
