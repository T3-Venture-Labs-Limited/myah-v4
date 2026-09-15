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

const expectMetadata = (Hook: object, key: string) => {
  expect(Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, Hook)).toEqual({
    key,
    type: WorkspaceQueryHookType.PRE_HOOK,
  });
};

describe('Campaign sequence parent deletion boundaries', () => {
  it.each([
    ['campaign.deleteOne', MyahCampaignDeleteOnePreQueryHook],
    ['campaign.deleteMany', MyahCampaignDeleteManyPreQueryHook],
  ] as const)(
    '%s rejects unconditionally without entering workflow deletion policy',
    async (decoratorKey, Hook) => {
      const hook = new Hook();

      await expect(
        hook.execute(authContext, 'campaign', {} as never),
      ).rejects.toThrow(
        'Campaign lifecycle and execution authority require a dedicated operation.',
      );
      expectMetadata(Hook, decoratorKey);
    },
  );

  it.each([
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
    '%s retains its transaction envelope and workflow deletion policy',
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
      expectMetadata(Hook, decoratorKey);
    },
  );

  it.each([
    [MyahCampaignDestroyOnePreQueryHook, { id: 'campaign-a' }],
    [
      MyahCampaignDestroyManyPreQueryHook,
      { filter: { id: { eq: 'campaign-a' } } },
    ],
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
