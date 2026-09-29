export const MYAH_INBOX_DEFAULT_PAGE_SIZE = 25;
export const MYAH_INBOX_MAX_PAGE_SIZE = 100;
// Contact-list-only ceiling so a depth-preserving refresh (see the
// contact-inbox-contact-list spec) can re-fetch everything already loaded in one
// request. Every contact-list request builds the full workspace contact
// projection regardless of page size, so this only bounds response size, not
// database cost.
// ponytail: fixed cap, not a server-push architecture. Raise it, or move to
// server-pushed incremental list updates, if operators routinely scroll past it.
export const MYAH_INBOX_CONTACT_MAX_PAGE_SIZE = 500;
export const MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH = 100_000;
export const MYAH_INBOX_MAX_DRAFT_BLOCKNOTE_LENGTH = 1_000_000;
