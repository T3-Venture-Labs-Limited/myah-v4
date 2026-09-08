import { ForbiddenException } from '@nestjs/common';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';

const rolePermissionConfig = { unionOf: ['role-id'] };

jest.mock(
  'twenty-shared/utils',
  () => ({
    isDefined: (value: unknown) => value !== null && value !== undefined,
  }),
  { virtual: true },
);
jest.mock(
  'src/engine/core-modules/record-position/services/record-position.service',
  () => ({ RecordPositionService: class {} }),
);
jest.mock(
  'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager',
  () => ({ GlobalWorkspaceOrmManager: class {} }),
);

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
  const campaignSequenceService = {
    createInitial: jest.fn().mockResolvedValue({
      campaignId,
      workflowId: 'workflow-a',
      versionId: 'version-a',
    }),
  };
  const service = new CampaignOutreachWorkflowService(
    globalWorkspaceOrmManager as never,
    campaignSequenceService as never,
  );

  return {
    campaignRepository,
    campaignSequenceService,
    globalWorkspaceOrmManager,
    queryRunner,
    service,
    workflowRepository,
    workflowVersionRepository,
  };
};

describe('CampaignOutreachWorkflowService', () => {
  it('creates or returns the immutable sequence definition through the scoped service', async () => {
    const { campaignSequenceService, service } = createServiceContext();

    await expect(
      service.createOrGet({ authContext, workspaceId, campaignId }),
    ).resolves.toEqual({
      campaignId,
      currentVersionId: 'version-a',
      name: 'Campaign Outreach',
      workflowId: 'workflow-a',
    });
    expect(campaignSequenceService.createInitial).toHaveBeenCalledWith({
      authContext,
      campaignId,
      workspaceId,
    });
  });

  it('requires explicit authenticated context for creation', async () => {
    const { campaignSequenceService, service } = createServiceContext();

    await expect(
      service.createOrGet({ workspaceId, campaignId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(campaignSequenceService.createInitial).not.toHaveBeenCalled();
  });

  it('propagates transactional initial sequence failures', async () => {
    const { campaignSequenceService, service } = createServiceContext();
    campaignSequenceService.createInitial.mockRejectedValue(
      new Error('draft failed'),
    );

    await expect(
      service.createOrGet({ authContext, workspaceId, campaignId }),
    ).rejects.toThrow('draft failed');
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

  it('uses explicit caller auth context outside HTTP storage', async () => {
    const { globalWorkspaceOrmManager, service } = createServiceContext();

    await expect(
      service.find({ authContext, campaignId, workspaceId }),
    ).resolves.toBeNull();

    expect(
      globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).toHaveBeenCalledWith(expect.any(Function), authContext);
  });
});
