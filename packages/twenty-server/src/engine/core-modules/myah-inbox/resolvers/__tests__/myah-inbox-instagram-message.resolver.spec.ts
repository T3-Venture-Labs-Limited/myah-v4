import { ForbiddenException } from '@nestjs/common';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxInstagramMessageResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-instagram-message.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspace = { id: '00000000-0000-4000-8000-000000000001' };
const workspaceMemberId = '00000000-0000-4000-8000-000000000002';
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceMemberId,
  user: { id: 'user-id' },
  workspaceMember: { id: workspaceMemberId },
};

describe('MyahInboxInstagramMessageResolver', () => {
  beforeEach(() => {
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(userAuthContext as never);
  });

  it('passes only authenticated workspace-scoped input to the native message query', async () => {
    const listMessages = jest.fn().mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    const resolver = new MyahInboxInstagramMessageResolver({
      listMessages,
    } as never);
    const input = {
      conversationId: '00000000-0000-4000-8000-000000000004',
      first: 100,
      after: 'cursor',
    };

    await expect(
      resolver.myahInboxInstagramMessages(
        input,
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toEqual({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(listMessages).toHaveBeenCalledWith({
      ...input,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
    });
  });

  it('fails closed outside user auth even when directly invoked', async () => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      type: 'system',
      workspace,
    } as never);
    const listMessages = jest.fn();
    const resolver = new MyahInboxInstagramMessageResolver({
      listMessages,
    } as never);

    await expect(
      resolver.myahInboxInstagramMessages(
        { conversationId: '00000000-0000-4000-8000-000000000004' },
        workspace as never,
        workspaceMemberId,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(listMessages).not.toHaveBeenCalled();
  });
});
