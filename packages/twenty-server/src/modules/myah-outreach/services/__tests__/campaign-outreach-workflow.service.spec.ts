import { ForbiddenException } from '@nestjs/common';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';

const rolePermissionConfig = { unionOf: ['role-id'] };

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      apiKeyRoleMap: new Map(),
      authContext,
      userWorkspaceRoleMap: new Map(),
    })),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => rolePermissionConfig),
  }),
);

const workspaceId = 'workspace-a';
const campaignId = 'campaign-a';
const authContext = {
  type: 'user',
  userWorkspaceId: 'user-workspace-a',
  workspace: { id: workspaceId },
  workspaceMemberId: 'workspace-member-a',
} as WorkspaceAuthContext;

const createQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  isTransactionActive: true,
  manager: {},
});

const createServiceContext = () => {
  const campaignRepository = {
    findOne: jest.fn().mockResolvedValue({ id: campaignId }),
  };
  const workflowRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue({
      generatedMaps: [{ id: 'workflow-a' }],
    }),
  };
  const workflowVersionRepository = {
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue({
      generatedMaps: [{ id: 'version-a' }],
    }),
  };
  const queryRunner = createQueryRunner();
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
    getRepository: jest.fn(async (_workspaceId: string, objectName: string) => {
      if (objectName === 'campaign') {
        return campaignRepository;
      }

      if (objectName === 'workflow') {
        return workflowRepository;
      }

      return workflowVersionRepository;
    }),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    }),
  };
  const recordPositionService = {
    buildRecordPosition: jest.fn().mockResolvedValue(1),
  };
  const service = new CampaignOutreachWorkflowService(
    globalWorkspaceOrmManager as never,
    recordPositionService as never,
  );

  return {
    campaignRepository,
    globalWorkspaceOrmManager,
    queryRunner,
    recordPositionService,
    service,
    workflowRepository,
    workflowVersionRepository,
  };
};

describe('CampaignOutreachWorkflowService', () => {
  it('creates a single Campaign-bound workflow with draft v1', async () => {
    const {
      service,
      workflowRepository,
      workflowVersionRepository,
      recordPositionService,
    } = createServiceContext();

    await expect(
      service.createOrGet({ workspaceId, campaignId }),
    ).resolves.toEqual({
      campaignId,
      currentVersionId: 'version-a',
      name: 'Campaign Outreach',
      workflowId: 'workflow-a',
    });

    expect(workflowRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        outreachCampaignId: campaignId,
        position: 1,
      }),
      expect.anything(),
    );
    expect(workflowVersionRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'v1',
        status: WorkflowVersionStatus.DRAFT,
        workflowId: 'workflow-a',
      }),
      expect.anything(),
    );
    expect(recordPositionService.buildRecordPosition).toHaveBeenCalledTimes(2);
  });

  it('returns the existing association instead of creating a second workflow', async () => {
    const { service, workflowRepository, workflowVersionRepository } =
      createServiceContext();
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      name: 'Existing outreach',
      outreachCampaignId: campaignId,
    });
    workflowVersionRepository.find.mockResolvedValue([
      {
        id: 'version-a',
        status: WorkflowVersionStatus.DRAFT,
        workflowId: 'workflow-a',
      },
    ]);

    await expect(
      service.createOrGet({ workspaceId, campaignId }),
    ).resolves.toEqual({
      campaignId,
      currentVersionId: 'version-a',
      name: 'Existing outreach',
      workflowId: 'workflow-a',
    });

    expect(workflowRepository.insert).not.toHaveBeenCalled();
    expect(workflowVersionRepository.insert).not.toHaveBeenCalled();
  });

  it('re-reads the one persisted association after a unique-index race', async () => {
    const { service, workflowRepository, workflowVersionRepository } =
      createServiceContext();
    workflowRepository.insert.mockRejectedValue({ code: '23505' });
    workflowRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'workflow-a',
        name: 'Existing outreach',
        outreachCampaignId: campaignId,
      });
    workflowVersionRepository.find.mockResolvedValue([
      {
        id: 'version-a',
        status: WorkflowVersionStatus.DRAFT,
        workflowId: 'workflow-a',
      },
    ]);

    await expect(
      service.createOrGet({ workspaceId, campaignId }),
    ).resolves.toEqual({
      campaignId,
      currentVersionId: 'version-a',
      name: 'Existing outreach',
      workflowId: 'workflow-a',
    });
  });

  it('rolls back when draft v1 creation fails', async () => {
    const { queryRunner, service, workflowVersionRepository } =
      createServiceContext();
    workflowVersionRepository.insert.mockRejectedValue(
      new Error('draft failed'),
    );

    await expect(
      service.createOrGet({ workspaceId, campaignId }),
    ).rejects.toThrow('draft failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an inaccessible Campaign before reading a Workflow', async () => {
    const { campaignRepository, service, workflowRepository } =
      createServiceContext();
    campaignRepository.findOne.mockResolvedValue(null);

    await expect(
      service.find({ workspaceId, campaignId }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(workflowRepository.findOne).not.toHaveBeenCalled();
  });

  it('uses the invoking role permissions to validate Campaign access', async () => {
    const { globalWorkspaceOrmManager, service } = createServiceContext();

    await expect(service.find({ campaignId, workspaceId })).resolves.toBeNull();
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'campaign',
      rolePermissionConfig,
    );
  });
});
