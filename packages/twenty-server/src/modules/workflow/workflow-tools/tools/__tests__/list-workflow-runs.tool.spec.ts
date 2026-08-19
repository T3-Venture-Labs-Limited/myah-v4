import { createListWorkflowRunsTool } from 'src/modules/workflow/workflow-tools/tools/list-workflow-runs.tool';

describe('createListWorkflowRunsTool', () => {
  it('excludes Campaign Outreach workflow runs', async () => {
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
    };
    const workflowRunRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest.fn().mockResolvedValue(workflowRunRepository),
    };
    const tool = createListWorkflowRunsTool(
      { globalWorkspaceOrmManager } as never,
      {
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
        workspaceId: 'workspace-id',
      } as never,
    );

    await tool.execute({});

    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      'workflowRun.workflow',
      'workflow',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'workflow.outreachCampaignId IS NULL',
    );
  });
});
