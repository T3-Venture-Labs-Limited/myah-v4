import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxCampaignReplyWorkResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-campaign-reply-work.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({
    getWorkspaceAuthContext: jest.fn(),
  }),
);
const W = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const THREAD = '44444444-4444-4444-8444-444444444444';
const WORK = '55555555-5555-4555-8555-555555555555';
const BINDING = '66666666-6666-4666-8666-666666666666';
const workspace = { id: W };
const authContext = {
  type: 'user',
  workspace,
  workspaceMemberId: MEMBER,
  userWorkspaceId: MEMBER,
  user: { id: USER },
  workspaceMember: { id: MEMBER, userId: USER },
};
const make = () => {
  jest.mocked(getWorkspaceAuthContext).mockReturnValue(authContext as never);
  const inbox = { getThreadSummary: jest.fn(async () => ({ id: THREAD })) };
  const work = {
    threadIdForHeld: jest.fn(async () => THREAD),
    listHeld: jest.fn(async () => ({
      items: [{ workItemId: WORK, contextGeneration: 0, choices: [] }],
    })),
    listCollisions: jest.fn(async () => ({
      items: [
        {
          originalWorkItemId: WORK,
          collisionId: BINDING,
          originalState: 'HELD',
        },
      ],
    })),
    promote: jest.fn(async () => ({
      workItemId: WORK,
      state: 'PENDING',
      contextGeneration: 1,
    })),
  };
  const resolver = new MyahInboxCampaignReplyWorkResolver(
    inbox as never,
    work as never,
  );
  return { inbox, work, resolver };
};

describe('Inbox Campaign reply held actions', () => {
  it('reads neutral pending attention only after native Inbox thread visibility', async () => {
    const f = make();
    const input = {
      expectedWorkspaceId: W,
      threadId: THREAD,
      cursor: 'opaque-scoped-page',
    };
    await expect(
      f.resolver.myahInboxCampaignReplyHeld(input, workspace as never, MEMBER),
    ).resolves.toMatchObject({ items: [{ workItemId: WORK, choices: [] }] });
    expect(f.inbox.getThreadSummary).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: THREAD }),
    );
    expect(f.work.listHeld).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: input.cursor }),
    );
    f.inbox.getThreadSummary.mockRejectedValueOnce(new Error('thread hidden'));
    await expect(
      f.resolver.myahInboxCampaignReplyHeld(input, workspace as never, MEMBER),
    ).rejects.toThrow();
    expect(f.work.listHeld).toHaveBeenCalledTimes(1);
  });
  it('shows collision attention only after native Inbox thread visibility without a promotion choice', async () => {
    const f = make();
    const input = {
      expectedWorkspaceId: W,
      threadId: THREAD,
      cursor: 'opaque-collision-page',
    };
    await expect(
      f.resolver.myahInboxCampaignReplyCollisions(
        input,
        workspace as never,
        MEMBER,
      ),
    ).resolves.toMatchObject({
      items: [{ collisionId: BINDING, originalWorkItemId: WORK }],
    });
    expect(f.inbox.getThreadSummary).toHaveBeenCalledTimes(1);
    expect(f.work.listCollisions).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: input.cursor }),
    );
    f.inbox.getThreadSummary.mockRejectedValueOnce(new Error('thread hidden'));
    await expect(
      f.resolver.myahInboxCampaignReplyCollisions(
        input,
        workspace as never,
        MEMBER,
      ),
    ).rejects.toThrow();
    expect(f.work.listCollisions).toHaveBeenCalledTimes(1);
  });
  it('requires native thread visibility before CAS promotion; wrong workspace never gets a work read', async () => {
    const f = make();
    const input = {
      expectedWorkspaceId: W,
      workItemId: WORK,
      bindingId: BINDING,
      expectedContextGeneration: 0,
      expectedParticipationMaterialGeneration: 0,
    };
    await expect(
      f.resolver.myahInboxPromoteCampaignReplyHeld(
        input,
        workspace as never,
        MEMBER,
      ),
    ).resolves.toMatchObject({ state: 'PENDING', contextGeneration: 1 });
    expect(f.work.threadIdForHeld).toHaveBeenCalledTimes(1);
    expect(f.inbox.getThreadSummary).toHaveBeenCalledTimes(1);
    await expect(
      f.resolver.myahInboxPromoteCampaignReplyHeld(
        { ...input, expectedWorkspaceId: THREAD },
        workspace as never,
        MEMBER,
      ),
    ).rejects.toThrow();
    expect(f.work.promote).toHaveBeenCalledTimes(1);
  });
});
