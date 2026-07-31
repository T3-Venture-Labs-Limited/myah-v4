import { WorkflowQueryValidationExceptionCode } from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { WorkflowCampaignAssignmentService } from 'src/modules/workflow/common/services/workflow-campaign-assignment.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  getWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(),
  }),
);

const getWorkspaceContextMock = jest.mocked(getWorkspaceContext);
const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;
const workspaceContext = {
  userWorkspaceRoleMap: {},
  apiKeyRoleMap: {},
} as unknown as ORMWorkspaceContext;

const expectAssignmentError = async (promise: Promise<unknown>) => {
  await expect(promise).rejects.toMatchObject({
    code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
  });
};

describe('WorkflowCampaignAssignmentService', () => {
  const workflowRepository = { findOne: jest.fn() };
  const campaignRepository = { findOne: jest.fn() };
  const getRepository = jest.fn(
    async (_workspaceId: string, objectName: string) =>
      objectName === 'campaign' ? campaignRepository : workflowRepository,
  );
  const executeInWorkspaceContext = jest.fn(
    async (callback: () => unknown | Promise<unknown>) => callback(),
  );
  const service = new WorkflowCampaignAssignmentService({
    executeInWorkspaceContext,
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager);

  beforeEach(() => {
    jest.clearAllMocks();
    workflowRepository.findOne.mockReset();
    campaignRepository.findOne.mockReset();
    campaignRepository.findOne.mockResolvedValue({ id: 'campaign-a' });
    getWorkspaceContextMock.mockReturnValue(workspaceContext);
  });

  it('allows a blank General Automation without consulting the repository', async () => {
    const payload = { data: { name: 'General automation' } };

    await expect(
      service.prepareCreateOne(authContext, 'workflow', payload),
    ).resolves.toBe(payload);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('allows a Campaign copy only when its source is an accessible General Automation', async () => {
    const payload = {
      data: {
        campaignId: 'campaign-a',
        sourceWorkflowId: 'general-source',
      },
    };
    workflowRepository.findOne.mockResolvedValue({
      id: 'general-source',
      campaignId: null,
    });

    await expect(
      service.prepareCreateOne(authContext, 'workflow', payload),
    ).resolves.toBe(payload);
    expect(workflowRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'general-source' } }),
    );
  });

  it.each([
    [
      'provenance without Campaign ownership',
      { sourceWorkflowId: 'general-source' },
      undefined,
    ],
    [
      'a missing source',
      { campaignId: 'campaign-a', sourceWorkflowId: 'missing-source' },
      null,
    ],
    [
      'a Campaign-owned source',
      { campaignId: 'campaign-a', sourceWorkflowId: 'campaign-source' },
      { id: 'campaign-source', campaignId: 'campaign-b' },
    ],
    [
      'itself as source',
      {
        id: 'workflow-a',
        campaignId: 'campaign-a',
        sourceWorkflowId: 'workflow-a',
      },
      { id: 'workflow-a', campaignId: null },
    ],
  ])('rejects create with %s', async (_scenario, data, source) => {
    if (source !== undefined) {
      workflowRepository.findOne.mockResolvedValue(source);
    }

    await expectAssignmentError(
      service.prepareCreateOne(authContext, 'workflow', { data }),
    );
  });

  it('leaves ordinary Workflow edits unchanged without a repository read', async () => {
    const payload = { id: 'workflow-a', data: { name: 'Renamed' } };

    await expect(
      service.prepareUpdateOne(authContext, 'workflow', payload),
    ).resolves.toBe(payload);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('allows the one initial Campaign assignment with a real General source', async () => {
    const payload = {
      id: 'workflow-a',
      data: {
        campaignId: 'campaign-a',
        sourceWorkflowId: 'general-source',
      },
    };
    workflowRepository.findOne
      .mockResolvedValueOnce({
        id: 'workflow-a',
        campaignId: null,
        sourceWorkflowId: null,
      })
      .mockResolvedValueOnce({
        id: 'general-source',
        campaignId: null,
      });

    await expect(
      service.prepareUpdateOne(authContext, 'workflow', payload),
    ).resolves.toBe(payload);
  });

  it.each([
    [
      'Campaign reassignment',
      { campaignId: 'campaign-b' },
      { campaignId: 'campaign-a', sourceWorkflowId: null },
    ],
    [
      'Campaign removal',
      { campaignId: null },
      { campaignId: 'campaign-a', sourceWorkflowId: null },
    ],
    [
      'provenance overwrite',
      { sourceWorkflowId: 'other-source' },
      { campaignId: 'campaign-a', sourceWorkflowId: 'source-a' },
    ],
    [
      'provenance removal',
      { sourceWorkflowId: null },
      { campaignId: 'campaign-a', sourceWorkflowId: 'source-a' },
    ],
    [
      'provenance without an initial Campaign assignment',
      { sourceWorkflowId: 'general-source' },
      { campaignId: null, sourceWorkflowId: null },
    ],
  ])('rejects update with %s', async (_scenario, data, current) => {
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      ...current,
    });

    await expectAssignmentError(
      service.prepareUpdateOne(authContext, 'workflow', {
        id: 'workflow-a',
        data,
      }),
    );
  });

  it('rejects a Campaign assignment when the target Campaign is not accessible', async () => {
    campaignRepository.findOne.mockResolvedValue(null);

    await expectAssignmentError(
      service.prepareCreateOne(authContext, 'workflow', {
        data: { campaignId: 'campaign-a' },
      }),
    );
  });

  it('rejects nested Campaign relation updates', async () => {
    await expectAssignmentError(
      service.prepareUpdateOne(authContext, 'workflow', {
        id: 'workflow-a',
        data: { campaign: { disconnect: true } },
      }),
    );
  });

  it('rejects an upsert that reassigns an owned Campaign Automation', async () => {
    workflowRepository.findOne.mockResolvedValue({
      id: 'workflow-a',
      campaignId: 'campaign-a',
      sourceWorkflowId: null,
    });

    await expectAssignmentError(
      service.prepareCreateOne(authContext, 'workflow', {
        upsert: true,
        data: { id: 'workflow-a', campaignId: 'campaign-b' },
      }),
    );
  });
});
