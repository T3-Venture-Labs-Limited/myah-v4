import {
  type InstagramMessageActionAuthority,
  type InstagramMessageV3ActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import {
  type InstagramMessageIdentitySnapshot,
  type ExpectedActionBindingWithWorkspace,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';

export const INSTAGRAM_MESSAGE_AUTHORITY_READER = Symbol(
  'INSTAGRAM_MESSAGE_AUTHORITY_READER',
);

export type InstagramMessageAuthorityReader = {
  readV3RecoveryContext: (input: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }) => Promise<{
    snapshot: InstagramMessageIdentitySnapshot;
    contentDigest: string;
  }>;
  getDraftActionKind: (input: {
    workspaceId: string;
    draftId: string;
    expectedRevision: number;
  }) => Promise<'START_CHAT' | 'REPLY'>;
  assertReadyAfterReservation: (
    authority: InstagramMessageActionAuthority,
  ) => Promise<void>;
  createDirectAuthority: (input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    draftId: string;
    expectedRevision: number;
  }) => Promise<InstagramMessageV3ActionAuthority>;
  createThreadReplyAuthority: (input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    draftId: string;
  }) => Promise<InstagramMessageV3ActionAuthority>;
  rebuildForReconciliation: (input: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }) => Promise<InstagramMessageActionAuthority>;
  rebuildExecutionAuthority: (input: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }) => Promise<InstagramMessageActionAuthority>;
};
