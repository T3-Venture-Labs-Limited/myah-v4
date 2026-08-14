import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-one.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowOutreachAssociationGuardService } from 'src/modules/workflow/common/services/workflow-outreach-association-guard.service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

type WorkflowUpdateOnePreQueryHookConstructor = new (
  workflowOutreachAssociationGuardService: WorkflowOutreachAssociationGuardService,
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
) => WorkflowUpdateOnePreQueryHook;

describe('WorkflowUpdateOnePreQueryHook', () => {
  const workflowOutreachAssociationGuardService =
    new WorkflowOutreachAssociationGuardService();
  const workflowOutreachAccessGuardService = {
    assertWorkflowIsAccessible: jest.fn(),
  } as unknown as WorkflowOutreachAccessGuardService;
  const hook =
    new (WorkflowUpdateOnePreQueryHook as unknown as WorkflowUpdateOnePreQueryHookConstructor)(
      workflowOutreachAssociationGuardService,
      workflowOutreachAccessGuardService,
    );

  it('preserves ordinary updates', async () => {
    const payload = { id: 'workflow-a', data: { name: 'Renamed' } };

    await expect(
      hook.execute(authContext, 'workflow', payload as never),
    ).resolves.toBe(payload);

    expect(
      workflowOutreachAccessGuardService.assertWorkflowIsAccessible,
    ).toHaveBeenCalledWith({
      authContext,
      workflowId: 'workflow-a',
      workspaceId: 'workspace-a',
    });
  });

  it('rejects manual Workflow status updates', async () => {
    await expect(
      hook.execute(authContext, 'workflow', {
        id: 'workflow-a',
        data: { statuses: ['ACTIVE'] },
      } as never),
    ).rejects.toMatchObject({
      message: 'Statuses cannot be set manually.',
    });
  });

  it('rejects an Outreach association in global update input', async () => {
    await expect(
      hook.execute(authContext, 'workflow', {
        id: 'workflow-a',
        data: { outreachCampaignId: null },
      } as never),
    ).rejects.toMatchObject({
      message: 'Outreach association is managed by Campaign Outreach',
    });
  });

  it('registers as the workflow update pre-query hook', () => {
    expect(
      Reflect.getMetadata(
        WORKSPACE_QUERY_HOOK_METADATA,
        WorkflowUpdateOnePreQueryHook,
      ),
    ).toEqual({
      key: 'workflow.updateOne',
      type: WorkspaceQueryHookType.PRE_HOOK,
    });
  });
});
