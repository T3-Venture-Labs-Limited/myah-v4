import { WorkflowThrottlingWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-throttling.workspace-service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      authContext: {
        type: 'system',
        workspace: { id: 'workspace-a' },
      },
    })),
  }),
);

describe('WorkflowThrottlingWorkspaceService retained ownership counts', () => {
  const createContext = (count = 2) => {
    const repository = {
      count: jest.fn().mockResolvedValue(count),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => Promise<unknown>) => callback(),
      ),
      getRepository: jest.fn().mockResolvedValue(repository),
    };
    const cacheStorage = {
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowThrottlingWorkspaceService(
      cacheStorage as never,
      globalWorkspaceOrmManager as never,
      {} as never,
      {} as never,
    );

    return { cacheStorage, repository, service };
  };

  it('counts live ordinary runs with retained deleted-owner visibility', async () => {
    const { repository, service } = createContext(3);

    await expect(
      service.getNotStartedRunsCountFromDatabase('workspace-a'),
    ).resolves.toBe(3);

    expect(repository.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ deletedAt: expect.anything() }),
      withDeleted: true,
    });
  });

  it('recomputes the cache from the same retained-owner/live-run predicate', async () => {
    const { cacheStorage, repository, service } = createContext(4);

    await service.recomputeWorkflowRunNotStartedCount('workspace-a');

    expect(repository.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ deletedAt: expect.anything() }),
      withDeleted: true,
    });
    expect(cacheStorage.set).toHaveBeenCalledWith(
      'workflow-run-not-started-count:workspace-a',
      4,
    );
  });
});
