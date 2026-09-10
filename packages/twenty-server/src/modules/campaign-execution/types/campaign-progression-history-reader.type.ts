import { type EntityManager } from 'typeorm';

export type CampaignProgressionHistoryScope = Readonly<{
  workspaceId: string;
  campaignId: string;
  creatorId: string;
  workflowVersionId: string;
}>;

/** Canonical UTC ISO-8601 millisecond text: `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export type CampaignProgressionHistoryTimestamp = string;

export type CampaignAcceptedProgressionHistoryEntry = Readonly<{
  kind: 'ACCEPTED';
  workspaceId: string;
  campaignId: string;
  authorizationId: string;
  enrollmentId: string;
  occurrenceId: string;
  attemptId: string;
  acceptedEvidenceId: string;
  workflowVersionId: string;
  messageId: string;
  authoredMessageIndex: number;
  connectedAccountId: string;
  messageChannelId: string;
  provider: string;
  normalizedSenderHandle: string;
  normalizedRecipient: string;
  providerMessageId: string;
  providerAcceptedAt: CampaignProgressionHistoryTimestamp;
}>;

export type CampaignMaterializedTerminalProgressionHistoryEntry = Readonly<{
  kind: 'MATERIALIZED_TERMINAL';
  authorizationId: string;
  enrollmentId: string;
  occurrenceId: string;
  workflowVersionId: string;
  messageId: string;
  authoredMessageIndex: number;
  occurrenceState: 'SKIPPED' | 'CANCELLED';
  terminalReason: string;
  terminalAt: CampaignProgressionHistoryTimestamp;
}>;

export type CampaignProgressionHistoryEntry =
  | CampaignAcceptedProgressionHistoryEntry
  | CampaignMaterializedTerminalProgressionHistoryEntry;

export type CampaignProgressionHistoryBlockedReason =
  | 'UNRESOLVED_HISTORY'
  | 'UNKNOWN_OUTCOME'
  | 'AMBIGUOUS_HISTORY'
  | 'MALFORMED_HISTORY'
  | 'UNRECONCILED_HISTORY';

export type CampaignProgressionHistoryResult =
  | Readonly<{
      status: 'COMPLETE';
      entries: readonly CampaignProgressionHistoryEntry[];
      lastProviderAcceptedAt: CampaignProgressionHistoryTimestamp | null;
    }>
  | Readonly<{
      status: 'BLOCKED';
      reason: CampaignProgressionHistoryBlockedReason;
    }>;

/**
 * Supplied-manager, PostgreSQL-only reader for one Creator and one exact
 * workflow version. The implementation must use the caller's active manager;
 * it must not open a transaction, switch query runners, infer attempts, or do
 * file, provider, queue, or network I/O.
 *
 * Durable source mapping (all identifiers are exact scope equality):
 *
 * 1. Read every `core.campaignEnrollment` row in `(workspaceId, campaignId)`
 *    so an orphan attempt cannot disappear behind the Creator filter; identify
 *    the exact `creatorId` subset only after parsing. Validate each enrollment
 *    ID, authorization ID, positive authorization generation, immutable
 *    Creator binding, state, terminal shape, and scope. Enrollment state and
 *    `nextAuthoredMessageIndex` never constitute message history by
 *    themselves.
 * 2. Independently read every `core.campaignOccurrence` joined through those
 *    enrollments for the requested `workflowVersionId`. Validate the exact
 *    workspace, Campaign, enrollment, authorization-owned scope, version,
 *    message ID, non-negative authored index, non-null `dueAt`, state, and
 *    terminal shape. Do not inner-join away a missing companion row.
 * 3. Independently read every `core.outboundEmailAttempt` whose source is
 *    `CAMPAIGN_SEQUENCE` in the Campaign/version scope and reconcile each row
 *    through its exact enrollment and occurrence binding before selecting the
 *    target Creator's rows. A relevant attempt must match workspace, Campaign,
 *    enrollment, occurrence, authorization, workflow version, and message ID.
 *    It must also satisfy the accepted Task 5 source, selection, reservation,
 *    capacity, and outcome shapes. An orphan or partially nullable
 *    Campaign-sequence binding is malformed; no attempt state may be inferred
 *    from an occurrence.
 *
 * A returned `ACCEPTED` entry requires exactly one Task 5 attempt in
 * `ACCEPTED` with `capacityState = CONSUMED`, non-null valid
 * `finalEvidenceDigest`, non-blank `providerMessageId`, valid non-null
 * `providerAcceptedAt`, `safeOutcomeReason = null`, `retryable = false`, and a
 * null-or-valid `projectedMessageId`, bound to an occurrence in `SUCCEEDED`.
 * `acceptedEvidenceId` is not a new identity: it is exactly equal to that
 * attempt's `attemptId`. The entry copies the same attempt's exact workspace,
 * Campaign, connected-account, message-channel, provider, normalized sender,
 * normalized recipient, provider message, and provider-acceptance-time binding;
 * none may be reconstructed
 * from another table or caller input. Provider acceptance suppresses replay
 * even while `projectedMessageId` is null; projected-SENT evidence is a
 * separate sender-pinning concern. `lastProviderAcceptedAt` is exactly the
 * greatest `providerAcceptedAt` among returned accepted entries, and is null
 * exactly when there are none. It is the only prior-send delay anchor exposed
 * by this port.
 *
 * Task 5 attempt states are exhaustive. `RESERVED` or `PROCESSING` always
 * yields `UNRESOLVED_HISTORY`; `UNKNOWN` always yields `UNKNOWN_OUTCOME`.
 * `BLOCKED` and `DEFINITELY_UNACCEPTED` are validated resolved non-acceptance
 * attempts, but never suppress a message by themselves: with a `PENDING`,
 * `IN_FLIGHT`, or `HELD` occurrence they yield `UNRESOLVED_HISTORY`; with an
 * `UNKNOWN` occurrence they yield `UNKNOWN_OUTCOME`; with `SUCCEEDED` and no
 * accepted attempt they yield `UNRECONCILED_HISTORY`; and with `SKIPPED` or
 * `CANCELLED` they may remain as prior failed-attempt history while the
 * occurrence supplies the terminal suppression entry.
 *
 * A returned `MATERIALIZED_TERMINAL` entry requires one occurrence in
 * `SKIPPED` or `CANCELLED`, with its required durable terminal reason/time and
 * no `ACCEPTED`, `RESERVED`, `PROCESSING`, or `UNKNOWN` attempt. It may have
 * zero or more shape-valid `BLOCKED` or `DEFINITELY_UNACCEPTED` attempts.
 * `SUCCEEDED` is represented only by its accepted entry. A nonterminal
 * occurrence with no attempt is `UNRESOLVED_HISTORY`. Individually valid
 * accepted evidence not reconciled to a `SUCCEEDED` occurrence, or
 * `SUCCEEDED` without exactly one accepted attempt, is
 * `UNRECONCILED_HISTORY`.
 *
 * More than one suppression-entry candidate for the same
 * `(workflowVersionId, messageId, authoredMessageIndex)` across authorizations
 * is `AMBIGUOUS_HISTORY`, whether both are accepted, both are materialized
 * terminal, or one is accepted and one terminal. Duplicate or conflicting
 * occurrence identity across authorizations, multiple accepted attempts for
 * one occurrence, one message at different authored indexes, or one authored
 * index bound to different messages is also `AMBIGUOUS_HISTORY`. Invalid
 * enums, timestamps, UUIDs, source/outcome shapes,
 * scope bindings, terminal shapes, or missing structural companions are
 * `MALFORMED_HISTORY`. A blocked result contains no partial entries or timing
 * anchor. Query/parse incompleteness throws so the outer transaction fails;
 * it is never converted to an empty complete result.
 *
 * `COMPLETE` with an empty `entries` array is valid proof of no materialized
 * same-version history. Cursor-only unavailable skips intentionally produce no
 * entry: they are local to their prior authorization and a new authorization
 * may reconsider them. Within the current authorization, its own enrollment
 * cursor remains authoritative and is not interpreted by this reader. A
 * caller may use admission time only after a `COMPLETE` read and its explicit
 * planning rule; it must never substitute admission/current time for a missing
 * accepted anchor after a blocked or failed read.
 *
 * When several defects coexist, result precedence is `MALFORMED_HISTORY`,
 * `UNKNOWN_OUTCOME`, `AMBIGUOUS_HISTORY`, `UNRECONCILED_HISTORY`, then
 * `UNRESOLVED_HISTORY`. Every persisted timestamp is validated as a finite
 * PostgreSQL instant and returned as canonical UTC ISO-8601 millisecond text;
 * the reader never returns mutable `Date` values.
 *
 * A complete result is a detached, recursively immutable snapshot. Entries
 * are unique and sorted by authored index, then message ID.
 *
 * The consumer must match every returned `(workflowVersionId, messageId,
 * authoredMessageIndex)` to the immutable MYAH-319 plan before suppression or
 * scheduling. This port proves no cross-version equivalence and returns no
 * content hash, fallback timestamp, synthetic occurrence, or inferred skip.
 */
export interface CampaignProgressionHistoryReaderPort {
  readSameWorkflowVersionHistoryInTransaction(
    input: CampaignProgressionHistoryScope,
    manager: EntityManager,
  ): Promise<CampaignProgressionHistoryResult>;
}
