import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

export type InstagramComposerRecipient =
  | { creatorRecordId: string; rawHandle?: never }
  | { rawHandle: string; creatorRecordId?: never };

export type PrepareInstagramComposerInput = {
  recipient: InstagramComposerRecipient;
};

export type SendInstagramComposerInput = PrepareInstagramComposerInput & {
  draftId: string;
  expectedAccountRecordId: string;
  expectedPreparationFingerprint: string;
  body: string;
};

export type InstagramComposerAttempt = {
  draftId: string;
  approvalBindingId: string | null;
  receiptId: string | null;
  state: string | null;
};

export type InstagramComposerAuthenticatedContext = {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  workspaceMemberId: string;
  rolePermissionConfig: RolePermissionConfig;
};

export type InstagramComposerBlockedCode =
  | 'ACCOUNT_UNAVAILABLE'
  | 'RECIPIENT_UNAVAILABLE'
  | 'CREATOR_AMBIGUOUS'
  | 'CHAT_AMBIGUOUS'
  | 'TRAVERSAL_INCOMPLETE'
  | 'MISSING_ROUTE_PERMISSION'
  | 'TARGET_LOCKED'
  | 'CONTEXT_CHANGED'
  | 'CONVERSATION_DELETED';

export type InstagramComposerPrepared = {
  status: 'READY';
  normalizedHandle: string;
  creatorRecordId: string | null;
  sender: { accountRecordId: string; label: string };
  actionKind: 'START_CHAT' | 'REPLY';
  preparationFingerprint: string;
};

export type InstagramComposerBlocked = {
  status: 'BLOCKED';
  code: InstagramComposerBlockedCode;
};

export type InstagramComposerPreparation =
  | InstagramComposerPrepared
  | InstagramComposerBlocked;

export type ResolvedInstagramComposerGraph = InstagramComposerPrepared & {
  account: {
    bindingId: string;
    instagramAccountRecordId: string;
    instagramUserId: string;
    unipileAccountId: string;
  };
  recipient: {
    providerId: string;
    providerMessagingId: string;
    sourceValues: Array<{ field: string; value: string }>;
  };
  chat:
    | {
        actionKind: 'START_CHAT';
        conversationRecordId: null;
        providerChatId: null;
      }
    | {
        actionKind: 'REPLY';
        conversationRecordId: string;
        providerChatId: string;
      };
};
