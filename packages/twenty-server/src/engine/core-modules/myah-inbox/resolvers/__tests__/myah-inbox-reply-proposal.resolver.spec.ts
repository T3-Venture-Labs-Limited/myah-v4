import { ForbiddenException } from '@nestjs/common';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const workspace = { id: workspaceId };
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};

const proposal = {
  body: { markdown: 'Tuesday works.', blocknote: null },
};

describe('MyahInboxResolver reply proposal', () => {
  beforeEach(() => {
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(userAuthContext as never);
  });

  it('calls the shared proposal service with only the authenticated user/workspace context and operator request', async () => {
    const generateReplyProposal = jest.fn().mockResolvedValue(proposal);
    const resolver = new MyahInboxResolver(
      {} as never,
      {} as never,
      { generateReplyProposal } as never,
    );

    await expect(
      resolver.generateMyahInboxReplyProposal(
        {
          threadId,
          operatorInstructions: 'Confirm Tuesday.',
        },
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toEqual(proposal);
    expect(generateReplyProposal).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId,
      operatorInstructions: 'Confirm Tuesday.',
    });
  });

  it('fails closed outside matching authenticated user context', async () => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      type: 'system',
      workspace,
    } as never);
    const generateReplyProposal = jest.fn();
    const resolver = new MyahInboxResolver(
      {} as never,
      {} as never,
      { generateReplyProposal } as never,
    );

    await expect(
      resolver.generateMyahInboxReplyProposal(
        { threadId, operatorInstructions: 'Reply.' },
        workspace as never,
        workspaceMemberId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateReplyProposal).not.toHaveBeenCalled();
  });
});
