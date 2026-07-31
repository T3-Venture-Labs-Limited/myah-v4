import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowCreateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-create-one.pre-query.hook';
import { WorkflowUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-one.pre-query.hook';
import { WorkflowCampaignAssignmentService } from 'src/modules/workflow/common/services/workflow-campaign-assignment.service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('Workflow Campaign assignment query hooks', () => {
  const assignmentService = {
    prepareCreateOne: jest.fn(),
    prepareUpdateOne: jest.fn(),
  } as unknown as WorkflowCampaignAssignmentService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates create ownership validation after stripping statuses', async () => {
    const payload = {
      data: {
        name: 'Campaign automation',
        statuses: ['ACTIVE'],
        campaignId: 'campaign-a',
      },
    };
    const expectedPayload = {
      data: {
        name: 'Campaign automation',
        campaignId: 'campaign-a',
      },
    };
    jest
      .mocked(assignmentService.prepareCreateOne)
      .mockResolvedValue(expectedPayload as never);

    await expect(
      new WorkflowCreateOnePreQueryHook(assignmentService).execute(
        authContext,
        'workflow',
        payload as never,
      ),
    ).resolves.toBe(expectedPayload);
    expect(assignmentService.prepareCreateOne).toHaveBeenCalledWith(
      authContext,
      'workflow',
      expectedPayload,
    );
  });

  it('delegates ordinary update validation without changing payload identity', async () => {
    const payload = { id: 'workflow-a', data: { name: 'Renamed' } };
    jest
      .mocked(assignmentService.prepareUpdateOne)
      .mockResolvedValue(payload as never);

    await expect(
      new WorkflowUpdateOnePreQueryHook(assignmentService).execute(
        authContext,
        'workflow',
        payload as never,
      ),
    ).resolves.toBe(payload);
    expect(assignmentService.prepareUpdateOne).toHaveBeenCalledWith(
      authContext,
      'workflow',
      payload,
    );
  });

  it('preserves the status update protection before ownership validation', async () => {
    await expect(
      new WorkflowUpdateOnePreQueryHook(assignmentService).execute(
        authContext,
        'workflow',
        { id: 'workflow-a', data: { statuses: ['ACTIVE'] } } as never,
      ),
    ).rejects.toMatchObject({
      message: 'Statuses cannot be set manually.',
    });
    expect(assignmentService.prepareUpdateOne).not.toHaveBeenCalled();
  });

  it.each([
    [WorkflowCreateOnePreQueryHook, 'workflow.createOne'],
    [WorkflowUpdateOnePreQueryHook, 'workflow.updateOne'],
  ])('registers %s as %s', (HookClass, key) => {
    expect(
      Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, HookClass),
    ).toEqual({
      key,
      type: WorkspaceQueryHookType.PRE_HOOK,
    });
  });
});
