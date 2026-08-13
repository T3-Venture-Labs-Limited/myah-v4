import { WorkflowVersionWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version/workflow-version.workspace-service';

describe('WorkflowVersionWorkspaceService', () => {
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
            id: 'source-step-1',
            type: 'ITERATOR',
            nextStepIds: [],
            settings: { input: { initialLoopStepIds: [] } },
          },
          {
            id: 'source-step-2',
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
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => unknown | Promise<unknown>) => callback(),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      }),
      getRepository: jest.fn(async (_workspaceId: string, objectName: string) =>
        objectName === 'workflowVersion'
          ? workflowVersionRepository
          : workflowRepository,
      ),
    };
    const clonedSteps = [
      {
        id: 'cloned-step-1',
        type: 'ITERATOR',
        nextStepIds: [],
        settings: { input: { initialLoopStepIds: [] } },
      },
      {
        id: 'cloned-step-2',
        type: 'ITERATOR',
        nextStepIds: [],
        settings: { input: { initialLoopStepIds: [] } },
      },
    ];
    const workflowVersionStepOperationsWorkspaceService = {
      cloneStep: jest
        .fn()
        .mockImplementation(({ step }) =>
          clonedSteps.find((clonedStep) =>
            clonedStep.id.endsWith(step.id.split('-').at(-1) ?? ''),
          ),
        ),
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
      }),
    ).rejects.toThrow('version update failed');

    expect(
      workflowVersionStepOperationsWorkspaceService.runWorkflowVersionStepDeletionSideEffects,
    ).toHaveBeenCalledTimes(2);
    expect(
      workflowVersionStepOperationsWorkspaceService.runWorkflowVersionStepDeletionSideEffects,
    ).toHaveBeenCalledWith({
      step: clonedSteps[0],
      workspaceId: 'workspace-a',
    });
    expect(
      workflowVersionStepOperationsWorkspaceService.runWorkflowVersionStepDeletionSideEffects,
    ).toHaveBeenCalledWith({
      step: clonedSteps[1],
      workspaceId: 'workspace-a',
    });
  });

  it('rejects Campaign Outreach workflows as General duplication sources', async () => {
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
        id: 'outreach-source',
        outreachCampaignId: 'campaign-a',
      }),
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
        workflowIdToDuplicate: 'outreach-source',
        workflowVersionIdToCopy: 'version-a',
      }),
    ).rejects.toThrow(
      'Campaign Outreach workflows cannot be duplicated as General Automations',
    );
  });

  it('rewires every copied step reference to its cloned step', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager: {},
    };
    const sourceSteps = [
      {
        id: 'source-step-1',
        type: 'CODE',
        nextStepIds: ['source-step-2'],
        settings: {
          input: {
            stepOutputKey: '{{source-step-2.output}}',
          },
        },
      },
      {
        id: 'source-step-2',
        type: 'IF_ELSE',
        nextStepIds: [],
        settings: {
          input: {
            branches: [{ nextStepIds: ['source-step-1'] }],
          },
        },
      },
    ];
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
        id: 'version-source',
        workflowId: 'general-source',
        trigger: {
          nextStepIds: ['source-step-1'],
        },
        steps: sourceSteps,
      }),
      insert: jest.fn().mockResolvedValue({
        generatedMaps: [{ id: 'version-copy', name: 'v1' }],
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => unknown | Promise<unknown>) => callback(),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      }),
      getRepository: jest.fn(async (_workspaceId: string, objectName: string) =>
        objectName === 'workflowVersion'
          ? workflowVersionRepository
          : workflowRepository,
      ),
    };
    const clonedStepIdBySourceStepId = {
      'source-step-1': 'cloned-step-1',
      'source-step-2': 'cloned-step-2',
    };
    const workflowVersionStepOperationsWorkspaceService = {
      cloneStep: jest.fn().mockImplementation(({ step }) => ({
        ...step,
        id: clonedStepIdBySourceStepId[
          step.id as keyof typeof clonedStepIdBySourceStepId
        ],
        nextStepIds: [],
      })),
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

    await service.duplicateWorkflow({
      workspaceId: 'workspace-a',
      workflowIdToDuplicate: 'general-source',
      workflowVersionIdToCopy: 'version-source',
    });

    expect(workflowVersionRepository.update).toHaveBeenCalledWith(
      'version-copy',
      {
        steps: [
          expect.objectContaining({
            id: 'cloned-step-1',
            nextStepIds: ['cloned-step-2'],
            settings: {
              input: {
                stepOutputKey: '{{cloned-step-2.output}}',
              },
            },
          }),
          expect.objectContaining({
            id: 'cloned-step-2',
            settings: {
              input: {
                branches: [{ nextStepIds: ['cloned-step-1'] }],
              },
            },
          }),
        ],
        trigger: { nextStepIds: ['cloned-step-1'] },
      },
      undefined,
      queryRunner.manager,
    );
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
