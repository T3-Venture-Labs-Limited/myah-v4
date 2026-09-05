import { type InstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import { type ExpectedActionBindingWithWorkspace } from 'src/engine/core-modules/action-approval/types/action-approval.type';

export const INSTAGRAM_MESSAGE_AUTHORITY_READER = Symbol(
  'INSTAGRAM_MESSAGE_AUTHORITY_READER',
);

export type InstagramMessageAuthorityReader = {
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
  }) => Promise<InstagramMessageActionAuthority>;
  createThreadReplyAuthority: (input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    draftId: string;
  }) => Promise<InstagramMessageActionAuthority>;
  rebuildForReconciliation: (input: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }) => Promise<InstagramMessageActionAuthority>;
  rebuildExecutionAuthority: (input: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }) => Promise<InstagramMessageActionAuthority>;
};
