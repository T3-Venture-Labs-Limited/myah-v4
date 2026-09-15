import { createHash } from 'crypto';

import {
  type BuildInstagramMessageActionAuthorityInput,
  type InstagramMessageActionAuthority,
} from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

export const INSTAGRAM_MESSAGE_ACTION_NAME = 'send_instagram_message' as const;
export const INSTAGRAM_MESSAGE_ACTION_VERSION = 2 as const;
export const INSTAGRAM_DIRECT_INTERACTION_CONTEXT =
  'MYAH_INBOX_INSTAGRAM_DRAFT' as const;

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

const assertInteractionContext = (
  input: BuildInstagramMessageActionAuthorityInput,
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
    input.interactionContextType !== INSTAGRAM_DIRECT_INTERACTION_CONTEXT ||
    input.interactionContextId !== input.draft.id
  ) {
    throw new Error(
      'Direct Instagram approval context does not match the draft',
    );
  }
};

const assertActionKindTarget = (
  input: BuildInstagramMessageActionAuthorityInput,
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

export const buildInstagramMessageActionAuthority = (
  input: BuildInstagramMessageActionAuthorityInput,
): InstagramMessageActionAuthority => {
  assertInteractionContext(input);
  assertActionKindTarget(input);

  const body = input.draft.body.trim();
  const recipientUsername = input.draft.recipientUsername.trim().toLowerCase();
  const recipientProviderId = input.draft.recipientProviderId.trim();

  if (!body) throw new Error('Instagram message body is empty');
  if (!recipientUsername || !recipientProviderId) {
    throw new Error('Instagram message recipient is unavailable');
  }

  const expectedActionBinding = {
    actionName: INSTAGRAM_MESSAGE_ACTION_NAME,
    actionVersion: INSTAGRAM_MESSAGE_ACTION_VERSION,
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
  } as const;

  return {
    expectedActionBinding,
    canonicalGraph: { draft: input.draft, account: input.account },
  };
};
