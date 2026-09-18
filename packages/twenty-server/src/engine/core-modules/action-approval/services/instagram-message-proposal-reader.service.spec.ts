import { ForbiddenException } from '@nestjs/common';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { InstagramMessageProposalReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-proposal-reader.service';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';

jest.mock(
  'src/engine/core-modules/auth/guards/is-user-auth-context.guard',
  () => ({ isUserAuthContext: jest.fn() }),
);
jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';

const createLegacyReplyBinding = () => {
  const binding = new ActionApprovalBindingEntity();

  Object.assign(binding, {
    workspaceId,
    initiatorUserWorkspaceId: userWorkspaceId,
    actionName: 'send_instagram_message',
    actionVersion: 2,
    actionKind: 'REPLY',
    draftId: '00000000-0000-4000-8000-000000000003',
    contentDigest: 'a'.repeat(64),
    recipientFingerprint: 'b'.repeat(64),
    sendingAccountFingerprint: 'c'.repeat(64),
    actionContextFingerprint: 'd'.repeat(64),
    threadId: '00000000-0000-4000-8000-000000000004',
    interactionContextType: null,
    interactionContextId: null,
    evidenceLinks: [],
    instagramMessageSnapshot: null,
    composerInputDigest: null,
  });

  return binding;
};

describe('InstagramMessageProposalReaderService', () => {
  beforeEach(() => {
    jest.mocked(isUserAuthContext).mockReturnValue(true);
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      type: 'user',
      workspace: { id: workspaceId },
      userWorkspaceId,
    } as never);
  });

  it.each([
    { instagramMessageSnapshot: {} },
    { composerInputDigest: 'e'.repeat(64) },
  ])(
    'rejects malformed v2 proposal rows before legacy reconstruction',
    async (v3Fields) => {
      const globalWorkspaceOrmManager = {
        executeInWorkspaceContext: jest.fn(),
      };
      const localAuthorityReader = {
        rebuildForProposal: jest.fn(),
      };
      const service = new InstagramMessageProposalReaderService(
        globalWorkspaceOrmManager as never,
        localAuthorityReader as never,
      );
      const binding = Object.assign(createLegacyReplyBinding(), v3Fields);

      await expect(service.read(binding, userWorkspaceId)).rejects.toThrow(
        'Instagram message proposal is unavailable',
      );
      expect(
        globalWorkspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
      expect(localAuthorityReader.rebuildForProposal).not.toHaveBeenCalled();
    },
  );

  it('still requires authenticated ownership before proposal validation', async () => {
    jest.mocked(isUserAuthContext).mockReturnValue(false);
    const service = new InstagramMessageProposalReaderService(
      {} as never,
      {} as never,
    );

    await expect(
      service.read(createLegacyReplyBinding(), userWorkspaceId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
