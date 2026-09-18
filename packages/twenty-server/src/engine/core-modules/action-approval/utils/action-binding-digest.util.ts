import { createHash } from 'crypto';

import { assertUnreachable } from 'twenty-shared/utils';

import { type ExpectedActionBindingWithWorkspace } from 'src/engine/core-modules/action-approval/types/action-approval.type';

const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const normalizeActionContent = (value: string) =>
  value.replace(/\r\n?/g, '\n').normalize('NFC');

export const computeActionContentDigest = (content: string) =>
  sha256(normalizeActionContent(content));

export const computeLogicalActionKey = (
  input: ExpectedActionBindingWithWorkspace,
): string => {
  switch (input.actionName) {
    case 'send_instagram_reply':
      return sha256(
        JSON.stringify([
          'v1',
          input.workspaceId,
          input.actionName,
          input.actionVersion,
          input.draftId,
          input.contentDigest,
          input.recipientFingerprint,
          input.sendingAccountFingerprint,
          input.inboundMessageId,
          input.inboundSenderIgsid,
          input.inboundDirection,
          input.inboundReceivedAt.toISOString(),
        ]),
      );
    case 'send_instagram_message':
      if (input.actionVersion === 2) {
        // Historical v2 receipt idempotency must remain byte-for-byte stable.
        return sha256(
          JSON.stringify([
            'v2',
            input.workspaceId,
            input.actionName,
            input.actionVersion,
            input.actionKind,
            input.draftId,
            input.contentDigest,
            input.recipientFingerprint,
            input.sendingAccountFingerprint,
            input.actionContextFingerprint,
          ]),
        );
      }
      return sha256(
        JSON.stringify([
          'v3',
          input.workspaceId,
          input.actionName,
          input.actionVersion,
          input.actionKind,
          input.draftId,
          input.contentDigest,
          input.recipientFingerprint,
          input.sendingAccountFingerprint,
          input.actionContextFingerprint,
          input.composerInputDigest,
          input.instagramMessageSnapshot.actionKind,
          input.instagramMessageSnapshot.publicIdentifier,
          input.instagramMessageSnapshot.providerId,
          input.instagramMessageSnapshot.providerMessagingId,
          input.instagramMessageSnapshot.creatorRecordId,
          input.instagramMessageSnapshot.accountBindingId,
          input.instagramMessageSnapshot.instagramAccountRecordId,
          input.instagramMessageSnapshot.unipileAccountId,
          input.instagramMessageSnapshot.instagramUserId,
          input.instagramMessageSnapshot.recipientSourceValues.map(
            ({ field, value }) => [field, value],
          ),
          input.instagramMessageSnapshot.conversationRecordId,
          input.instagramMessageSnapshot.providerChatId,
          input.instagramMessageSnapshot.attendeeProviderId,
        ]),
      );
    case 'send_outreach_email':
    case 'send_inbox_reply':
      return sha256(
        JSON.stringify([
          'v1',
          input.workspaceId,
          input.actionName,
          input.actionVersion,
          input.draftId,
          input.contentDigest,
          input.recipientFingerprint,
          input.sendingAccountFingerprint,
          input.actionContextFingerprint,
        ]),
      );
    default:
      return assertUnreachable(input);
  }
};
