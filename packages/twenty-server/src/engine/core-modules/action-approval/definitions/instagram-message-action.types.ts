import {
  type ActionEvidenceLinkInput,
  type InstagramMessageActionKind,
  type InstagramMessageIdentitySnapshot,
  type InstagramMessageV2ExpectedActionBinding,
  type InstagramMessageV3ExpectedActionBinding,
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

export type BuildLegacyInstagramMessageActionAuthorityInput = {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  threadId: string | null;
  interactionContextType: InstagramMessageInteractionContextType | null;
  interactionContextId: string | null;
  draft: InstagramMessageDraftAuthoritySource;
  account: InstagramMessageAccountAuthoritySource;
  evidenceLinks: ActionEvidenceLinkInput[];
};

export type BuildInstagramMessageV3ActionAuthorityInput =
  BuildLegacyInstagramMessageActionAuthorityInput & {
    interactionContextType: InstagramMessageInteractionContextType | null;
    instagramMessageSnapshot: InstagramMessageIdentitySnapshot;
    composerInputDigest: string | null;
  };

export type BuildInstagramMessageActionAuthorityInput =
  BuildInstagramMessageV3ActionAuthorityInput;

type InstagramMessageAuthorityGraph = {
  canonicalGraph: {
    draft: InstagramMessageDraftAuthoritySource;
    account: InstagramMessageAccountAuthoritySource;
  };
};

export type InstagramMessageV2ActionAuthority =
  InstagramMessageAuthorityGraph & {
    expectedActionBinding: InstagramMessageV2ExpectedActionBinding & {
      workspaceId: string;
    };
  };

export type InstagramMessageV3ActionAuthority =
  InstagramMessageAuthorityGraph & {
    expectedActionBinding: InstagramMessageV3ExpectedActionBinding & {
      workspaceId: string;
    };
  };

export type InstagramMessageActionAuthority =
  | InstagramMessageV2ActionAuthority
  | InstagramMessageV3ActionAuthority;
