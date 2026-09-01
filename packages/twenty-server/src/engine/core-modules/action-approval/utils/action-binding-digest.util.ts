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
