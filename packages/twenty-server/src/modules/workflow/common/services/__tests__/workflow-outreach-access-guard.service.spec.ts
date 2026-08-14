import { WorkflowQueryValidationExceptionCode } from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(),
  }),
);

const getWorkspaceContextMock = jest.mocked(getWorkspaceContext);

describe('WorkflowOutreachAccessGuardService', () => {
  const workflowRepository = { findOne: jest.fn() };
  const workflowVersionRepository = { findOne: jest.fn() };
  const campaignRepository = { findOne: jest.fn() };
  const getRepository = jest.fn(
    async (_workspaceId: string, objectName: string) => {
      if (objectName === 'workflow') {
        return workflowRepository;
      }

      if (objectName === 'workflowVersion') {
        return workflowVersionRepository;
      }

      return campaignRepository;
    },
  );
  const service = new WorkflowOutreachAccessGuardService({
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager);

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceContextMock.mockReturnValue({
      apiKeyRoleMap: {},
      authContext: {
        type: 'user',
        userWorkspaceId: 'user-workspace-a',
        workspace: { id: 'workspace-a' },
      },
      userWorkspaceRoleMap: { 'user-workspace-a': 'role-a' },
    } as never);
  });

  it('rejects an Outreach workflow whose Campaign is not readable', async () => {
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      outreachCampaignId: 'campaign-a',
    });
    campaignRepository.findOne.mockResolvedValue(null);

    await expect(
      service.assertWorkflowIsAccessible({
        workflowId: 'workflow-a',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toMatchObject({
      code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
    });
  });

  it('includes soft-deleted workflows when authorizing restore and destruction', async () => {
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      outreachCampaignId: null,
    });

    await service.assertWorkflowIsAccessible({
      workflowId: 'workflow-a',
      workspaceId: 'workspace-a',
    });

    expect(workflowRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'workflow-a' },
      select: { id: true, outreachCampaignId: true },
      withDeleted: true,
    });
  });

  it('permits a general Automation without a Campaign owner', async () => {
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      outreachCampaignId: null,
    });

    await expect(
      service.assertWorkflowIsAccessible({
        workflowId: 'workflow-a',
        workspaceId: 'workspace-a',
      }),
    ).resolves.toBeUndefined();

    expect(campaignRepository.findOne).not.toHaveBeenCalled();
  });

  it('permits an Outreach workflow whose Campaign is readable', async () => {
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      outreachCampaignId: 'campaign-a',
    });
    campaignRepository.findOne.mockResolvedValue({ id: 'campaign-a' });

    await expect(
      service.assertWorkflowIsAccessible({
        workflowId: 'workflow-a',
        workspaceId: 'workspace-a',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects an Outreach workflow version whose Campaign is not readable', async () => {
    workflowVersionRepository.findOne.mockResolvedValue({
      id: 'workflow-version-a',
      workflowId: 'workflow-a',
    });
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      outreachCampaignId: 'campaign-a',
    });
    campaignRepository.findOne.mockResolvedValue(null);
    const untypedService = service as unknown as {
      assertWorkflowVersionIsAccessible: (args: {
        workflowVersionId: string;
        workspaceId: string;
      }) => Promise<void>;
    };

    await expect(
      untypedService.assertWorkflowVersionIsAccessible({
        workflowVersionId: 'workflow-version-a',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toMatchObject({
      code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
    });
  });

  it('includes soft-deleted versions and runs when authorizing restore and destruction', async () => {
    workflowVersionRepository.findOne.mockResolvedValue(null);
    const workflowRunRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    getRepository.mockImplementation(
      async (_workspaceId: string, objectName: string) =>
        objectName === 'workflowRun'
          ? workflowRunRepository
          : objectName === 'workflowVersion'
            ? workflowVersionRepository
            : workflowRepository,
    );

    await service.assertWorkflowVersionIsAccessible({
      workflowVersionId: 'workflow-version-a',
      workspaceId: 'workspace-a',
    });
    await service.assertWorkflowRunIsAccessible({
      workflowRunId: 'workflow-run-a',
      workspaceId: 'workspace-a',
    });

    expect(workflowVersionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'workflow-version-a' },
      select: { workflowId: true },
      withDeleted: true,
    });
    expect(workflowRunRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'workflow-run-a' },
      select: { workflowId: true },
      withDeleted: true,
    });
  });
});
