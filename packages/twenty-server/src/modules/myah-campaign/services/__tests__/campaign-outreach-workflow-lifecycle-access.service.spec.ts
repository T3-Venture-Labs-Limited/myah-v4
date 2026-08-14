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
    const executeInWorkspaceContext = jest.fn(
      async (callback: () => Promise<void>) => await callback(),
    );
    const service = new CampaignOutreachWorkflowLifecycleWorkspaceService(
      {
        executeInWorkspaceContext,
        getRepository: jest.fn().mockResolvedValue(campaignRepository),
      } as unknown as GlobalWorkspaceOrmManager,
      {} as WorkflowCommonWorkspaceService,
    );
    const authContext = {
      type: 'user',
      userWorkspaceId: 'user-workspace-a',
      workspace: { id: 'workspace-a' },
    } as never;
    jest.mocked(getWorkspaceContext).mockReturnValue({
      apiKeyRoleMap: {},
      authContext,
      userWorkspaceRoleMap: { 'user-workspace-a': 'role-a' },
    } as never);

    await expect(
      service.assertCampaignsAreAccessible({
        authContext,
        campaignIds: ['campaign-a'],
        workspaceId: 'workspace-a',
      }),
    ).resolves.toBeUndefined();

    expect(campaignRepository.find).toHaveBeenCalledWith({
      where: { id: expect.anything() },
      select: { id: true },
      withDeleted: true,
    });
    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      authContext,
    );
  });
});
