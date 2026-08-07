import {
  MyahCreatorListMemberCreatePostQueryHook,
  MyahCreatorListMemberDeletePostQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-creator-list-member.post-query.hooks';

describe('CreatorListMember propagation hooks', () => {
  it('propagates additions transactionally through the influencer service', async () => {
    const syncCreatorListMembership = jest.fn().mockResolvedValue(undefined);
    const hook = new MyahCreatorListMemberCreatePostQueryHook({ syncCreatorListMembership } as never);
    const auth = { workspace: { id: 'workspace-a' } } as never;
    await hook.execute(auth, 'creatorListMember', [{ creatorListId: 'list', creatorId: 'creator' }]);
    expect(syncCreatorListMembership).toHaveBeenCalledWith(
      { creatorListId: 'list', creatorId: 'creator' },
      auth,
    );
  });

  it('marks removals so other sources can be preserved', async () => {
    const syncCreatorListMembership = jest.fn().mockResolvedValue(undefined);
    const hook = new MyahCreatorListMemberDeletePostQueryHook({ syncCreatorListMembership } as never);
    const auth = { workspace: { id: 'workspace-b' } } as never;
    await hook.execute(auth, 'creatorListMember', [{ creatorListId: 'list', creatorId: 'creator' }]);
    expect(syncCreatorListMembership).toHaveBeenCalledWith(
      { creatorListId: 'list', creatorId: 'creator', removed: true },
      auth,
    );
  });
});
