import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MessageFindManyPostQueryHook } from 'src/modules/messaging/common/query-hooks/message/message-find-many.post-query.hook';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

describe('MessageFindManyPostQueryHook', () => {
  it('passes the complete request auth context to the shared visibility path', async () => {
    const applyMessagesVisibilityRestrictions = jest.fn();
    const hook = new MessageFindManyPostQueryHook({
      applyMessagesVisibilityRestrictions,
    } as never);
    const authContext = {
      type: 'user',
      workspace: { id: 'workspace-id' },
      userWorkspaceId: 'user-workspace-id',
      user: { id: 'user-id' },
      workspaceMemberId: 'workspace-member-id',
      workspaceMember: { id: 'workspace-member-id' },
    } as UserWorkspaceAuthContext;
    const messages = [{ id: 'message-id' }] as MessageWorkspaceEntity[];

    await hook.execute(authContext, 'message', messages);

    expect(applyMessagesVisibilityRestrictions).toHaveBeenCalledWith(
      messages,
      authContext,
    );
  });
});
