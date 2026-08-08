import { MODULE_METADATA } from '@nestjs/common/constants';

import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { MyahCampaignQueryHookModule } from 'src/modules/myah-campaign/query-hooks/myah-campaign-query-hook.module';
import {
  MyahCreatorListMemberCreateManyPreQueryHook,
  MyahCreatorListMemberCreateOnePreQueryHook,
  MyahCreatorListMemberDeleteManyPreQueryHook,
  MyahCreatorListMemberDeleteOnePreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-creator-list-member.pre-query.hooks';
import { CampaignInfluencerService } from 'src/modules/myah-campaign/services/campaign-influencer.service';

const authContext = { workspace: { id: 'workspace-1' } } as never;

describe('CreatorListMember generic mutation hooks', () => {
  const cases = [
    [
      MyahCreatorListMemberCreateOnePreQueryHook,
      'creatorListMember.createOne',
      'assertGenericMembershipMutationAllowed',
      { data: { creatorListId: 'list-1' } },
    ],
    [
      MyahCreatorListMemberCreateManyPreQueryHook,
      'creatorListMember.createMany',
      'assertGenericMembershipMutationAllowedForListIds',
      { data: [{ creatorListId: 'list-1' }, { creatorListId: 'list-2' }] },
    ],
    [
      MyahCreatorListMemberDeleteOnePreQueryHook,
      'creatorListMember.deleteOne',
      'assertGenericMembershipMutationAllowedForMemberIds',
      { id: 'member-1' },
    ],
    [
      MyahCreatorListMemberDeleteManyPreQueryHook,
      'creatorListMember.deleteMany',
      'assertGenericMembershipMutationAllowedForDeleteFilter',
      { filter: { creatorListId: { eq: 'list-1' } } },
    ],
  ] as const;

  it.each(cases)(
    'registers the $1 operation and delegates to the membership guard',
    async (HookClass, decoratorKey, serviceMethod, payload) => {
      const service = {
        assertGenericMembershipMutationAllowed: jest.fn(),
        assertGenericMembershipMutationAllowedForListIds: jest.fn(),
        assertGenericMembershipMutationAllowedForMemberIds: jest.fn(),
        assertGenericMembershipMutationAllowedForDeleteFilter: jest.fn(),
      } as unknown as CampaignInfluencerService;
      const hook = new HookClass(service);

      await expect(
        hook.execute(authContext, 'creatorListMember', payload as never),
      ).resolves.toBe(payload);
      expect(service[serviceMethod]).toHaveBeenCalledWith(
        expect.anything(),
        authContext,
      );
      expect(
        Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, HookClass),
      ).toEqual({
        key: decoratorKey,
        type: WorkspaceQueryHookType.PRE_HOOK,
      });
    },
  );

  it('registers all four guarded operations in the query-hook module', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahCampaignQueryHookModule,
    ) as unknown[];
    expect(providers).toEqual(
      expect.arrayContaining(cases.map(([HookClass]) => HookClass)),
    );
  });
});
