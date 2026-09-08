import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowDeleteOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-delete-one.pre-query.hook';
import { WorkflowUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-update-one.pre-query.hook';
import { WorkflowVersionUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-update-one.pre-query.hook';
import { WorkflowQueryValidationExceptionCode } from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowOutreachAssociationGuardService } from 'src/modules/workflow/common/services/workflow-outreach-association-guard.service';
import { WorkflowVersionValidationWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-version-validation.workspace-service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

const campaignDenied = new Error('Use the Campaign sequence editor.');

describe('Campaign sequence generic API boundaries', () => {
  it('rejects a Campaign workflow update before ownership-changing input is inspected', async () => {
    const accessGuard = {
      assertGenericWorkflowMutationAllowed: jest
        .fn()
        .mockRejectedValue(campaignDenied),
    } as unknown as WorkflowOutreachAccessGuardService;
    const associationGuard = {
      assertNoOutreachAssociation: jest.fn(),
    } as unknown as WorkflowOutreachAssociationGuardService;
    const hook = new WorkflowUpdateOnePreQueryHook(
      associationGuard,
      accessGuard,
    );

    await expect(
      hook.execute(authContext, 'workflow', {
        id: 'workflow-a',
        data: { outreachCampaignId: null },
      } as never),
    ).rejects.toThrow('Use the Campaign sequence editor.');

    expect(associationGuard.assertNoOutreachAssociation).not.toHaveBeenCalled();
  });

  it('rejects Campaign workflow deletion before the generic delete', async () => {
    const accessGuard = {
      assertGenericWorkflowMutationAllowed: jest
        .fn()
        .mockRejectedValue(campaignDenied),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook = new WorkflowDeleteOnePreQueryHook(accessGuard);

    await expect(
      hook.execute(authContext, 'workflow', { id: 'workflow-a' }),
    ).rejects.toThrow('Use the Campaign sequence editor.');
  });

  it('allows an ordinary workflow update after persisted ownership and input checks', async () => {
    const accessGuard = {
      assertGenericWorkflowMutationAllowed: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as WorkflowOutreachAccessGuardService;
    const associationGuard = {
      assertNoOutreachAssociation: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowOutreachAssociationGuardService;
    const hook = new WorkflowUpdateOnePreQueryHook(
      associationGuard,
      accessGuard,
    );
    const payload = { id: 'workflow-a', data: { name: 'Ordinary' } };

    await expect(
      hook.execute(authContext, 'workflow', payload as never),
    ).resolves.toBe(payload);
  });

  it.each([
    ['direct workflowId', { workflowId: 'campaign-workflow' }],
    [
      'nested workflow connect',
      { workflow: { connect: { where: { id: 'campaign-workflow' } } } },
    ],
  ])(
    'rejects an ordinary version reassociation to a Campaign workflow through %s',
    async (_label, data) => {
      const accessGuard = {
        assertGenericWorkflowMutationAllowed: jest
          .fn()
          .mockRejectedValue(campaignDenied),
        assertGenericWorkflowVersionMutationAllowed: jest
          .fn()
          .mockResolvedValue(undefined),
      } as unknown as WorkflowOutreachAccessGuardService;
      const validationService = {
        validateWorkflowVersionForUpdateOne: jest.fn(),
      } as unknown as WorkflowVersionValidationWorkspaceService;
      const hook = new WorkflowVersionUpdateOnePreQueryHook(
        accessGuard,
        validationService,
      );

      await expect(
        hook.execute(authContext, 'workflowVersion', {
          id: 'ordinary-version',
          data,
        } as never),
      ).rejects.toThrow('Use the Campaign sequence editor.');

      expect(
        accessGuard.assertGenericWorkflowVersionMutationAllowed,
      ).toHaveBeenCalledWith({
        workflowVersionId: 'ordinary-version',
        workspaceId: 'workspace-a',
      });
      expect(
        accessGuard.assertGenericWorkflowMutationAllowed,
      ).toHaveBeenCalledWith({
        workflowId: 'campaign-workflow',
        workspaceId: 'workspace-a',
      });
      expect(
        validationService.validateWorkflowVersionForUpdateOne,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['direct null workflowId', { workflowId: null }],
    ['nested workflow disconnect', { workflow: { disconnect: true } }],
    ['ordinary workflow target', { workflowId: 'ordinary-workflow-b' }],
  ])(
    'preserves an otherwise-valid ordinary version update through %s',
    async (_label, data) => {
      const accessGuard = {
        assertGenericWorkflowMutationAllowed: jest
          .fn()
          .mockResolvedValue(undefined),
        assertGenericWorkflowVersionMutationAllowed: jest
          .fn()
          .mockResolvedValue(undefined),
      } as unknown as WorkflowOutreachAccessGuardService;
      const validationService = {
        validateWorkflowVersionForUpdateOne: jest
          .fn()
          .mockResolvedValue(undefined),
      } as unknown as WorkflowVersionValidationWorkspaceService;
      const hook = new WorkflowVersionUpdateOnePreQueryHook(
        accessGuard,
        validationService,
      );
      const payload = { id: 'ordinary-version', data };

      await expect(
        hook.execute(authContext, 'workflowVersion', payload as never),
      ).resolves.toBe(payload);

      expect(
        accessGuard.assertGenericWorkflowVersionMutationAllowed,
      ).toHaveBeenCalled();
      expect(
        validationService.validateWorkflowVersionForUpdateOne,
      ).toHaveBeenCalled();
    },
  );

  it('rejects public campaignSequence writes even on ordinary workflow versions', async () => {
    const accessGuard = {
      assertGenericWorkflowVersionMutationAllowed: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as WorkflowOutreachAccessGuardService;
    const validationService = {
      validateWorkflowVersionForUpdateOne: jest.fn(),
    } as unknown as WorkflowVersionValidationWorkspaceService;
    const hook = new WorkflowVersionUpdateOnePreQueryHook(
      accessGuard,
      validationService,
    );

    await expect(
      hook.execute(authContext, 'workflowVersion', {
        id: 'version-a',
        data: {
          campaignSequence: {
            schemaVersion: 1,
            messages: [],
            delaysSeconds: [],
          },
        },
      } as never),
    ).rejects.toMatchObject({
      code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
    });

    expect(
      validationService.validateWorkflowVersionForUpdateOne,
    ).not.toHaveBeenCalled();
  });
});
