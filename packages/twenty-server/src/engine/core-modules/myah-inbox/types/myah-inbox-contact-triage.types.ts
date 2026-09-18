export type MyahInboxTriageChannel = 'EMAIL' | 'INSTAGRAM';
export type MyahInboxTriageDirection = 'INBOUND' | 'OUTBOUND' | 'UNKNOWN';
export type MyahInboxTriageMode = 'LIVE' | 'BACKFILL';

export type MyahInboxInboundEvidence = {
  channel: MyahInboxTriageChannel;
  persistedMessageId: string;
  sourceRecordId: string;
  sourceGenerationId: string;
  mode: MyahInboxTriageMode;
  direction: MyahInboxTriageDirection;
  providerOccurredAt: string | null;
  originalCreatedAt: string;
  firstPersistence: boolean;
};

export type MyahInboxReceiptDrainScope = {
  workspaceId: string;
  throughSequence: string;
  purpose: 'CATCH_UP' | 'READY_RECOVERY';
};
