import { WorkflowVersionStepExceptionCode } from 'src/modules/workflow/common/exceptions/workflow-version-step.exception';
import { WorkflowVersionWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version/workflow-version.workspace-service';

describe('WorkflowVersionWorkspaceService', () => {
  it('locks and rechecks a Campaign copy source before inserting the new Workflow', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager: {},
    };
    const workflowRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'general-source',
        campaignId: 'campaign-b',
      }),
      insert: jest.fn(),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => unknown | Promise<unknown>) => callback(),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      }),
      getRepository: jest.fn().mockResolvedValue(workflowRepository),
    };
    const service = new WorkflowVersionWorkspaceService(
      globalWorkspaceOrmManager as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.duplicateWorkflow({
        workspaceId: 'workspace-a',
        workflowIdToDuplicate: 'general-source',
        workflowVersionIdToCopy: 'version-draft',
        workflowAssignment: {
          campaignId: 'campaign-a',
          sourceWorkflowId: 'general-source',
        },
      }),
    ).rejects.toMatchObject({
      code: WorkflowVersionStepExceptionCode.INVALID_REQUEST,
    });

    expect(workflowRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
        where: { id: 'general-source' },
      }),
      queryRunner.manager,
    );
    expect(workflowRepository.insert).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('compensates cloned step resources when the copy transaction rolls back', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager: {},
    };
    const workflowRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'general-source',
        campaignId: null,
        name: 'Source',
      }),
      insert: jest.fn().mockResolvedValue({
        generatedMaps: [{ id: 'workflow-copy' }],
      }),
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'version-draft',
        workflowId: 'general-source',
        trigger: {},
        steps: [
          {
            id: 'source-step',
            type: 'ITERATOR',
            nextStepIds: [],
            settings: { input: { initialLoopStepIds: [] } },
          },
        ],
      }),
      insert: jest.fn().mockResolvedValue({
        generatedMaps: [{ id: 'version-copy', name: 'v1' }],
      }),
      update: jest.fn().mockRejectedValue(new Error('version update failed')),
    };
    const campaignRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'campaign-a' }),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => unknown | Promise<unknown>) => callback(),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      }),
      getRepository: jest.fn(
        async (_workspaceId: string, objectName: string) => {
          if (objectName === 'workflowVersion') {
            return workflowVersionRepository;
          }

          return objectName === 'campaign'
            ? campaignRepository
            : workflowRepository;
        },
      ),
    };
    const clonedStep = {
      id: 'cloned-step',
      type: 'ITERATOR',
      nextStepIds: [],
      settings: { input: { initialLoopStepIds: [] } },
    };
    const workflowVersionStepOperationsWorkspaceService = {
      cloneStep: jest.fn().mockResolvedValue(clonedStep),
      runWorkflowVersionStepDeletionSideEffects: jest.fn(),
    };
    const service = new WorkflowVersionWorkspaceService(
      globalWorkspaceOrmManager as never,
      {} as never,
      workflowVersionStepOperationsWorkspaceService as never,
      {
        buildRecordPosition: jest.fn().mockResolvedValue('position'),
      } as never,
      {} as never,
    );

    await expect(
      service.duplicateWorkflow({
        workspaceId: 'workspace-a',
        workflowIdToDuplicate: 'general-source',
        workflowVersionIdToCopy: 'version-draft',
        workflowAssignment: {
          campaignId: 'campaign-a',
          sourceWorkflowId: 'general-source',
        },
      }),
    ).rejects.toThrow('version update failed');

    expect(
      workflowVersionStepOperationsWorkspaceService.runWorkflowVersionStepDeletionSideEffects,
    ).toHaveBeenCalledWith({
      step: clonedStep,
      workspaceId: 'workspace-a',
    });
  });

  it('releases the query runner when connecting it fails', async () => {
    const connectError = new Error('database unavailable');
    const queryRunner = {
      connect: jest.fn().mockRejectedValue(connectError),
      startTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: false,
      manager: {},
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => unknown | Promise<unknown>) => callback(),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      }),
    };
    const service = new WorkflowVersionWorkspaceService(
      globalWorkspaceOrmManager as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.duplicateWorkflow({
        workspaceId: 'workspace-a',
        workflowIdToDuplicate: 'general-source',
        workflowVersionIdToCopy: 'version-draft',
      }),
    ).rejects.toThrow(connectError);

    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
