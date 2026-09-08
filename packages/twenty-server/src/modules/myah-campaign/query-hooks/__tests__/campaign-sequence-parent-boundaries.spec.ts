import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  MyahCampaignDeleteManyPreQueryHook,
  MyahCampaignDeleteOnePreQueryHook,
} from '../myah-campaign-delete.pre-query.hooks';
import {
  MyahCampaignDestroyManyPreQueryHook,
  MyahCampaignDestroyOnePreQueryHook,
} from '../myah-campaign-destroy.pre-query.hooks';
import { CampaignOutreachWorkflowLifecycleWorkspaceService } from 'src/modules/myah-campaign/services/campaign-outreach-workflow-lifecycle.workspace-service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;
const entityManager = { queryRunner: { isTransactionActive: true } };
const transactionContext = { entityManager: entityManager as never };

describe('Campaign sequence parent deletion boundaries', () => {
  it.each([
    [
      'campaign.deleteOne',
      MyahCampaignDeleteOnePreQueryHook,
      { id: 'campaign-a' },
      ['campaign-a'],
    ],
    [
      'campaign.deleteMany',
      MyahCampaignDeleteManyPreQueryHook,
      { filter: { id: { in: ['campaign-a', 'campaign-b'] } } },
      ['campaign-a', 'campaign-b'],
    ],
    [
      'campaign.destroyOne',
      MyahCampaignDestroyOnePreQueryHook,
      { id: 'campaign-a' },
      ['campaign-a'],
    ],
    [
      'campaign.destroyMany',
      MyahCampaignDestroyManyPreQueryHook,
      { filter: { id: { in: ['campaign-a', 'campaign-b'] } } },
      ['campaign-a', 'campaign-b'],
    ],
  ] as const)(
    '%s opts into the transaction envelope and rejects outreach before parent mutation',
    async (decoratorKey, Hook, payload, campaignIds) => {
      const lifecycle = {
        assertCampaignDeletionAllowedInTransaction: jest
          .fn()
          .mockRejectedValue(
            new Error('Campaigns with outreach definitions cannot be deleted.'),
          ),
      };
      const hook = new Hook(
        lifecycle as unknown as CampaignOutreachWorkflowLifecycleWorkspaceService,
      );

      expect(hook.shouldRunInTransaction).toBe(true);
      await expect(
        hook.execute(
          authContext,
          'campaign',
          payload as never,
          transactionContext,
        ),
      ).rejects.toThrow(
        'Campaigns with outreach definitions cannot be deleted.',
      );

      expect(
        lifecycle.assertCampaignDeletionAllowedInTransaction,
      ).toHaveBeenCalledWith({
        authContext,
        campaignIds,
        entityManager,
        workspaceId: 'workspace-a',
      });
      expect(Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, Hook)).toEqual({
        key: decoratorKey,
        type: WorkspaceQueryHookType.PRE_HOOK,
      });
    },
  );

  it.each([
    [MyahCampaignDeleteOnePreQueryHook, { id: 'campaign-a' }],
    [MyahCampaignDestroyOnePreQueryHook, { id: 'campaign-a' }],
  ] as const)(
    '%s fails closed when invoked outside the common mutation transaction',
    async (Hook, payload) => {
      const lifecycle = {
        assertCampaignDeletionAllowedInTransaction: jest.fn(),
      };
      const hook = new Hook(
        lifecycle as unknown as CampaignOutreachWorkflowLifecycleWorkspaceService,
      );

      await expect(
        hook.execute(authContext, 'campaign', payload as never),
      ).rejects.toThrow('requires a transaction');
      expect(
        lifecycle.assertCampaignDeletionAllowedInTransaction,
      ).not.toHaveBeenCalled();
    },
  );
});
