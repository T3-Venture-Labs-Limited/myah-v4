import {
  decideCanonicalEmailReplyWork,
  type CanonicalEmailReplySnapshot,
} from '../decide-canonical-email-reply-work.util';

const at = (hour: number) =>
  new Date(`2026-09-24T${String(hour).padStart(2, '0')}:00:00.000Z`);
const base = (): CanonicalEmailReplySnapshot => ({
  event: {
    workspaceId: 'w',
    messageId: 'm1',
    threadId: 't',
    channelId: 'ch',
    connectedAccountId: 'a',
    from: 'creator@example.com',
    to: 'brand@example.com',
    creatorId: 'creator',
    direction: 'INCOMING',
    isDraft: false,
    importMode: 'LIVE',
    initialSyncCompletedAt: at(11),
    receivedAt: at(12),
    providerOccurredAt: at(12),
    firstPersistedAt: at(13),
    wasInserted: true,
  },
  controls: [
    {
      workspaceId: 'w',
      campaignId: 'c',
      state: 'ENABLED',
      enabledAt: at(10),
      disabledAt: null,
    },
  ],
  participationControls: [
    {
      workspaceId: 'w',
      campaignId: 'c',
      participationId: 'p',
      pauses: [],
    },
  ],
  bindings: [
    {
      workspaceId: 'w',
      campaignId: 'c',
      participationId: 'p',
      creatorId: 'creator',
      threadId: 't',
      channelId: 'ch',
      connectedAccountId: 'a',
      recipient: 'brand@example.com',
      creatorSender: 'creator@example.com',
      messageId: null,
      establishedAt: at(11),
      revokedAt: null,
      deletedAt: null,
    },
  ],
  access: [
    {
      workspaceId: 'w',
      participationId: 'p',
      grantedAt: at(10),
      revokedAt: null,
    },
  ],
  existingWorkMessageIds: [],
});
const decide = (
  change: (snapshot: CanonicalEmailReplySnapshot) => void = () => {},
) => {
  const snapshot = base();
  change(snapshot);
  return decideCanonicalEmailReplyWork(snapshot);
};
const attributed = {
  status: 'attributed',
  workspaceId: 'w',
  messageId: 'm1',
  purpose: 'EMAIL_INBOUND_REPLY',
  participationId: 'p',
  campaignId: 'c',
};

describe('canonical Email reply-work decision (pure, disconnected)', () => {
  it('returns one recoverable identity for the exact new inbound binding; later replies do not need active enrollment', () => {
    expect(decide()).toEqual(attributed);
    expect(
      decide((s) => {
        s.event.messageId = 'm2';
      }),
    ).toEqual({ ...attributed, messageId: 'm2' });
  });
  it('requires exact message scope while retaining conversation-wide subsequent replies', () => {
    expect(
      decide((s) => {
        s.bindings[0].messageId = 'm1';
      }),
    ).toEqual(attributed);
    expect(
      decide((s) => {
        s.event.messageId = 'm2';
        s.bindings[0].messageId = 'm1';
      }),
    ).toEqual({ status: 'ambiguous', reason: 'NO_EXACT_BINDING' });
    expect(
      decide((s) => {
        s.bindings[0].messageId = 'm1';
        s.bindings.push({
          ...s.bindings[0],
          campaignId: 'c2',
          participationId: 'p2',
          messageId: 'm2',
        });
        s.event.messageId = 'm2';
        s.controls.push({ ...s.controls[0], campaignId: 'c2' });
        s.participationControls.push({
          ...s.participationControls[0],
          campaignId: 'c2',
          participationId: 'p2',
        });
        s.access.push({ ...s.access[0], participationId: 'p2' });
      }),
    ).toEqual({
      ...attributed,
      messageId: 'm2',
      campaignId: 'c2',
      participationId: 'p2',
    });
  });
  it('resolves a revoked historical binding before uniqueness, not an overlapping pair', () => {
    expect(
      decide((s) => {
        s.bindings[0].revokedAt = new Date('2026-09-24T11:30:00.000Z');
        s.bindings.push({
          ...s.bindings[0],
          campaignId: 'c2',
          participationId: 'p2',
          establishedAt: new Date('2026-09-24T11:45:00.000Z'),
          revokedAt: null,
        });
        s.controls.push({ ...s.controls[0], campaignId: 'c2' });
        s.participationControls.push({
          ...s.participationControls[0],
          campaignId: 'c2',
          participationId: 'p2',
        });
        s.access.push({ ...s.access[0], participationId: 'p2' });
      }),
    ).toEqual({ ...attributed, campaignId: 'c2', participationId: 'p2' });
    expect(
      decide((s) => {
        s.bindings.push({
          ...s.bindings[0],
          campaignId: 'c2',
          participationId: 'p2',
          revokedAt: at(14),
        });
      }),
    ).toEqual({ status: 'ambiguous', reason: 'CONFLICTING_CAMPAIGNS' });
    expect(
      decide((s) => {
        s.bindings[0].revokedAt = at(14);
      }),
    ).toEqual({ status: 'unavailable', reason: 'BINDING_REVOKED' });
  });
  it('fails closed on corrupt binding timelines and relinked snapshots', () => {
    expect(
      decide((s) => {
        s.bindings[0].revokedAt = at(10);
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_BINDING_TIME' });
    expect(
      decide((s) => {
        s.bindings[0].revokedAt = new Date('2026-09-24T12:30:00.000Z');
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_BINDING_TIME' });
    expect(
      decide((s) => {
        s.bindings.push({
          ...s.bindings[0],
          campaignId: 'c2',
          participationId: 'p2',
          deletedAt: at(13),
        });
      }),
    ).toEqual({ status: 'unavailable', reason: 'BINDING_REVOKED' });
  });
  it('rejects duplicate canonical messages', () =>
    expect(
      decide((s) => {
        s.existingWorkMessageIds = ['m1'];
      }),
    ).toEqual({ status: 'historical', reason: 'DUPLICATE' }));
  it.each(['OUTGOING', 'UNKNOWN'] as const)('excludes %s', (direction) =>
    expect(
      decide((s) => {
        s.event.direction = direction;
      }),
    ).toEqual({ status: 'out-of-scope', reason: 'NOT_INBOUND' }),
  );
  it('never adopts post-enable BACKFILL or first-sync-period messages', () => {
    expect(
      decide((s) => {
        s.event.importMode = 'BACKFILL';
      }),
    ).toEqual({ status: 'historical', reason: 'BACKFILL' });
    expect(
      decide((s) => {
        s.event.initialSyncCompletedAt = at(12);
      }),
    ).toEqual({ status: 'historical', reason: 'INITIAL_SYNC_PERIOD' });
    expect(
      decide((s) => {
        s.event.initialSyncCompletedAt = at(13);
      }),
    ).toEqual({ status: 'historical', reason: 'INITIAL_SYNC_PERIOD' });
  });
  it('fails closed without a durable initial completed-sync frontier, not latest syncedAt', () => {
    expect(
      decide((s) => {
        s.event.initialSyncCompletedAt = null;
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'UNKNOWN_INITIAL_SYNC_FRONTIER',
    });
    expect(
      decide((s) => {
        s.event.importMode = undefined as never;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_IMPORT_MODE' });
  });
  it('treats LIVE delayed pre-enable arrival as historical independent of source mode', () => {
    expect(
      decide((s) => {
        s.event.receivedAt = at(9);
        s.event.providerOccurredAt = at(9);
      }),
    ).toEqual({ status: 'historical', reason: 'BEFORE_ENABLEMENT' });
    expect(
      decide((s) => {
        s.event.providerOccurredAt = at(9);
      }),
    ).toEqual({ status: 'historical', reason: 'BEFORE_ENABLEMENT' });
    expect(
      decide((s) => {
        s.event.providerOccurredAt = at(9);
        s.event.receivedAt = at(9);
        s.event.firstPersistedAt = at(9);
      }),
    ).toEqual({ status: 'historical', reason: 'BEFORE_ENABLEMENT' });
  });
  it('fails closed on unknown event/control/binding/revocation times', () => {
    expect(
      decide((s) => {
        s.event.providerOccurredAt = null;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_EVENT_TIME' });
    expect(
      decide((s) => {
        s.controls[0].enabledAt = null;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_CONTROL_TIME' });
    expect(
      decide((s) => {
        s.bindings[0].establishedAt = null;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_BINDING_TIME' });
    expect(
      decide((s) => {
        s.access[0].grantedAt = null;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_ACCESS_TIME' });
    expect(
      decide((s) => {
        s.bindings[0].revokedAt = undefined as never;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_BINDING_TIME' });
    expect(
      decide((s) => {
        s.bindings[0].messageId = undefined as never;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_BINDING_IDENTITY' });
  });
  it('cannot retroactively adopt an event through a late binding or late access grant', () => {
    expect(
      decide((s) => {
        s.bindings[0].establishedAt = at(13);
      }),
    ).toEqual({ status: 'historical', reason: 'BEFORE_BINDING' });
    expect(
      decide((s) => {
        s.access[0].grantedAt = at(13);
      }),
    ).toEqual({ status: 'historical', reason: 'BEFORE_ACCESS' });
  });
  it('does not infer attribution from membership or a legacy thread campaign hint', () =>
    expect(
      decide((s) => {
        s.bindings = [];
      }),
    ).toEqual({ status: 'ambiguous', reason: 'NO_EXACT_BINDING' }));
  it('retains a conflict even when the competing Campaign is disabled', () => {
    expect(
      decide((s) => {
        s.bindings.push({
          ...s.bindings[0],
          campaignId: 'c2',
          participationId: 'p2',
        });
        s.controls.push({
          ...s.controls[0],
          campaignId: 'c2',
          state: 'DISABLED',
          disabledAt: at(13),
        });
      }),
    ).toEqual({ status: 'ambiguous', reason: 'CONFLICTING_CAMPAIGNS' });
  });
  it('requires authoritative sender Creator identity and the exact bound Creator', () => {
    expect(
      decide((s) => {
        s.event.creatorId = null;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_CREATOR_IDENTITY' });
    expect(
      decide((s) => {
        s.event.creatorId = 'another-creator';
      }),
    ).toEqual({ status: 'ambiguous', reason: 'NO_EXACT_BINDING' });
    expect(
      decide((s) => {
        s.bindings[0].creatorId = 'another-creator';
      }),
    ).toEqual({ status: 'ambiguous', reason: 'NO_EXACT_BINDING' });
  });
  it('does not alias case-different mailbox local parts', () => {
    expect(
      decide((s) => {
        s.event.from = 'Creator@example.com';
      }),
    ).toEqual({ status: 'ambiguous', reason: 'NO_EXACT_BINDING' });
    expect(
      decide((s) => {
        s.event.to = 'Brand@example.com';
      }),
    ).toEqual({ status: 'ambiguous', reason: 'NO_EXACT_BINDING' });
  });
  it.each([
    'workspaceId',
    'channelId',
    'connectedAccountId',
    'recipient',
    'creatorSender',
    'threadId',
  ] as const)('rejects a wrong %s', (key) =>
    expect(
      decide((s) => {
        (s.bindings[0] as unknown as Record<string, unknown>)[key] = 'wrong';
      }),
    ).toEqual({ status: 'ambiguous', reason: 'NO_EXACT_BINDING' }),
  );
  it('rejects deleted/relinked or revoked bindings and revoked access', () => {
    expect(
      decide((s) => {
        s.bindings[0].deletedAt = at(13);
      }),
    ).toEqual({ status: 'unavailable', reason: 'BINDING_REVOKED' });
    expect(
      decide((s) => {
        s.bindings[0].revokedAt = at(13);
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_BINDING_TIME' });
    expect(
      decide((s) => {
        s.access[0].revokedAt = at(13);
      }),
    ).toEqual({ status: 'unavailable', reason: 'ACCESS_REVOKED' });
  });
  it('never infers enablement from binding or participation when Campaign control is missing', () => {
    expect(
      decide((s) => {
        s.controls = [];
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'UNKNOWN_CONTROL',
    });
  });
  it('treats a never-enabled disabled Campaign as disabled, not an invented enablement epoch', () => {
    expect(
      decide((s) => {
        s.controls[0].state = 'DISABLED';
        s.controls[0].enabledAt = null;
        s.controls[0].disabledAt = at(13);
      }),
    ).toEqual({ status: 'out-of-scope', reason: 'CAMPAIGN_DISABLED' });
    expect(
      decide((s) => {
        s.controls[0].enabledAt = null;
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_CONTROL_TIME' });
    expect(
      decide((s) => {
        s.controls[0].state = 'DISABLED';
        s.controls[0].enabledAt = new Date('invalid');
      }),
    ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_CONTROL_TIME' });
  });
  it('fails closed on unknown Campaign states', () => {
    for (const state of ['PAUSED', undefined, null]) {
      expect(
        decide((s) => {
          s.controls[0].state = state as never;
        }),
      ).toEqual({ status: 'unavailable', reason: 'UNKNOWN_CONTROL' });
    }
  });
  it('blocks disabled Campaigns, selected participation pauses, historical pauses, and re-enablement races', () => {
    expect(
      decide((s) => {
        s.controls[0].state = 'DISABLED';
        s.controls[0].disabledAt = at(13);
      }),
    ).toEqual({ status: 'out-of-scope', reason: 'CAMPAIGN_DISABLED' });
    expect(
      decide((s) => {
        s.participationControls[0].pauses = [
          { pausedAt: at(11), resumedAt: null },
        ];
      }),
    ).toEqual({ status: 'historical', reason: 'PAUSED_AT_EVENT' });
    expect(
      decide((s) => {
        s.participationControls[0].pauses = [
          { pausedAt: at(11), resumedAt: at(13) },
        ];
      }),
    ).toEqual({ status: 'historical', reason: 'PAUSED_AT_EVENT' });
    expect(
      decide((s) => {
        s.controls[0].enabledAt = at(14);
      }),
    ).toEqual({ status: 'historical', reason: 'BEFORE_ENABLEMENT' });
    expect(
      decide((s) => {
        s.participationControls[0].pauses = [
          { pausedAt: at(14), resumedAt: null },
        ];
      }),
    ).toEqual({ status: 'unavailable', reason: 'CURRENTLY_PAUSED' });
  });
  it('does not transfer a pause to another exact bound participation in the same Campaign', () => {
    const snapshot = base();
    snapshot.participationControls[0].pauses = [
      { pausedAt: at(11), resumedAt: null },
    ];
    snapshot.bindings.push({
      ...snapshot.bindings[0],
      participationId: 'p2',
      threadId: 't2',
    });
    snapshot.participationControls.push({
      ...snapshot.participationControls[0],
      participationId: 'p2',
      pauses: [],
    });
    snapshot.access.push({ ...snapshot.access[0], participationId: 'p2' });
    expect(decideCanonicalEmailReplyWork(snapshot)).toEqual({
      status: 'historical',
      reason: 'PAUSED_AT_EVENT',
    });
    snapshot.event.threadId = 't2';
    expect(decideCanonicalEmailReplyWork(snapshot)).toEqual({
      ...attributed,
      participationId: 'p2',
    });
  });
  it('fails closed without exactly one authoritative control for the selected participation', () => {
    expect(
      decide((s) => {
        s.participationControls = [];
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'UNKNOWN_PARTICIPATION_CONTROL',
    });
    expect(
      decide((s) => {
        s.participationControls = undefined as never;
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'UNKNOWN_PARTICIPATION_CONTROL',
    });
    expect(
      decide((s) => {
        s.participationControls.push({ ...s.participationControls[0] });
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'UNKNOWN_PARTICIPATION_CONTROL',
    });
    for (const key of [
      'workspaceId',
      'campaignId',
      'participationId',
    ] as const) {
      expect(
        decide((s) => {
          s.participationControls[0][key] = 'other';
        }),
      ).toEqual({
        status: 'unavailable',
        reason: 'UNKNOWN_PARTICIPATION_CONTROL',
      });
    }
  });
  it('rejects malformed selected pause timestamps rather than granting eligibility', () => {
    for (const pause of [
      { pausedAt: null, resumedAt: null },
      { pausedAt: new Date('invalid'), resumedAt: null },
      { pausedAt: at(11), resumedAt: undefined as never },
      { pausedAt: at(11), resumedAt: new Date('invalid') },
      { pausedAt: at(14), resumedAt: at(13) },
    ]) {
      expect(
        decide((s) => {
          s.participationControls[0].pauses = [pause];
        }),
      ).toEqual({
        status: 'unavailable',
        reason: 'UNKNOWN_PARTICIPATION_CONTROL_TIME',
      });
    }
  });
  it('is a decision only: no callbacks, service imports or legacy writes', () => {
    const snapshot = base();
    const original = structuredClone(snapshot);
    expect(decideCanonicalEmailReplyWork(snapshot)).toEqual(attributed);
    expect(snapshot).toEqual(original);
  });
});
