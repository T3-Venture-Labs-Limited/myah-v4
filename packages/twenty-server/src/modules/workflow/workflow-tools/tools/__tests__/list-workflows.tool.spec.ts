import { createListWorkflowsTool } from 'src/modules/workflow/workflow-tools/tools/list-workflows.tool';

describe('createListWorkflowsTool', () => {
  it('excludes Campaign Outreach workflows', async () => {
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      createQueryBuilder: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
    const workflowRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest.fn().mockResolvedValue(workflowRepository),
    };
    const tool = createListWorkflowsTool(
      { globalWorkspaceOrmManager } as never,
      {
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
        workspaceId: 'workspace-id',
      } as never,
    );

    await tool.execute({ limit: 50, offset: 0 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'workflow.outreachCampaignId IS NULL',
    );
  });
});
