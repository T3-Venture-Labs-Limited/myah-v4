import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(),
  }),
);

describe('CampaignOutreachWorkflowLifecycleService', () => {
  it('authorizes a soft-deleted Campaign before its permanent deletion', async () => {
    const campaignRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'campaign-a' }]),
    };
    const service = new CampaignOutreachWorkflowLifecycleWorkspaceService(
      {
        getRepository: jest.fn().mockResolvedValue(campaignRepository),
      } as unknown as GlobalWorkspaceOrmManager,
      {} as WorkflowCommonWorkspaceService,
    );
    jest.mocked(getWorkspaceContext).mockReturnValue({
      apiKeyRoleMap: {},
      authContext: {
        type: 'user',
        userWorkspaceId: 'user-workspace-a',
        workspace: { id: 'workspace-a' },
      },
      userWorkspaceRoleMap: { 'user-workspace-a': 'role-a' },
    } as never);

    await expect(
      service.assertCampaignsAreAccessible({
        campaignIds: ['campaign-a'],
        workspaceId: 'workspace-a',
      }),
    ).resolves.toBeUndefined();

    expect(campaignRepository.find).toHaveBeenCalledWith({
      where: { id: expect.anything() },
      select: { id: true },
      withDeleted: true,
    });
  });
});
