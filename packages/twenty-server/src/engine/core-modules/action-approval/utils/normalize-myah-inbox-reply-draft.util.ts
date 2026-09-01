import {
  type InboxMessageThreadRecord,
  type MyahInboxReplyDraft,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';

export const normalizeMyahInboxReplyDraft = (
  thread: Pick<
    InboxMessageThreadRecord,
    | 'myahReplyDraftBody'
    | 'myahReplyDraftBodyMarkdown'
    | 'myahReplyDraftBodyBlocknote'
  >,
): MyahInboxReplyDraft | null => {
  if (thread.myahReplyDraftBody !== undefined) {
    return thread.myahReplyDraftBody;
  }

  if (thread.myahReplyDraftBodyMarkdown === undefined) {
    return null;
  }

  return thread.myahReplyDraftBodyMarkdown === null
    ? null
    : {
        markdown: thread.myahReplyDraftBodyMarkdown,
        blocknote: thread.myahReplyDraftBodyBlocknote ?? null,
      };
};
