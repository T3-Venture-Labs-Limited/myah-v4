import { CampaignProgressionHistoryReaderAdapter } from 'src/modules/campaign-execution/adapters/campaign-progression-history-reader.adapter';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  campaignId: '22222222-2222-4222-8222-222222222222',
  creatorId: '33333333-3333-4333-8333-333333333333',
  workflowVersionId: '44444444-4444-4444-8444-444444444444',
  enrollmentId: '55555555-5555-4555-8555-555555555555',
  authorizationId: '66666666-6666-4666-8666-666666666666',
  occurrenceId: '77777777-7777-4777-8777-777777777777',
  messageId: '88888888-8888-4888-8888-888888888888',
  attemptId: '99999999-9999-4999-8999-999999999999',
  connectedAccountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  messageChannelId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

const supersessionScope = {
  workspaceId: ids.workspaceId,
  campaignId: ids.campaignId,
  targetWorkflowVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

const baseRow = {
  ...ids,
  authorizationGeneration: 1,
  campaignCreatorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  authoredMessageCount: 1,
  nextAuthoredMessageIndex: 0,
  enrollmentState: 'ACTIVE',
  enrollmentHoldReason: null,
  enrollmentTerminalReason: null,
  enrollmentTerminalAt: null,
  authoredMessageIndex: 0,
  occurrenceHoldReason: null,
  dueAt: new Date('2026-01-01T09:00:00Z'),
  attemptWorkspaceId: ids.workspaceId,
  attemptCampaignId: ids.campaignId,
  attemptEnrollmentId: ids.enrollmentId,
  attemptAuthorizationId: ids.authorizationId,
  attemptWorkflowVersionId: ids.workflowVersionId,
  attemptMessageId: ids.messageId,
  source: 'CAMPAIGN_SEQUENCE',
  selectionConstraintKind: 'ROTATE',
  priorAcceptedEvidenceId: null,
  senderPoolFingerprint: 'b'.repeat(64),
  localDate: '2026-01-01',
  claimedAt: new Date('2026-01-01T09:00:00Z'),
  slotAt: new Date('2026-01-01T09:00:00Z'),
  unknownAfter: new Date('2026-01-01T09:01:00Z'),
  attemptNumber: 1,
  renderDigest: 'c'.repeat(64),
  testPreparationProofId: null,
  requesterUserWorkspaceId: null,
  previewDigest: null,
  testTransportDigest: null,
  directReservationCapabilityId: null,
  projectedMessageId: null,
};

const managerWithRows = (rows: unknown[]) => {
  const manager = {} as any;
  manager.queryRunner = {
    manager,
    isTransactionActive: true,
    isReleased: false,
    query: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(rows),
  };
  return manager;
};

const validTerminalAttemptRow = (overrides: Record<string, unknown> = {}) => ({
  ...baseRow,
  attemptWorkspaceId: ids.workspaceId,
  attemptCampaignId: ids.campaignId,
  attemptEnrollmentId: ids.enrollmentId,
  attemptAuthorizationId: ids.authorizationId,
  attemptWorkflowVersionId: ids.workflowVersionId,
  attemptMessageId: ids.messageId,
  occurrenceState: 'CANCELLED',
  terminalReason: 'CAMPAIGN_PAUSED',
  terminalAt: new Date('2026-01-01T10:00:00Z'),
  attemptState: 'DEFINITELY_UNACCEPTED',
  capacityState: 'RELEASED',
  provider: 'google',
  normalizedSenderHandle: 'sender@example.com',
  normalizedRecipient: 'creator@example.com',
  providerMessageId: null,
  providerAcceptedAt: null,
  finalEvidenceDigest: 'd'.repeat(64),
  safeOutcomeReason: 'DEFINITELY_UNACCEPTED_NON_RETRYABLE',
  retryable: false,
  ...overrides,
});

const read = (rows: unknown[]) =>
  new CampaignProgressionHistoryReaderAdapter().readSameWorkflowVersionHistoryInTransaction(
    ids,
    managerWithRows(rows),
  );

const preflight = (rows: unknown[]) =>
  new CampaignProgressionHistoryReaderAdapter().preflightSameWorkflowVersionHistoryInTransaction(
    {
      workspaceId: ids.workspaceId,
      campaignId: ids.campaignId,
      workflowVersionId: ids.workflowVersionId,
    },
    managerWithRows(rows),
  );

describe('CampaignProgressionHistoryReaderAdapter', () => {
  it('locks and supersedes exhaustive pending prior-version history', async () => {
    const manager = {} as any;
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: ids.occurrenceId,
          enrollmentId: ids.enrollmentId,
          authorizationId: ids.authorizationId,
          workflowVersionId: ids.workflowVersionId,
          messageId: ids.messageId,
          authoredMessageIndex: 0,
          authoredMessageCount: 1,
          dueAt: new Date('2026-01-01T09:00:00Z'),
          state: 'PENDING',
          holdReason: null,
          terminalReason: null,
          terminalAt: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ids.occurrenceId }]);
    manager.queryRunner = {
      manager,
      isTransactionActive: true,
      isReleased: false,
      query,
    };
    const adapter = new CampaignProgressionHistoryReaderAdapter();
    const prepared = await adapter.preparePriorVersionSupersessionInTransaction(
      supersessionScope,
      manager,
    );
    expect(prepared).toEqual({
      status: 'READY',
      pendingOccurrenceIds: [ids.occurrenceId],
    });
    if (prepared.status !== 'READY') throw new Error('expected ready');
    await adapter.applyPriorVersionSupersessionInTransaction(
      {
        ...supersessionScope,
        pendingOccurrenceIds: prepared.pendingOccurrenceIds,
      },
      manager,
    );
    expect(query.mock.calls[0][0]).toContain('ORDER BY o.id');
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF o');
    expect(query.mock.calls[0][0]).toContain('"workflowVersionId" <> $3');
    expect(query.mock.calls[2][0]).toContain('SUPERSEDED_BY_WORKFLOW_VERSION');
  });

  it.each([
    {
      state: 'PENDING',
      holdReason: null,
      terminalReason: null,
      terminalAt: null,
    },
    {
      state: 'CANCELLED',
      holdReason: null,
      terminalReason: 'SUPERSEDED_BY_WORKFLOW_VERSION',
      terminalAt: new Date('2026-01-01T09:01:00Z'),
    },
  ])('blocks malformed out-of-range $state prior history', async (shape) => {
    const manager = {} as any;
    manager.queryRunner = {
      manager,
      isTransactionActive: true,
      isReleased: false,
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: ids.occurrenceId,
            enrollmentId: ids.enrollmentId,
            authorizationId: ids.authorizationId,
            workflowVersionId: ids.workflowVersionId,
            messageId: ids.messageId,
            authoredMessageIndex: 1,
            authoredMessageCount: 1,
            dueAt: new Date('2026-01-01T09:00:00Z'),
            ...shape,
          },
        ])
        .mockResolvedValueOnce([]),
    };

    await expect(
      new CampaignProgressionHistoryReaderAdapter().preparePriorVersionSupersessionInTransaction(
        supersessionScope,
        manager,
      ),
    ).resolves.toEqual({ status: 'BLOCKED' });
  });

  it('throws on a post-supersession CAS mismatch so the outer transaction rolls back', async () => {
    const manager = {} as any;
    manager.queryRunner = {
      manager,
      isTransactionActive: true,
      isReleased: false,
      query: jest.fn().mockResolvedValue([]),
    };
    await expect(
      new CampaignProgressionHistoryReaderAdapter().applyPriorVersionSupersessionInTransaction(
        { ...supersessionScope, pendingOccurrenceIds: [ids.occurrenceId] },
        manager,
      ),
    ).rejects.toThrow('compare-and-set failed');
  });

  it('blocks supersession when any attempt exists', async () => {
    const manager = {} as any;
    manager.queryRunner = {
      manager,
      isTransactionActive: true,
      isReleased: false,
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ attemptId: ids.attemptId }]),
    };
    await expect(
      new CampaignProgressionHistoryReaderAdapter().preparePriorVersionSupersessionInTransaction(
        supersessionScope,
        manager,
      ),
    ).resolves.toEqual({ status: 'BLOCKED' });
  });

  it('maps exhaustively valid accepted evidence and preserves its timestamp anchor', async () => {
    await expect(
      read([
        {
          ...baseRow,
          occurrenceState: 'SUCCEEDED',
          terminalReason: 'PROVIDER_ACCEPTED',
          terminalAt: new Date('2026-01-01T10:00:00Z'),
          attemptState: 'ACCEPTED',
          capacityState: 'CONSUMED',
          provider: 'google',
          normalizedSenderHandle: 'sender@example.com',
          normalizedRecipient: 'creator@example.com',
          providerMessageId: 'provider-id',
          providerAcceptedAt: new Date('2026-01-01T10:00:00Z'),
          finalEvidenceDigest: 'a'.repeat(64),
          safeOutcomeReason: null,
          retryable: false,
        },
      ]),
    ).resolves.toMatchObject({
      status: 'COMPLETE',
      lastProviderAcceptedAt: '2026-01-01T10:00:00.000Z',
      entries: [
        {
          kind: 'ACCEPTED',
          attemptId: ids.attemptId,
          acceptedEvidenceId: ids.attemptId,
        },
      ],
    });
  });

  it('fails closed for an unresolved attempt', async () => {
    await expect(
      read([
        {
          ...baseRow,
          occurrenceState: 'IN_FLIGHT',
          terminalReason: null,
          terminalAt: null,
          attemptState: 'PROCESSING',
          capacityState: 'RESERVED',
          provider: 'google',
          normalizedSenderHandle: 'sender@example.com',
          normalizedRecipient: 'creator@example.com',
          providerMessageId: null,
          providerAcceptedAt: null,
          finalEvidenceDigest: 'd'.repeat(64),
          safeOutcomeReason: null,
          retryable: null,
        },
      ]),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'UNRESOLVED_HISTORY' });
  });

  it('rejects an occurrence index equal to its enrollment message count', async () => {
    await expect(
      read([
        {
          ...baseRow,
          attemptId: null,
          authoredMessageIndex: 1,
          occurrenceState: 'PENDING',
          terminalReason: null,
          terminalAt: null,
        },
      ]),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'MALFORMED_HISTORY' });
  });

  it('rejects a blank ACTIVE enrollment hold reason', async () => {
    await expect(
      read([
        {
          ...baseRow,
          attemptId: null,
          enrollmentHoldReason: '   ',
          occurrenceState: 'PENDING',
          terminalReason: null,
          terminalAt: null,
        },
      ]),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'MALFORMED_HISTORY' });
  });

  it.each(['PENDING_FIRST', 'UNKNOWN_FIRST'])(
    'gives UNKNOWN_OUTCOME precedence over unresolved history regardless of row order (%s)',
    async (order) => {
      const pending = {
        ...baseRow,
        attemptId: null,
        authoredMessageCount: 2,
        occurrenceState: 'PENDING',
        terminalReason: null,
        terminalAt: null,
      };
      const unknown = {
        ...pending,
        occurrenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        messageId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        authoredMessageIndex: 1,
        occurrenceState: 'UNKNOWN',
      };

      await expect(
        read(
          order === 'PENDING_FIRST' ? [pending, unknown] : [unknown, pending],
        ),
      ).resolves.toEqual({ status: 'BLOCKED', reason: 'UNKNOWN_OUTCOME' });
    },
  );

  it.each(['PENDING_FIRST', 'UNKNOWN_FIRST'])(
    'gives UNKNOWN_OUTCOME precedence over same-message ambiguity regardless of row order (%s)',
    async (order) => {
      const pending = {
        ...baseRow,
        attemptId: null,
        occurrenceState: 'PENDING',
        terminalReason: null,
        terminalAt: null,
      };
      const unknown = {
        ...pending,
        occurrenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        occurrenceState: 'UNKNOWN',
      };

      await expect(
        read(
          order === 'PENDING_FIRST' ? [pending, unknown] : [unknown, pending],
        ),
      ).resolves.toEqual({ status: 'BLOCKED', reason: 'UNKNOWN_OUTCOME' });
    },
  );

  it.each([
    ['null workflow version', { attemptWorkflowVersionId: null }],
    [
      'mismatched workflow version',
      { attemptWorkflowVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    ],
    ['null workspace', { attemptWorkspaceId: null }],
    [
      'mismatched campaign',
      { attemptCampaignId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    ],
    ['null enrollment', { attemptEnrollmentId: null }],
    [
      'mismatched authorization',
      { attemptAuthorizationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    ],
    ['null message', { attemptMessageId: null }],
  ])(
    'rejects an attached attempt with a %s binding',
    async (_label, binding) => {
      await expect(
        preflight([validTerminalAttemptRow(binding)]),
      ).resolves.toEqual({ status: 'BLOCKED', reason: 'MALFORMED_HISTORY' });
    },
  );

  it('discovers attached attempts by occurrence before trusting duplicated bindings', async () => {
    const manager = managerWithRows([]);

    await new CampaignProgressionHistoryReaderAdapter().preflightSameWorkflowVersionHistoryInTransaction(
      {
        workspaceId: ids.workspaceId,
        campaignId: ids.campaignId,
        workflowVersionId: ids.workflowVersionId,
      },
      manager,
    );

    const orphanQuery = manager.queryRunner.query.mock.calls[0][0];
    const attachedQuery = manager.queryRunner.query.mock.calls[1][0];
    expect(orphanQuery).toContain('a."workflowVersionId" = $3');
    expect(attachedQuery).toContain('a."occurrenceId" = o.id');
    expect(attachedQuery).not.toContain(
      'a."workflowVersionId" = o."workflowVersionId"',
    );
    expect(attachedQuery).not.toContain('a."workspaceId" = e."workspaceId"');
  });

  it('keeps target-version attempts without valid companions malformed', async () => {
    const manager = {} as any;
    manager.queryRunner = {
      manager,
      isTransactionActive: true,
      isReleased: false,
      query: jest.fn().mockResolvedValueOnce([{ attemptId: ids.attemptId }]),
    };

    await expect(
      new CampaignProgressionHistoryReaderAdapter().preflightSameWorkflowVersionHistoryInTransaction(
        {
          workspaceId: ids.workspaceId,
          campaignId: ids.campaignId,
          workflowVersionId: ids.workflowVersionId,
        },
        manager,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'MALFORMED_HISTORY' });
  });

  it('deduplicates a valid attempt by exact identity', async () => {
    const row = validTerminalAttemptRow({
      occurrenceState: 'SUCCEEDED',
      terminalReason: 'PROVIDER_ACCEPTED',
      attemptState: 'ACCEPTED',
      capacityState: 'CONSUMED',
      providerMessageId: 'provider-id',
      providerAcceptedAt: new Date('2026-01-01T10:00:00Z'),
      safeOutcomeReason: null,
    });

    await expect(read([row, row])).resolves.toMatchObject({
      status: 'COMPLETE',
      entries: [{ kind: 'ACCEPTED', attemptId: ids.attemptId }],
    });
  });

  it('preflights historical creators omitted from current eligibility', async () => {
    await expect(
      preflight([
        {
          ...baseRow,
          attemptId: null,
          occurrenceState: 'CANCELLED',
          terminalReason: 'CAMPAIGN_PAUSED',
          terminalAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          ...baseRow,
          creatorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          campaignCreatorId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          enrollmentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          attemptEnrollmentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          occurrenceId: '12121212-1212-4212-8212-121212121212',
          attemptId: '13131313-1313-4313-8313-131313131313',
          occurrenceState: 'IN_FLIGHT',
          terminalReason: null,
          terminalAt: null,
          attemptState: 'RESERVED',
          capacityState: 'RESERVED',
          provider: 'google',
          normalizedSenderHandle: 'sender@example.com',
          normalizedRecipient: 'omitted@example.com',
          providerMessageId: null,
          providerAcceptedAt: null,
          finalEvidenceDigest: null,
          safeOutcomeReason: null,
          retryable: null,
        },
      ]),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'UNRESOLVED_HISTORY' });
  });

  it('partitions normal message/index reuse by immutable creator identity', async () => {
    const terminal = {
      ...baseRow,
      attemptId: null,
      occurrenceState: 'CANCELLED',
      terminalReason: 'CAMPAIGN_PAUSED',
      terminalAt: new Date('2026-01-01T10:00:00Z'),
    };

    await expect(
      preflight([
        terminal,
        {
          ...terminal,
          creatorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          campaignCreatorId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          enrollmentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          authorizationId: '12121212-1212-4212-8212-121212121212',
          occurrenceId: '13131313-1313-4313-8313-131313131313',
        },
      ]),
    ).resolves.toEqual({ status: 'COMPLETE' });
  });

  it.each([
    [
      'MALFORMED_HISTORY',
      { attemptId: null, occurrenceId: 'invalid', occurrenceState: 'PENDING' },
    ],
    ['UNKNOWN_OUTCOME', { attemptId: null, occurrenceState: 'UNKNOWN' }],
    [
      'UNRECONCILED_HISTORY',
      {
        attemptId: null,
        occurrenceState: 'SUCCEEDED',
        terminalReason: 'PROVIDER_ACCEPTED',
        terminalAt: new Date('2026-01-01T10:00:00Z'),
      },
    ],
    ['UNRESOLVED_HISTORY', { attemptId: null, occurrenceState: 'PENDING' }],
  ] as const)(
    'preflight returns %s without entries for blocked version history',
    async (reason, overrides) => {
      await expect(
        preflight([
          {
            ...baseRow,
            terminalReason: null,
            terminalAt: null,
            ...overrides,
          },
        ]),
      ).resolves.toEqual({ status: 'BLOCKED', reason });
    },
  );

  it('preflight preserves blocker precedence across creators', async () => {
    await expect(
      preflight([
        {
          ...baseRow,
          attemptId: null,
          occurrenceState: 'PENDING',
          terminalReason: null,
          terminalAt: null,
        },
        {
          ...baseRow,
          creatorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          campaignCreatorId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          enrollmentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          occurrenceId: 'invalid',
          attemptId: null,
          occurrenceState: 'PENDING',
          terminalReason: null,
          terminalAt: null,
        },
      ]),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'MALFORMED_HISTORY' });
  });

  it('rejects malformed accepted and definitely-unaccepted terminal combinations', async () => {
    await expect(
      read([
        {
          ...baseRow,
          occurrenceState: 'SUCCEEDED',
          terminalReason: 'PROVIDER_ACCEPTED',
          terminalAt: new Date('2026-01-01T10:00:00Z'),
          attemptState: 'ACCEPTED',
          capacityState: 'CONSUMED',
          provider: 'Google',
          normalizedSenderHandle: 'sender@example.com',
          normalizedRecipient: 'creator@example.com',
          providerMessageId: 'provider-id',
          providerAcceptedAt: new Date('2026-01-01T10:00:00Z'),
          finalEvidenceDigest: 'invalid',
          safeOutcomeReason: null,
          retryable: false,
        },
      ]),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'MALFORMED_HISTORY' });

    await expect(
      read([
        {
          ...baseRow,
          occurrenceState: 'SKIPPED',
          terminalReason: 'UNAVAILABLE',
          terminalAt: new Date('2026-01-01T10:00:00Z'),
          attemptState: 'DEFINITELY_UNACCEPTED',
          capacityState: 'RELEASED',
          provider: 'google',
          normalizedSenderHandle: 'sender@example.com',
          normalizedRecipient: 'creator@example.com',
          providerMessageId: 'must-be-null',
          providerAcceptedAt: null,
          finalEvidenceDigest: 'd'.repeat(64),
          safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
          retryable: true,
        },
      ]),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'MALFORMED_HISTORY' });
  });
});
