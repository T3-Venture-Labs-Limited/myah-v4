import { createHash } from 'crypto';

import { assertUnreachable } from 'twenty-shared/utils';

import {
  type MyahReplyContextSnapshot,
  type ExpectedActionBindingWithWorkspace,
} from 'src/engine/core-modules/action-approval/types/action-approval.type';

const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const normalizeActionContent = (value: string) =>
  value.replace(/\r\n?/g, '\n').normalize('NFC');

export const computeActionContentDigest = (content: string) =>
  sha256(normalizeActionContent(content));

// JSONB may reorder object keys; immutable authority uses a field-ordered tuple.
export const serializeMyahReplyContextSnapshot = (
  snapshot: MyahReplyContextSnapshot,
) =>
  JSON.stringify([
    snapshot.schemaVersion,
    snapshot.channel,
    snapshot.deliveryTargetId,
    snapshot.draftId,
    snapshot.replyContext.kind,
    snapshot.replyContext.kind === 'CAMPAIGN'
      ? snapshot.replyContext.campaignId
      : null,
    snapshot.contactAnchor.kind,
    snapshot.contactAnchor.id,
    snapshot.creatorId,
    snapshot.eligibilityEvidenceDigest,
    snapshot.authoredContextFingerprint,
    snapshot.reviewedContextFingerprint,
    snapshot.contextFingerprint,
  ]);

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
    case 'send_outreach_email':
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
    case 'send_inbox_reply':
      return sha256(
        JSON.stringify([
          input.actionVersion === 2 ? 'v2' : 'v1',
          input.workspaceId,
          input.actionName,
          input.actionVersion,
          input.draftId,
          input.contentDigest,
          input.recipientFingerprint,
          input.sendingAccountFingerprint,
          input.actionContextFingerprint,
          ...(input.actionVersion === 2
            ? [
                [
                  input.threadId,
                  input.interactionContextType,
                  input.interactionContextId,
                  serializeMyahReplyContextSnapshot(
                    input.myahReplyContextSnapshot,
                  ),
                ],
              ]
            : []),
        ]),
      );
    default:
      return assertUnreachable(input);
  }
};
