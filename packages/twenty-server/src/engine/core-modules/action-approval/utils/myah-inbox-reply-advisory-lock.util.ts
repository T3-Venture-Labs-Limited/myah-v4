export const MYAH_INBOX_REPLY_ADVISORY_LOCK_QUERY =
  'SELECT pg_advisory_xact_lock(hashtext($1))';

export const getMyahInboxReplyAdvisoryLockKey = (
  workspaceId: string,
  threadId: string,
) => `myah-inbox-reply:${workspaceId}:${threadId}`;
