// Disconnected decision contract. The future transactional caller must load a complete,
// workspace-scoped snapshot of ALL conversation associations (including disabled
// Campaigns), canonical message/association/participant rows, persisted control
// transitions (Campaign enablement and participation pauses) and current authorized
// access. A membership or messageThread's
// myahCampaignId is only a discovery hint, never a binding. This function neither
// validates snapshot provenance nor persists the returned identity.
export type CanonicalEmailReplySnapshot = {
  event: {
    workspaceId: string;
    messageId: string; // canonical workspace Message.id; not a provider ID
    threadId: string;
    channelId: string; // MessageChannelMessageAssociation.messageChannelId
    connectedAccountId: string; // MessageChannel.connectedAccountId
    from: string; // canonical FROM participant handle; compare verbatim
    to: string; // canonical TO participant handle on the linked account; compare verbatim
    creatorId: string | null; // sender's authoritative Creator relationship, not thread/membership inference
    direction: 'INCOMING' | 'OUTGOING' | 'UNKNOWN';
    importMode: 'BACKFILL' | 'LIVE'; // trusted source generation, not inferred from timestamps
    initialSyncCompletedAt: Date | null; // immutable first completed sync frontier for this channel; NEVER latest syncedAt
    isDraft: boolean;
    receivedAt: Date | null; // Message.receivedAt
    providerOccurredAt: Date | null; // trusted provider occurrence, not import mode
    firstPersistedAt: Date | null; // first canonical insertion; not re-import time
    wasInserted: boolean; // persistence result for this import, not source mode
  };
  controls: Array<{
    workspaceId: string;
    campaignId: string;
    state: 'ENABLED' | 'DISABLED'; // persisted reply-handling control
    enabledAt: Date | null; // beginning of CURRENT enablement epoch
    disabledAt: Date | null; // null only while enabled
  }>;
  participationControls: Array<{
    workspaceId: string;
    campaignId: string;
    participationId: string; // exact selected Creator–Campaign participation
    pauses: Array<{ pausedAt: Date | null; resumedAt: Date | null }>;
  }>;
  bindings: Array<{
    workspaceId: string;
    campaignId: string;
    participationId: string;
    creatorId: string;
    threadId: string;
    channelId: string;
    connectedAccountId: string;
    recipient: string;
    creatorSender: string;
    messageId: string | null; // null means conversation-wide; otherwise exact canonical Message.id
    establishedAt: Date | null;
    revokedAt: Date | null;
    deletedAt: Date | null;
  }>;
  access: Array<{
    workspaceId: string;
    participationId: string;
    grantedAt: Date | null;
    revokedAt: Date | null;
  }>; // authoritative permission-scoped snapshot; absence is not a grant
  existingWorkMessageIds: string[]; // unique persisted (workspace,message,purpose) lookup
};

type Hold = {
  status: 'out-of-scope' | 'historical' | 'ambiguous' | 'unavailable';
  reason: string;
};
type Attribution = {
  status: 'attributed';
  workspaceId: string;
  messageId: string;
  purpose: 'EMAIL_INBOUND_REPLY';
  participationId: string;
  campaignId: string;
};
const hold = (status: Hold['status'], reason: string): Hold => ({
  status,
  reason,
});
const time = (value: Date | null | undefined): number | null =>
  value instanceof Date && Number.isFinite(value.getTime())
    ? value.getTime()
    : null;
const knownNullableTime = (value: Date | null | undefined): boolean =>
  value === null || time(value) !== null;
const nonEmpty = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/** Eligibility only: an attributed result is NOT send, generation, or enqueue authority. */
export const decideCanonicalEmailReplyWork = (
  snapshot: CanonicalEmailReplySnapshot,
): Hold | Attribution => {
  const { event } = snapshot;
  if (event.direction !== 'INCOMING' || event.isDraft)
    return hold('out-of-scope', 'NOT_INBOUND');
  if (
    !nonEmpty(event.workspaceId) ||
    !nonEmpty(event.messageId) ||
    !nonEmpty(event.threadId) ||
    !nonEmpty(event.channelId) ||
    !nonEmpty(event.connectedAccountId) ||
    !nonEmpty(event.from) ||
    !nonEmpty(event.to)
  )
    return hold('unavailable', 'UNKNOWN_EVENT_IDENTITY');
  if (!nonEmpty(event.creatorId))
    return hold('unavailable', 'UNKNOWN_CREATOR_IDENTITY');
  if (
    !event.wasInserted ||
    snapshot.existingWorkMessageIds.includes(event.messageId)
  )
    return hold('historical', 'DUPLICATE');
  if (event.importMode !== 'BACKFILL' && event.importMode !== 'LIVE')
    return hold('unavailable', 'UNKNOWN_IMPORT_MODE');
  const initialSyncCompleted = time(event.initialSyncCompletedAt);
  if (initialSyncCompleted === null)
    return hold('unavailable', 'UNKNOWN_INITIAL_SYNC_FRONTIER');
  const occurred = time(event.providerOccurredAt);
  const received = time(event.receivedAt);
  const persisted = time(event.firstPersistedAt);
  if (
    occurred === null ||
    received === null ||
    persisted === null ||
    occurred > persisted ||
    received > persisted
  )
    return hold('unavailable', 'UNKNOWN_EVENT_TIME');
  if (event.importMode === 'BACKFILL') return hold('historical', 'BACKFILL');

  // Inspect all exact conversation candidates BEFORE enablement, so a disabled
  // competing association can never make an enabled candidate appear unique.
  const routeBindings = snapshot.bindings.filter(
    (binding) =>
      binding.workspaceId === event.workspaceId &&
      binding.threadId === event.threadId &&
      binding.channelId === event.channelId &&
      binding.connectedAccountId === event.connectedAccountId &&
      binding.creatorId === event.creatorId &&
      binding.recipient === event.to &&
      binding.creatorSender === event.from,
  );
  if (
    routeBindings.some(
      (binding) => binding.messageId !== null && !nonEmpty(binding.messageId),
    )
  )
    return hold('unavailable', 'UNKNOWN_BINDING_IDENTITY');
  const candidates = routeBindings.filter(
    (binding) =>
      binding.messageId === null || binding.messageId === event.messageId,
  );
  if (candidates.length === 0) return hold('ambiguous', 'NO_EXACT_BINDING');
  // Validate EVERY route snapshot before de-duplication. An invalid or relinked
  // competitor cannot silently turn an ambiguous conversation into a winner.
  const eventMoments = [occurred, received, persisted];
  const eventTimeCandidates: typeof candidates = [];
  for (const candidate of candidates) {
    const start = time(candidate.establishedAt);
    const end = time(candidate.revokedAt);
    if (
      start === null ||
      !knownNullableTime(candidate.revokedAt) ||
      !knownNullableTime(candidate.deletedAt) ||
      (end !== null && end < start)
    )
      return hold('unavailable', 'UNKNOWN_BINDING_TIME');
    if (candidate.deletedAt !== null)
      return hold('unavailable', 'BINDING_REVOKED');
    if (eventMoments.some((moment) => moment < start)) continue;
    if (end !== null) {
      if (eventMoments.every((moment) => moment >= end)) continue;
      if (eventMoments.some((moment) => moment >= end))
        return hold('unavailable', 'UNKNOWN_BINDING_TIME');
    }
    eventTimeCandidates.push(candidate);
  }
  if (eventTimeCandidates.length === 0) {
    const allEstablishedLate = candidates.every((candidate) =>
      eventMoments.some((moment) => moment < time(candidate.establishedAt)!),
    );
    if (!allEstablishedLate) return hold('unavailable', 'BINDING_REVOKED');
    if (candidates.length === 1) {
      const matchingControls = snapshot.controls.filter(
        (control) =>
          control.workspaceId === event.workspaceId &&
          control.campaignId === candidates[0].campaignId,
      );
      if (matchingControls.length === 1) {
        const enabledAt = time(matchingControls[0].enabledAt);
        if (
          enabledAt !== null &&
          eventMoments.some((moment) => moment < enabledAt)
        )
          return hold('historical', 'BEFORE_ENABLEMENT');
      }
    }
    return hold('historical', 'BEFORE_BINDING');
  }
  if (eventTimeCandidates.length !== 1)
    return hold('ambiguous', 'CONFLICTING_CAMPAIGNS');
  const binding = eventTimeCandidates[0];
  const controls = snapshot.controls.filter(
    (control) =>
      control.workspaceId === event.workspaceId &&
      control.campaignId === binding.campaignId,
  );
  if (controls.length !== 1) return hold('unavailable', 'UNKNOWN_CONTROL');
  const control = controls[0];
  const enabled = time(control.enabledAt);
  if (
    !knownNullableTime(control.enabledAt) ||
    !knownNullableTime(control.disabledAt)
  )
    return hold('unavailable', 'UNKNOWN_CONTROL_TIME');
  if (!Array.isArray(snapshot.participationControls))
    return hold('unavailable', 'UNKNOWN_PARTICIPATION_CONTROL');
  const participationControls = snapshot.participationControls.filter(
    (participationControl) =>
      participationControl.workspaceId === event.workspaceId &&
      participationControl.campaignId === binding.campaignId &&
      participationControl.participationId === binding.participationId,
  );
  if (participationControls.length !== 1)
    return hold('unavailable', 'UNKNOWN_PARTICIPATION_CONTROL');
  const participationControl = participationControls[0];
  if (
    !Array.isArray(participationControl.pauses) ||
    participationControl.pauses.some(
      (pause) =>
        !pause ||
        time(pause.pausedAt) === null ||
        !knownNullableTime(pause.resumedAt) ||
        (pause.resumedAt !== null &&
          time(pause.resumedAt)! < time(pause.pausedAt)!),
    )
  )
    return hold('unavailable', 'UNKNOWN_PARTICIPATION_CONTROL_TIME');
  if (control.state === 'DISABLED')
    return hold('out-of-scope', 'CAMPAIGN_DISABLED');
  if (control.state !== 'ENABLED')
    return hold('unavailable', 'UNKNOWN_CONTROL');
  if (enabled === null || control.disabledAt !== null)
    return hold('unavailable', 'UNKNOWN_CONTROL_TIME');
  if (occurred < enabled || received < enabled || persisted < enabled)
    return hold('historical', 'BEFORE_ENABLEMENT');
  if (
    occurred <= initialSyncCompleted ||
    received <= initialSyncCompleted ||
    persisted <= initialSyncCompleted
  )
    return hold('historical', 'INITIAL_SYNC_PERIOD');
  const established = time(binding.establishedAt);
  if (
    established === null ||
    !knownNullableTime(binding.revokedAt) ||
    !knownNullableTime(binding.deletedAt)
  )
    return hold('unavailable', 'UNKNOWN_BINDING_TIME');
  if (
    established > occurred ||
    established > received ||
    established > persisted
  )
    return hold('historical', 'BEFORE_BINDING');
  if (binding.revokedAt !== null || binding.deletedAt !== null)
    return hold('unavailable', 'BINDING_REVOKED');
  if (
    participationControl.pauses.some((pause) => {
      const start = time(pause.pausedAt)!;
      const end = pause.resumedAt === null ? Infinity : time(pause.resumedAt)!;
      return [occurred, received, persisted].some(
        (moment) => moment >= start && moment < end,
      );
    })
  )
    return hold('historical', 'PAUSED_AT_EVENT');
  if (participationControl.pauses.some((pause) => pause.resumedAt === null))
    return hold('unavailable', 'CURRENTLY_PAUSED');

  const grants = snapshot.access.filter(
    (access) =>
      access.workspaceId === event.workspaceId &&
      access.participationId === binding.participationId,
  );
  if (
    grants.length !== 1 ||
    time(grants[0].grantedAt) === null ||
    !knownNullableTime(grants[0].revokedAt)
  )
    return hold('unavailable', 'UNKNOWN_ACCESS_TIME');
  if (grants[0].revokedAt !== null)
    return hold('unavailable', 'ACCESS_REVOKED');
  if (
    time(grants[0].grantedAt)! > occurred ||
    time(grants[0].grantedAt)! > received
  )
    return hold('historical', 'BEFORE_ACCESS');
  return {
    status: 'attributed',
    workspaceId: event.workspaceId,
    messageId: event.messageId,
    purpose: 'EMAIL_INBOUND_REPLY',
    participationId: binding.participationId,
    campaignId: binding.campaignId,
  };
};
