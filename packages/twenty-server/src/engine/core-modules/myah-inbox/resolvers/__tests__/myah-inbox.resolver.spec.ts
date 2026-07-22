import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';

describe('MyahInboxResolver', () => {
  it('scopes the inbox query to the authenticated workspace and member', async () => {
    const listThreads = jest.fn().mockResolvedValue({
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });
    const resolver = new MyahInboxResolver({ listThreads } as never);

    await expect(
      resolver.myahInboxThreads(
        { first: 25, queue: 'CREATOR_LINKED' } as never,
        { id: 'workspace-id' } as never,
        'workspace-member-id',
      ),
    ).resolves.toEqual({
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });

    expect(listThreads).toHaveBeenCalledWith({
      first: 25,
      queue: 'CREATOR_LINKED',
      workspaceId: 'workspace-id',
      workspaceMemberId: 'workspace-member-id',
    });
  });
});
