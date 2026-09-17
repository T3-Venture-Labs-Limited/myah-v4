import { createHash } from 'crypto';

import {
  type BuildInstagramMessageActionAuthorityInput,
  type BuildInstagramMessageV3ActionAuthorityInput,
  type BuildLegacyInstagramMessageActionAuthorityInput,
  type InstagramMessageV2ActionAuthority,
  type InstagramMessageV3ActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import { type InstagramMessageIdentitySnapshot } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { isCanonicalInstagramUsername } from 'src/engine/core-modules/action-approval/utils/resolve-instagram-recipient.util';

export const INSTAGRAM_MESSAGE_ACTION_NAME = 'send_instagram_message' as const;
export const INSTAGRAM_MESSAGE_ACTION_VERSION = 3 as const;
export const INSTAGRAM_DIRECT_INTERACTION_CONTEXT =
  'MYAH_INSTAGRAM_MESSAGE_DRAFT' as const;
export const INSTAGRAM_MESSAGE_V3_ACTION_VERSION =
  INSTAGRAM_MESSAGE_ACTION_VERSION;
export const INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT =
  INSTAGRAM_DIRECT_INTERACTION_CONTEXT;
export const LEGACY_INSTAGRAM_DIRECT_INTERACTION_CONTEXT =
  'MYAH_INBOX_INSTAGRAM_DRAFT' as const;

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const hasOpaqueString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isActionDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

export const isInstagramMessageIdentitySnapshot = (
  value: unknown,
): value is InstagramMessageIdentitySnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const snapshot = value as Record<string, unknown>;
  if (
    !isCanonicalInstagramUsername(snapshot.publicIdentifier) ||
    !hasOpaqueString(snapshot.providerId) ||
    !hasOpaqueString(snapshot.providerMessagingId) ||
    !isUuid(snapshot.creatorRecordId) ||
    !isUuid(snapshot.accountBindingId) ||
    !isUuid(snapshot.instagramAccountRecordId) ||
    !hasOpaqueString(snapshot.unipileAccountId) ||
    !hasOpaqueString(snapshot.instagramUserId) ||
    !Array.isArray(snapshot.recipientSourceValues) ||
    !snapshot.recipientSourceValues.every(
      (sourceValue) =>
        sourceValue &&
        typeof sourceValue === 'object' &&
        hasOpaqueString((sourceValue as Record<string, unknown>).field) &&
        hasOpaqueString((sourceValue as Record<string, unknown>).value),
    )
  ) {
    return false;
  }

  if (snapshot.actionKind === 'START_CHAT') {
    return (
      snapshot.conversationRecordId === null &&
      snapshot.providerChatId === null &&
      snapshot.attendeeProviderId === null
    );
  }

  return (
    snapshot.actionKind === 'REPLY' &&
    isUuid(snapshot.conversationRecordId) &&
    hasOpaqueString(snapshot.providerChatId) &&
    hasOpaqueString(snapshot.attendeeProviderId) &&
    snapshot.attendeeProviderId === snapshot.providerMessagingId
  );
};

const assertActionKindTarget = (
  input: Pick<BuildInstagramMessageActionAuthorityInput, 'draft'>,
) => {
  const { draft } = input;

  if (draft.kind === 'START_CHAT') {
    if (draft.conversationRecordId || draft.providerConversationId) {
      throw new Error(
        'START_CHAT authority cannot target an existing conversation',
      );
    }
    if (!draft.creatorRecordId) {
      throw new Error('START_CHAT authority requires a Creator');
    }

    return;
  }

  if (!draft.conversationRecordId || !draft.providerConversationId) {
    throw new Error('REPLY authority requires one exact active conversation');
  }
};

const assertV3InteractionContext = (
  input: BuildInstagramMessageV3ActionAuthorityInput,
) => {
  if (input.threadId) {
    if (input.interactionContextType || input.interactionContextId) {
      throw new Error(
        'Instagram approval cannot mix thread and direct context',
      );
    }
    if (input.draft.kind === 'START_CHAT') {
      throw new Error('START_CHAT is not available to agent threads');
    }
    if (input.composerInputDigest !== null) {
      throw new Error('Instagram message identity snapshot is unavailable');
    }

    return;
  }

  if (input.interactionContextId !== input.draft.id) {
    throw new Error(
      'Direct Instagram approval context does not match the draft',
    );
  }
  if (
    input.interactionContextType !==
    INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT
  ) {
    throw new Error(
      'Direct Instagram approval context does not match the draft',
    );
  }
  if (
    input.draft.kind === 'START_CHAT' &&
    !isActionDigest(input.composerInputDigest)
  ) {
    throw new Error('Instagram message identity snapshot is unavailable');
  }
  if (
    input.draft.kind === 'REPLY' &&
    input.composerInputDigest !== null &&
    !isActionDigest(input.composerInputDigest)
  ) {
    throw new Error('Instagram message identity snapshot is unavailable');
  }
};

const assertLegacyInteractionContext = (
  input: BuildLegacyInstagramMessageActionAuthorityInput,
) => {
  if (input.threadId) {
    if (input.interactionContextType || input.interactionContextId) {
      throw new Error(
        'Instagram approval cannot mix thread and direct context',
      );
    }
    if (input.draft.kind === 'START_CHAT') {
      throw new Error('START_CHAT is not available to agent threads');
    }

    return;
  }

  if (
    input.interactionContextType !==
      LEGACY_INSTAGRAM_DIRECT_INTERACTION_CONTEXT ||
    input.interactionContextId !== input.draft.id
  ) {
    throw new Error(
      'Direct Instagram approval context does not match the draft',
    );
  }
};

const buildCommonBinding = (
  input: Pick<
    BuildInstagramMessageActionAuthorityInput,
    | 'workspaceId'
    | 'initiatorUserWorkspaceId'
    | 'threadId'
    | 'interactionContextType'
    | 'interactionContextId'
    | 'draft'
    | 'account'
    | 'evidenceLinks'
  >,
  legacy = false,
) => {
  const body = input.draft.body.trim();
  const recipientUsername = input.draft.recipientUsername.trim().toLowerCase();
  const recipientProviderId = legacy
    ? input.draft.recipientProviderId.trim()
    : input.draft.recipientProviderId;

  if (!body) throw new Error('Instagram message body is empty');
  if (!recipientUsername || !recipientProviderId) {
    throw new Error('Instagram message recipient is unavailable');
  }

  return {
    actionName: INSTAGRAM_MESSAGE_ACTION_NAME,
    actionKind: input.draft.kind,
    draftId: input.draft.id,
    contentDigest: computeActionContentDigest(body),
    recipientFingerprint: sha256([recipientUsername, recipientProviderId]),
    sendingAccountFingerprint: sha256([
      input.account.bindingId,
      input.account.workspaceInstagramAccountRecordId,
      input.account.unipileAccountId,
      input.account.instagramUserId,
    ]),
    actionContextFingerprint: sha256([
      input.draft.kind,
      input.draft.id,
      input.draft.revision,
      input.draft.creatorRecordId,
      input.draft.recipientSourceValues,
      input.draft.conversationRecordId,
      input.draft.providerConversationId,
    ]),
    threadId: input.threadId,
    interactionContextType: input.interactionContextType,
    interactionContextId: input.interactionContextId,
    initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
    evidenceLinks: input.evidenceLinks,
    workspaceId: input.workspaceId,
  };
};

/** Builds the only authority shape permitted for newly approved Instagram sends. */
export const buildInstagramMessageV3ActionAuthority = (
  input: BuildInstagramMessageV3ActionAuthorityInput,
): InstagramMessageV3ActionAuthority => {
  assertV3InteractionContext(input);
  assertActionKindTarget(input);

  const snapshot = input.instagramMessageSnapshot;
  if (
    !isInstagramMessageIdentitySnapshot(snapshot) ||
    snapshot.actionKind !== input.draft.kind ||
    snapshot.publicIdentifier !== input.draft.recipientUsername ||
    snapshot.providerId !== input.draft.recipientProviderId ||
    snapshot.creatorRecordId !== input.draft.creatorRecordId ||
    snapshot.accountBindingId !== input.account.bindingId ||
    snapshot.instagramAccountRecordId !==
      input.account.workspaceInstagramAccountRecordId ||
    snapshot.unipileAccountId !== input.account.unipileAccountId ||
    snapshot.instagramUserId !== input.account.instagramUserId ||
    JSON.stringify(snapshot.recipientSourceValues) !==
      JSON.stringify(input.draft.recipientSourceValues) ||
    snapshot.conversationRecordId !== input.draft.conversationRecordId ||
    snapshot.providerChatId !== input.draft.providerConversationId ||
    (snapshot.actionKind === 'START_CHAT' && input.threadId !== null)
  ) {
    throw new Error('Instagram message identity snapshot is unavailable');
  }

  return {
    expectedActionBinding: {
      ...buildCommonBinding(input),
      actionVersion: INSTAGRAM_MESSAGE_V3_ACTION_VERSION,
      interactionContextType: input.threadId
        ? null
        : INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT,
      instagramMessageSnapshot: snapshot,
      composerInputDigest: input.composerInputDigest,
    },
    canonicalGraph: { draft: input.draft, account: input.account },
  };
};

/** Reconstructs immutable historical v2 receipts; fresh approval must never call it. */
export const buildLegacyInstagramMessageActionAuthority = (
  input: BuildLegacyInstagramMessageActionAuthorityInput,
): InstagramMessageV2ActionAuthority => {
  assertLegacyInteractionContext(input);
  assertActionKindTarget(input);

  return {
    expectedActionBinding: {
      ...buildCommonBinding(input, true),
      actionVersion: 2,
      interactionContextType: input.threadId
        ? null
        : LEGACY_INSTAGRAM_DIRECT_INTERACTION_CONTEXT,
    },
    canonicalGraph: { draft: input.draft, account: input.account },
  };
};

export const buildInstagramMessageActionAuthority =
  buildInstagramMessageV3ActionAuthority;
