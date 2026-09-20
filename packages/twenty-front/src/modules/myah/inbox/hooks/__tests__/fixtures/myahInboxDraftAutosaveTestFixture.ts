import { type MyahInboxDraftAutosaveKey } from '@/myah/inbox/types/MyahInboxDraftAutosave';
import {
  ReplyChannel,
  ReplyContextKind,
  type MyahInboxReplyDraftInput,
} from '~/generated/graphql';

export const draftKeyFixture = (
  workspaceId = 'workspace-1',
  deliveryTargetId = 'thread-1',
): MyahInboxDraftAutosaveKey => ({
  workspaceId,
  deliveryTargetId,
  contactAnchorKind: 'CREATOR',
  contactAnchorId: 'creator-1',
  channel: 'EMAIL',
  contextKind: 'CAMPAIGN',
  campaignId: 'campaign-1',
});
export const draftInputFixture = (
  key = draftKeyFixture(),
): MyahInboxReplyDraftInput => ({
  expectedWorkspaceId: key.workspaceId,
  target: {
    channel: ReplyChannel.EMAIL,
    contactId: 'opaque-contact',
    threadId: key.deliveryTargetId,
  },
  replyContext: { kind: ReplyContextKind.CAMPAIGN, campaignId: key.campaignId },
});
