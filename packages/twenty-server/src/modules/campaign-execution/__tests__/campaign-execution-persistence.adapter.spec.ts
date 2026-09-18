import { CampaignExecutionPersistenceAdapter } from 'src/modules/campaign-execution/adapters/campaign-execution-persistence.adapter';
import { type CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';

const harness = (results: unknown[]) => {
  const manager = {} as any;
  const query = jest.fn();

  for (const result of results) query.mockResolvedValueOnce(result);
  manager.queryRunner = {
    manager,
    query,
    isTransactionActive: true,
    isReleased: false,
  };

  return {
    query,
    context: {
      manager,
      workspaceId,
      campaignId,
      schemaName: 'workspace_test',
    } as any,
  };
};

const executionRow = {
  id: executionId,
  workspaceId,
  campaignId,
  timeZone: 'UTC',
  startLocalTime: '08:00:00',
  endLocalTime: '16:00:00',
  campaignCapacityTimeZone: 'UTC',
};

const authorizationId = '44444444-4444-4444-8444-444444444444';
const enrollmentId = '55555555-5555-4555-8555-555555555555';
const occurrenceId = '66666666-6666-4666-8666-666666666666';
const heldOccurrenceId = '77777777-7777-4777-8777-777777777777';
const workflowVersionId = '88888888-8888-4888-8888-888888888888';
const messageId = '99999999-9999-4999-8999-999999999999';

const occurrenceRow = (overrides: Record<string, unknown> = {}) => ({
  id: occurrenceId,
  workspaceId,
  campaignId,
  enrollmentId,
  workflowVersionId,
  messageId,
  authoredMessageIndex: 0,
  dueAt: '2026-09-20T10:00:00.000Z',
  state: 'PENDING',
  holdReason: null,
  terminalReason: null,
  terminalAt: null,
  authorizationId,
  authoredMessageCount: 1,
  enrollmentState: 'ACTIVE',
  enrollmentHoldReason: null,
  enrollmentTerminalReason: null,
  enrollmentTerminalAt: null,
  ...overrides,
});

const definitiveAttemptRow = (overrides: Record<string, unknown> = {}) => ({
  source: 'CAMPAIGN_SEQUENCE',
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  attemptState: 'DEFINITELY_UNACCEPTED',
  capacityState: 'RELEASED',
  workspaceId,
  campaignId,
  enrollmentId,
  occurrenceId,
  authorizationId,
  workflowVersionId,
  messageId,
  connectedAccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  messageChannelId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  provider: 'google',
  normalizedSenderHandle: 'sender@example.com',
  normalizedRecipient: 'recipient@example.com',
  selectionConstraintKind: 'ROTATE',
  priorAcceptedEvidenceId: null,
  senderPoolFingerprint: 'a'.repeat(64),
  localDate: '2026-09-20',
  claimedAt: '2026-09-20T10:00:00.000Z',
  slotAt: '2026-09-20T10:00:00.000Z',
  unknownAfter: '2026-09-20T10:01:00.000Z',
  attemptNumber: 1,
  renderDigest: 'b'.repeat(64),
  testPreparationProofId: null,
  requesterUserWorkspaceId: null,
  previewDigest: null,
  testTransportDigest: null,
  directReservationCapabilityId: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  providerHeaderMessageId: null,
  providerMessageExternalId: null,
  reconciledProviderHeaderMessageId: null,
  providerThreadExternalId: null,
  resolvedThreadExternalId: null,
  providerDeliveredRecipients: null,
  projectedMessageId: null,
  projectedMessageThreadId: null,
  finalEvidenceDigest: 'c'.repeat(64),
  safeOutcomeReason: 'DEFINITELY_UNACCEPTED_NON_RETRYABLE',
  retryable: false,
  ...overrides,
});

describe('CampaignExecutionPersistenceAdapter', () => {
  it('updates stable execution identity through schema-qualified SQL and a structured result', async () => {
    const { context, query } = harness([
      [executionRow],
      {
        affected: 1,
        records: [
          {
            ...executionRow,
            timeZone: 'Europe/Paris',
            startLocalTime: '09:00:00',
            endLocalTime: '17:00:00',
            campaignCapacityTimeZone: 'America/New_York',
          },
        ],
      },
    ]);

    await expect(
      new CampaignExecutionPersistenceAdapter().writeSendingWindowInTransaction(
        context,
        {
          window: {
            timeZone: 'Europe/Paris',
            startLocalTime: '09:00:00',
            endLocalTime: '17:00:00',
          },
          campaignCapacityTimeZone: 'America/New_York',
        },
      ),
    ).resolves.toMatchObject({
      status: 'UPDATED',
      createdExecution: false,
      execution: { campaignExecutionId: executionId },
    });
    expect(query.mock.calls[0][0]).toContain('core."campaignExecution"');
    expect(query.mock.calls[1][2]).toBe(true);
    expect(context.manager.query).toBeUndefined();
  });

  it.each([
    [{ affected: 0, records: [] }],
    [
      {
        affected: 1,
        records: [{ id: '44444444-4444-4444-8444-444444444444' }],
      },
    ],
    [{ affected: 2, records: [{ id: campaignId }, { id: campaignId }] }],
  ])(
    'rejects invalid PostgreSQL structured lifecycle CAS result %#',
    async (structured) => {
      const { context } = harness([structured]);

      await expect(
        new CampaignExecutionPersistenceAdapter().transitionLifecycleInTransaction(
          context,
          {
            from: 'ACTIVE',
            to: 'PAUSED',
          },
        ),
      ).rejects.toThrow('Campaign lifecycle transition was inconsistent');
    },
  );

  it('writes lifecycle evidence through the same transaction and propagates projection failure', async () => {
    const { context } = harness([
      { affected: 1, records: [{ id: campaignId }] },
    ]);
    const writer = {
      writeInTransaction: jest
        .fn()
        .mockRejectedValue(new Error('projection failed')),
    } as unknown as CampaignTimelineEventWriterService;

    await expect(
      new CampaignExecutionPersistenceAdapter(
        writer,
      ).transitionLifecycleInTransaction(context, {
        from: 'ACTIVE',
        to: 'PAUSED',
      }),
    ).rejects.toThrow('projection failed');
    expect(writer.writeInTransaction).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ eventKind: 'PAUSED' }),
    );
  });

  it('counts the actual attemptState column', async () => {
    const { context, query } = harness([[{ count: 3 }]]);

    await expect(
      new CampaignExecutionPersistenceAdapter().countInFlightAttemptsInTransaction(
        context,
      ),
    ).resolves.toBe(3);
    expect(query.mock.calls[0][0]).toContain('"attemptState" IN');
    expect(query.mock.calls[0][0]).not.toMatch(/\sstate IN/);
  });

  it('settles exact-authorization PENDING and HELD occurrences with no attempts', async () => {
    const pending = occurrenceRow();
    const held = occurrenceRow({
      id: heldOccurrenceId,
      state: 'HELD',
      holdReason: 'CAPACITY_CONFIGURATION_INVALID',
    });
    const { context, query } = harness([
      [pending, held],
      [],
      {
        affected: 2,
        records: [{ id: occurrenceId }, { id: heldOccurrenceId }],
      },
    ]);

    await expect(
      new CampaignExecutionPersistenceAdapter().settlePausedOccurrencesInTransaction(
        context,
        authorizationId,
      ),
    ).resolves.toBe(2);

    expect(query.mock.calls[0][0]).toContain("o.state IN ('PENDING', 'HELD')");
    expect(query.mock.calls[0][0]).toContain('e."authorizationId" = $3');
    expect(query.mock.calls[0][1]).toEqual([
      workspaceId,
      campaignId,
      authorizationId,
    ]);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF o');
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[2][0]).toContain("state = 'CANCELLED'");
    expect(query.mock.calls[2][0]).toContain(
      '"terminalReason" = \'CAMPAIGN_PAUSED\'',
    );
    expect(query.mock.calls[2][1]).toEqual([
      workspaceId,
      campaignId,
      authorizationId,
      [occurrenceId, heldOccurrenceId],
    ]);
  });

  it('settles only attempts validated as definitely nonaccepted before provider submission', async () => {
    const blockedOccurrenceId = heldOccurrenceId;
    const blocked = definitiveAttemptRow({
      attemptId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      occurrenceId: blockedOccurrenceId,
      attemptState: 'BLOCKED',
      finalEvidenceDigest: null,
      safeOutcomeReason: 'STALE_FINAL_EVIDENCE',
      retryable: false,
    });
    const { context } = harness([
      [occurrenceRow(), occurrenceRow({ id: blockedOccurrenceId })],
      [definitiveAttemptRow(), blocked],
      {
        affected: 2,
        records: [{ id: occurrenceId }, { id: blockedOccurrenceId }],
      },
    ]);

    await expect(
      new CampaignExecutionPersistenceAdapter().settlePausedOccurrencesInTransaction(
        context,
        authorizationId,
      ),
    ).resolves.toBe(2);
  });

  it.each([
    [
      'reserved',
      {
        attemptState: 'RESERVED',
        capacityState: 'RESERVED',
        finalEvidenceDigest: null,
        safeOutcomeReason: null,
        retryable: null,
      },
    ],
    [
      'processing',
      {
        attemptState: 'PROCESSING',
        capacityState: 'RESERVED',
        safeOutcomeReason: null,
        retryable: null,
      },
    ],
    [
      'unknown',
      {
        attemptState: 'UNKNOWN',
        capacityState: 'PROVISIONAL_UNKNOWN',
        safeOutcomeReason: 'PROVIDER_OUTCOME_UNCONFIRMED',
        retryable: false,
      },
    ],
    [
      'accepted',
      {
        attemptState: 'ACCEPTED',
        capacityState: 'CONSUMED',
        providerMessageId: 'provider-id',
        providerAcceptedAt: '2026-09-20T10:00:30.000Z',
        safeOutcomeReason: null,
        retryable: false,
      },
    ],
    ['malformed', { finalEvidenceDigest: 'not-a-digest' }],
    ['provider-ambiguous', { providerMessageExternalId: 'provider-id' }],
    ['mismatched', { authorizationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }],
    ['unreconciled', { source: 'INBOX' }],
  ])('leaves %s attempt evidence unchanged', async (_label, overrides) => {
    const { context, query } = harness([
      [occurrenceRow()],
      [definitiveAttemptRow(overrides)],
    ]);

    await expect(
      new CampaignExecutionPersistenceAdapter().settlePausedOccurrencesInTransaction(
        context,
        authorizationId,
      ),
    ).resolves.toBe(0);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('leaves in-flight, unknown, and terminal occurrence states outside the candidate lock and replays idempotently', async () => {
    const { context, query } = harness([[]]);

    await expect(
      new CampaignExecutionPersistenceAdapter().settlePausedOccurrencesInTransaction(
        context,
        authorizationId,
      ),
    ).resolves.toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toContain("'IN_FLIGHT'");
    expect(query.mock.calls[0][0]).not.toContain("'UNKNOWN'");
    expect(query.mock.calls[0][0]).not.toContain("'CANCELLED'");
  });

  it('rejects an incomplete safe-settlement compare-and-set', async () => {
    const { context } = harness([
      [occurrenceRow()],
      [],
      { affected: 0, records: [] },
    ]);

    await expect(
      new CampaignExecutionPersistenceAdapter().settlePausedOccurrencesInTransaction(
        context,
        authorizationId,
      ),
    ).rejects.toThrow('Campaign paused occurrence settlement was inconsistent');
  });
});
