export type MyahInboxSourceType = 'EMAIL_THREAD' | 'INSTAGRAM_CONVERSATION';

export const MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtextextended('myah-inbox-source:' || $1, 0))";

export const buildMyahInboxSourceKey = (
  sourceType: MyahInboxSourceType,
  sourceRecordId: string,
): string => `${sourceType}:${sourceRecordId}`;
