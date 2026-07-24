import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

import { ApplyMessagesVisibilityRestrictionsService } from './apply-messages-visibility-restrictions.service';

describe('ApplyMessagesVisibilityRestrictionsService', () => {
  it('routes native Message post-fetch restrictions through the shared policy', async () => {
    const messages = [{ id: 'message-id' }] as MessageWorkspaceEntity[];
    const authContext = {
      type: 'user',
      workspace: { id: 'workspace-id' },
      userWorkspaceId: 'user-workspace-id',
      user: { id: 'user-id' },
      workspaceMemberId: 'workspace-member-id',
      workspaceMember: { id: 'workspace-member-id' },
    } as UserWorkspaceAuthContext;
    const policy = {
      applyMessagesVisibility: jest.fn().mockResolvedValue(messages),
    };
    const service = new ApplyMessagesVisibilityRestrictionsService(
      policy as never,
    );

    await expect(
      service.applyMessagesVisibilityRestrictions(messages, authContext),
    ).resolves.toBe(messages);
    expect(policy.applyMessagesVisibility).toHaveBeenCalledWith(
      messages,
      authContext,
    );
  });
});
