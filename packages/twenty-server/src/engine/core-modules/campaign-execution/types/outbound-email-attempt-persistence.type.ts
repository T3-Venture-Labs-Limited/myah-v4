export const OUTBOUND_EMAIL_ATTEMPT_STATES = [
  'RESERVED',
  'PROCESSING',
  'BLOCKED',
  'ACCEPTED',
  'DEFINITELY_UNACCEPTED',
  'UNKNOWN',
] as const;

export type OutboundEmailAttemptState =
  (typeof OUTBOUND_EMAIL_ATTEMPT_STATES)[number];

export type OutboundEmailAttemptSource =
  | 'CAMPAIGN_SEQUENCE'
  | 'CAMPAIGN_TEST'
  | 'INBOX'
  | 'AUTOMATED_REPLY';

export type OutboundEmailCapacityState =
  | 'RESERVED'
  | 'CONSUMED'
  | 'RELEASED'
  | 'PROVISIONAL_UNKNOWN';

export type OutboundEmailSelectionConstraintKind =
  | 'ROTATE'
  | 'PINNED_REPLY'
  | 'EXPLICIT';
