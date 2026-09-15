import {
  type ActionEvidenceLinkInput,
  type InstagramMessageActionKind,
  type InstagramMessageExpectedActionBinding,
  type InstagramMessageInteractionContextType,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';

export type InstagramMessageDraftAuthoritySource = {
  id: string;
  revision: number;
  body: string;
  kind: InstagramMessageActionKind;
  creatorRecordId: string | null;
  recipientUsername: string;
  recipientSourceValues: Array<{ field: string; value: string }>;
  conversationRecordId: string | null;
  providerConversationId: string | null;
  recipientProviderId: string;
};

export type InstagramMessageAccountAuthoritySource = {
  bindingId: string;
  workspaceInstagramAccountRecordId: string;
  unipileAccountId: string;
  instagramUserId: string;
};

export type BuildInstagramMessageActionAuthorityInput = {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  threadId: string | null;
  interactionContextType: InstagramMessageInteractionContextType | null;
  interactionContextId: string | null;
  draft: InstagramMessageDraftAuthoritySource;
  account: InstagramMessageAccountAuthoritySource;
  evidenceLinks: ActionEvidenceLinkInput[];
};

export type InstagramMessageActionAuthority = {
  expectedActionBinding: InstagramMessageExpectedActionBinding & {
    workspaceId: string;
  };
  canonicalGraph: {
    draft: InstagramMessageDraftAuthoritySource;
    account: InstagramMessageAccountAuthoritySource;
  };
};
