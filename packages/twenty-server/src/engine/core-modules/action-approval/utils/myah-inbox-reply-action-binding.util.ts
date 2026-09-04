import { type ActionEvidenceLinkInput } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import {
  type CanonicalMyahInboxReplyGraph,
  type MyahInboxReplyEvidenceObjectMetadataIds,
  type MyahInboxReplyExpectedActionBindingWithWorkspace,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';

export const buildMyahInboxReplyExpectedActionBinding = ({
  workspaceId,
  initiatorUserWorkspaceId,
  graph,
  evidenceObjectMetadataIds,
  agentChatThreadId,
}: {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  graph: CanonicalMyahInboxReplyGraph;
  evidenceObjectMetadataIds: MyahInboxReplyEvidenceObjectMetadataIds;
  agentChatThreadId?: string;
}): MyahInboxReplyExpectedActionBindingWithWorkspace => ({
  workspaceId,
  actionName: 'send_inbox_reply',
  actionVersion: 1,
  draftId: graph.messageThreadId,
  contentDigest: computeActionContentDigest(
    JSON.stringify([graph.subject, graph.draftBody.markdown]),
  ),
  recipientFingerprint: computeActionContentDigest(
    JSON.stringify([graph.recipientEmail]),
  ),
  sendingAccountFingerprint: computeActionContentDigest(
    JSON.stringify([
      graph.managedMailboxId,
      graph.connectedAccountId,
      graph.messageChannelId,
      graph.senderEmail,
      graph.senderDisplayName,
    ]),
  ),
  actionContextFingerprint: computeActionContentDigest(
    JSON.stringify([
      graph.draftRevision,
      graph.inReplyTo,
      graph.messageThreadId,
      graph.parentMessageId,
      graph.parentAssociationDirection,
      graph.providerThreadExternalId,
      graph.providerMessageExternalId,
      graph.connectedAccountId,
      graph.messageChannelId,
      graph.senderEmail,
      graph.senderDisplayName,
    ]),
  ),
  threadId: agentChatThreadId ?? graph.messageThreadId,
  initiatorUserWorkspaceId,
  evidenceLinks: [
    {
      objectMetadataId: evidenceObjectMetadataIds.messageThread,
      recordId: graph.messageThreadId,
      role: 'draft',
    },
    {
      objectMetadataId: evidenceObjectMetadataIds.message,
      recordId: graph.parentMessageId,
      role: 'thread_parent',
    },
  ],
});

export const matchesMyahInboxReplyBinding = (
  actual: MyahInboxReplyExpectedActionBindingWithWorkspace,
  expected: MyahInboxReplyExpectedActionBindingWithWorkspace,
): boolean => {
  if (
    actual.workspaceId !== expected.workspaceId ||
    actual.actionName !== expected.actionName ||
    actual.actionVersion !== expected.actionVersion ||
    actual.draftId !== expected.draftId ||
    actual.contentDigest !== expected.contentDigest ||
    actual.recipientFingerprint !== expected.recipientFingerprint ||
    actual.sendingAccountFingerprint !== expected.sendingAccountFingerprint ||
    actual.actionContextFingerprint !== expected.actionContextFingerprint ||
    actual.threadId !== expected.threadId ||
    actual.initiatorUserWorkspaceId !== expected.initiatorUserWorkspaceId
  )
    return false;
  const comparable = (evidence: readonly ActionEvidenceLinkInput[]) =>
    evidence
      .map(({ objectMetadataId, recordId, role }) =>
        JSON.stringify([objectMetadataId, recordId, role]),
      )
      .sort();
  return (
    JSON.stringify(comparable(actual.evidenceLinks)) ===
    JSON.stringify(comparable(expected.evidenceLinks))
  );
};
