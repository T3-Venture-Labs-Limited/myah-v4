import { type CampaignSequenceMessage } from 'twenty-shared/workflow';

import {
  resolveCampaignSequenceThread,
  type SequenceSentEmailEvidence,
  type SequenceThreadInput,
} from 'src/modules/myah-outreach/utils/resolve-campaign-sequence-thread.util';

const IDS = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  campaignId: '20000000-0000-4000-8000-000000000002',
  campaignCreatorId: '30000000-0000-4000-8000-000000000003',
  enrollmentId: '40000000-0000-4000-8000-000000000004',
  workflowVersionId: '50000000-0000-4000-8000-000000000005',
  firstEmailId: '60000000-0000-4000-8000-000000000006',
  historicalEmailId: '70000000-0000-4000-8000-000000000007',
  currentEmailId: '80000000-0000-4000-8000-000000000008',
  connectedAccountId: '90000000-0000-4000-8000-000000000009',
  messageChannelId: 'a0000000-0000-4000-8000-00000000000a',
} as const;

const currentMessage: Extract<CampaignSequenceMessage, { channel: 'EMAIL' }> = {
  id: IDS.currentEmailId,
  channel: 'EMAIL',
  subject: 'Follow up',
  body: '{"type":"doc","content":[]}',
  files: [],
  replyToThread: true,
};

const makeEvidence = (
  overrides: Partial<SequenceSentEmailEvidence> = {},
): SequenceSentEmailEvidence => ({
  workspaceId: IDS.workspaceId,
  campaignId: IDS.campaignId,
  campaignCreatorId: IDS.campaignCreatorId,
  enrollmentId: IDS.enrollmentId,
  workflowVersionId: IDS.workflowVersionId,
  sequenceMessageId: IDS.firstEmailId,
  acceptedOrdinal: 1,
  state: 'SENT',
  receiptId: 'receipt-1',
  persistedMessageId: 'persisted-message-1',
  headerMessageId: '<message-1@example.com>',
  messageThreadId: 'message-thread-1',
  providerThreadExternalId: 'provider-thread-1',
  connectedAccountId: IDS.connectedAccountId,
  messageChannelId: IDS.messageChannelId,
  senderEmail: 'sender@example.com',
  ...overrides,
});

const makeInput = (
  overrides: Partial<SequenceThreadInput> = {},
): SequenceThreadInput => ({
  scope: {
    workspaceId: IDS.workspaceId,
    campaignId: IDS.campaignId,
    campaignCreatorId: IDS.campaignCreatorId,
    enrollmentId: IDS.enrollmentId,
  },
  message: currentMessage,
  precedingEmailMessageIds: [IDS.firstEmailId],
  historyReconciled: true,
  evidence: [makeEvidence()],
  currentSender: {
    connectedAccountId: IDS.connectedAccountId,
    messageChannelId: IDS.messageChannelId,
    senderEmail: 'sender@example.com',
  },
  ...overrides,
});

describe(resolveCampaignSequenceThread.name, () => {
  it('returns NEW_THREAD for explicit false intent before any history or evidence checks', () => {
    const result = resolveCampaignSequenceThread(
      makeInput({
        message: { ...currentMessage, replyToThread: false },
        historyReconciled: false,
        evidence: [
          {
            ...makeEvidence(),
            state: 'PROVIDER_ACCEPTED',
          } as unknown as SequenceSentEmailEvidence,
        ],
      }),
    );

    expect(result).toEqual({ kind: 'NEW_THREAD' });
  });

  it.each([
    [
      'missing',
      (({ replyToThread: _replyToThread, ...message }) => message)(
        currentMessage,
      ),
    ],
    ['undefined', { ...currentMessage, replyToThread: undefined }],
    ['null', { ...currentMessage, replyToThread: null }],
    ['zero', { ...currentMessage, replyToThread: 0 }],
    ['empty string', { ...currentMessage, replyToThread: '' }],
  ] as const)(
    'does not treat %s reply intent as explicit false',
    (_description, malformedMessage) => {
      expect(
        resolveCampaignSequenceThread(
          makeInput({
            message:
              malformedMessage as unknown as SequenceThreadInput['message'],
            historyReconciled: false,
          }),
        ),
      ).toEqual({ kind: 'HOLD', code: 'UNSAFE_HISTORY' });
    },
  );

  it('holds unreconciled stopped-edit history before selecting evidence', () => {
    expect(
      resolveCampaignSequenceThread(
        makeInput({ historyReconciled: false, evidence: [] }),
      ),
    ).toEqual({ kind: 'HOLD', code: 'UNSAFE_HISTORY' });
  });

  it('returns the matched immutable sent evidence', () => {
    const evidence = Object.freeze(makeEvidence());
    const input = Object.freeze(makeInput({ evidence: [evidence] }));

    const result = resolveCampaignSequenceThread(input);

    expect(result).toEqual({ kind: 'REPLY', evidence });
    if (result.kind === 'REPLY') {
      expect(result.evidence).toBe(evidence);
    }
  });

  it.each([
    ['workspaceId', 'other-workspace'],
    ['campaignId', 'other-campaign'],
    ['campaignCreatorId', 'other-campaign-creator'],
    ['enrollmentId', 'other-enrollment'],
  ] as const)(
    'does not qualify evidence from another %s',
    (scopeField, otherId) => {
      expect(
        resolveCampaignSequenceThread(
          makeInput({ evidence: [makeEvidence({ [scopeField]: otherId })] }),
        ),
      ).toEqual({ kind: 'HOLD', code: 'MISSING_THREAD' });
    },
  );

  it.each([
    'workspaceId',
    'campaignId',
    'campaignCreatorId',
    'enrollmentId',
  ] as const)(
    'holds when trusted scope identifier %s is blank',
    (scopeField) => {
      expect(
        resolveCampaignSequenceThread(
          makeInput({
            scope: { ...makeInput().scope, [scopeField]: '   ' },
            evidence: [makeEvidence({ [scopeField]: '   ' })],
          }),
        ),
      ).toEqual({ kind: 'HOLD', code: 'MISSING_THREAD' });
    },
  );

  it('uses stable reconciled preceding email IDs across Instagram, reorder, and removal history', () => {
    const first = makeEvidence({ acceptedOrdinal: 4 });
    const removedHistorical = makeEvidence({
      workflowVersionId: '50000000-0000-4000-8000-000000000015',
      sequenceMessageId: IDS.historicalEmailId,
      acceptedOrdinal: 7,
      receiptId: 'receipt-historical',
      persistedMessageId: 'persisted-message-historical',
      headerMessageId: '<historical@example.com>',
      messageThreadId: 'message-thread-historical',
      providerThreadExternalId: null,
    });
    const laterButNotPreceding = makeEvidence({
      sequenceMessageId: 'b0000000-0000-4000-8000-00000000000b',
      acceptedOrdinal: 99,
      receiptId: 'receipt-not-preceding',
      persistedMessageId: 'persisted-message-not-preceding',
      headerMessageId: '<not-preceding@example.com>',
      messageThreadId: 'message-thread-not-preceding',
    });

    const result = resolveCampaignSequenceThread(
      makeInput({
        // Trusted reconciliation excludes Instagram IDs while retaining stable IDs
        // from sent steps that were reordered or removed from the authored revision.
        precedingEmailMessageIds: [IDS.firstEmailId, IDS.historicalEmailId],
        evidence: [first, laterButNotPreceding, removedHistorical],
      }),
    );

    expect(result).toEqual({ kind: 'REPLY', evidence: removedHistorical });
  });

  it.each([
    ['has no evidence', []],
    [
      'has no evidence for an allowed preceding email',
      [
        makeEvidence({
          sequenceMessageId: 'b0000000-0000-4000-8000-00000000000b',
        }),
      ],
    ],
  ] as const)(
    'holds with MISSING_THREAD when it %s',
    (_description, evidence) => {
      expect(
        resolveCampaignSequenceThread(makeInput({ evidence: [...evidence] })),
      ).toEqual({ kind: 'HOLD', code: 'MISSING_THREAD' });
    },
  );

  it.each([
    'workflowVersionId',
    'sequenceMessageId',
    'receiptId',
    'persistedMessageId',
    'headerMessageId',
    'messageThreadId',
    'providerThreadExternalId',
  ] as const)('holds when proof identifier %s is blank', (field) => {
    const evidence = makeEvidence({ [field]: '   ' });
    const precedingEmailMessageIds =
      field === 'sequenceMessageId'
        ? [evidence.sequenceMessageId]
        : [IDS.firstEmailId];

    expect(
      resolveCampaignSequenceThread(
        makeInput({ evidence: [evidence], precedingEmailMessageIds }),
      ),
    ).toEqual({ kind: 'HOLD', code: 'MISSING_THREAD' });
  });

  it.each([
    ['connectedAccountId', 'other-account'],
    ['messageChannelId', 'other-channel'],
    ['senderEmail', 'other-sender@example.com'],
    ['senderEmail', '   '],
  ] as const)(
    'holds when original sender tuple field %s differs',
    (field, value) => {
      expect(
        resolveCampaignSequenceThread(
          makeInput({ evidence: [makeEvidence({ [field]: value })] }),
        ),
      ).toEqual({ kind: 'HOLD', code: 'SENDER_CHANGED' });
    },
  );

  it('selects the highest valid accepted ordinal among distinct earlier emails', () => {
    const lower = makeEvidence({ acceptedOrdinal: 3 });
    const higher = makeEvidence({
      sequenceMessageId: IDS.historicalEmailId,
      acceptedOrdinal: 12,
      receiptId: 'receipt-12',
      persistedMessageId: 'persisted-message-12',
      headerMessageId: '<message-12@example.com>',
      messageThreadId: 'message-thread-12',
      providerThreadExternalId: null,
    });

    const result = resolveCampaignSequenceThread(
      makeInput({
        precedingEmailMessageIds: [IDS.firstEmailId, IDS.historicalEmailId],
        evidence: [higher, lower],
      }),
    );

    expect(result).toEqual({ kind: 'REPLY', evidence: higher });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'holds ambiguous evidence with non-positive, non-finite, or non-integer ordinal %p',
    (acceptedOrdinal) => {
      expect(
        resolveCampaignSequenceThread(
          makeInput({ evidence: [makeEvidence({ acceptedOrdinal })] }),
        ),
      ).toEqual({ kind: 'HOLD', code: 'AMBIGUOUS_THREAD' });
    },
  );

  it('holds two distinct receipts for the same intended earlier send', () => {
    expect(
      resolveCampaignSequenceThread(
        makeInput({
          evidence: [
            makeEvidence(),
            makeEvidence({
              acceptedOrdinal: 2,
              receiptId: 'receipt-2',
              persistedMessageId: 'persisted-message-2',
              headerMessageId: '<message-2@example.com>',
            }),
          ],
        }),
      ),
    ).toEqual({ kind: 'HOLD', code: 'AMBIGUOUS_THREAD' });
  });

  it('holds competing proofs with the same accepted ordinal', () => {
    expect(
      resolveCampaignSequenceThread(
        makeInput({
          precedingEmailMessageIds: [IDS.firstEmailId, IDS.historicalEmailId],
          evidence: [
            makeEvidence(),
            makeEvidence({
              sequenceMessageId: IDS.historicalEmailId,
              receiptId: 'receipt-2',
              persistedMessageId: 'persisted-message-2',
              headerMessageId: '<message-2@example.com>',
            }),
          ],
        }),
      ),
    ).toEqual({ kind: 'HOLD', code: 'AMBIGUOUS_THREAD' });
  });

  it('deduplicates byte-identical repeated join rows with the same receipt ID', () => {
    const evidence = makeEvidence();
    const repeatedJoinRow = { ...evidence };

    const result = resolveCampaignSequenceThread(
      makeInput({ evidence: [evidence, repeatedJoinRow] }),
    );

    expect(result).toEqual({ kind: 'REPLY', evidence });
    if (result.kind === 'REPLY') {
      expect(result.evidence).toBe(evidence);
    }
  });

  it('holds the same receipt ID when duplicate rows conflict', () => {
    expect(
      resolveCampaignSequenceThread(
        makeInput({
          evidence: [
            makeEvidence(),
            makeEvidence({ headerMessageId: '<conflict@example.com>' }),
          ],
        }),
      ),
    ).toEqual({ kind: 'HOLD', code: 'AMBIGUOUS_THREAD' });
  });

  it('rejects non-SENT evidence at runtime even if an unsafe caller bypasses the type boundary', () => {
    const providerAccepted = {
      ...makeEvidence(),
      state: 'PROVIDER_ACCEPTED',
    } as unknown as SequenceSentEmailEvidence;

    expect(
      resolveCampaignSequenceThread(
        makeInput({ evidence: [providerAccepted] }),
      ),
    ).toEqual({ kind: 'HOLD', code: 'AMBIGUOUS_THREAD' });
  });
});
