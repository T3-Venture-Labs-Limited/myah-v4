export type MessageOutboundErrorOutcome =
  | { kind: 'rejected'; code: 'provider_rejected' }
  | { kind: 'unknown'; code: 'unknown' };
