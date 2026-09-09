import { type EntityManager, getMetadataArgsStorage } from 'typeorm';

import { OutboundEmailAttemptEntity } from 'src/modules/campaign-execution/entities/outbound-email-attempt.entity';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import {
  OUTBOUND_EMAIL_ATTEMPT_TRANSITIONS,
  type BeginOutboundEmailSubmissionInput,
  type CampaignSequenceSubmissionInput,
  type CampaignTestSubmissionInput,
  type DirectSubmissionInput,
  type OutboundEmailAttemptReceipt,
  type OutboundEmailAttemptReservationIdentity,
  hasVerifiedSentEvidence,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';

const ids = {
  account: '22222222-2222-4222-8222-222222222222',
  attempt: '11111111-1111-4111-8111-111111111111',
  authorization: '33333333-3333-4333-8333-333333333333',
  campaign: '44444444-4444-4444-8444-444444444444',
  capability: '55555555-5555-4555-8555-555555555555',
  channel: '66666666-6666-4666-8666-666666666666',
  enrollment: '77777777-7777-4777-8777-777777777777',
  evidence: '88888888-8888-4888-8888-888888888888',
  message: '99999999-9999-4999-8999-999999999999',
  occurrence: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  proof: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  requester: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  version: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  workspace: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};
const digest = 'a'.repeat(64);
const digestB = 'b'.repeat(64);
const claimedAt = new Date('2026-03-10T14:00:00.000Z');
const slotAt = new Date('2026-03-10T14:00:01.000Z');
const unknownAfter = new Date('2026-03-10T14:01:00.000Z');

const sequenceReservation = (): OutboundEmailAttemptReservationIdentity => ({
  attemptId: ids.attempt,
  attemptNumber: 1,
  authorizationId: ids.authorization,
  campaignId: ids.campaign,
  claimedAt,
  connectedAccountId: ids.account,
  enrollmentId: ids.enrollment,
  localDate: '2026-03-10',
  messageChannelId: ids.channel,
  messageId: ids.message,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  occurrenceId: ids.occurrence,
  priorAcceptedEvidenceId: null,
  provider: 'google',
  renderDigest: digest,
  reservationEvidence: { kind: 'CAMPAIGN_SEQUENCE_RESERVATION' },
  selectionConstraintKind: 'ROTATE',
  senderPoolFingerprint: digestB,
  slotAt,
  source: 'CAMPAIGN_SEQUENCE',
  unknownAfter,
  workflowVersionId: ids.version,
  workspaceId: ids.workspace,
});

const testReservation = (): OutboundEmailAttemptReservationIdentity => ({
  attemptId: ids.attempt,
  campaignId: ids.campaign,
  claimedAt,
  connectedAccountId: ids.account,
  localDate: '2026-03-10',
  messageChannelId: ids.channel,
  messageId: ids.message,
  normalizedRecipient: 'verified@example.com',
  normalizedSenderHandle: 'sender@example.com',
  previewDigest: digestB,
  priorAcceptedEvidenceId: null,
  provider: 'google',
  renderDigest: digest,
  requesterUserWorkspaceId: ids.requester,
  reservationEvidence: {
    kind: 'TEST_PREPARATION_PROOF',
    maySubmit: false,
    testPreparationProofId: ids.proof,
  },
  selectionConstraintKind: 'ROTATE',
  senderPoolFingerprint: digest,
  slotAt,
  source: 'CAMPAIGN_TEST',
  testTransportDigest: digest,
  unknownAfter,
  workflowVersionId: ids.version,
  workspaceId: ids.workspace,
});

const directReservation = (): OutboundEmailAttemptReservationIdentity => ({
  attemptId: ids.attempt,
  claimedAt,
  connectedAccountId: ids.account,
  directReservationCapabilityId: ids.capability,
  localDate: '2026-03-10',
  messageChannelId: ids.channel,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  priorAcceptedEvidenceId: null,
  provider: 'google',
  reservationEvidence: {
    directReservationCapabilityId: ids.capability,
    kind: 'DIRECT_RESERVATION_CAPABILITY',
  },
  selectionConstraintKind: 'EXPLICIT',
  slotAt,
  source: 'INBOX',
  unknownAfter,
  workspaceId: ids.workspace,
});

const receiptFrom = (
  input: OutboundEmailAttemptReservationIdentity,
  overrides: Partial<OutboundEmailAttemptReceipt> = {},
): OutboundEmailAttemptReceipt => ({
  authorizationId: null,
  campaignId: null,
  directReservationCapabilityId: null,
  enrollmentId: null,
  occurrenceId: null,
  attemptNumber: null,
  messageId: null,
  previewDigest: null,
  renderDigest: null,
  requesterUserWorkspaceId: null,
  senderPoolFingerprint: null,
  testPreparationProofId: null,
  testTransportDigest: null,
  workflowVersionId: null,
  ...input,
  ...(input.source === 'CAMPAIGN_TEST'
    ? {
        testPreparationProofId:
          input.reservationEvidence.testPreparationProofId,
      }
    : {}),
  attemptState: 'RESERVED',
  capacityState: 'RESERVED',
  createdAt: new Date('2026-03-10T14:00:00.000Z'),
  finalEvidenceDigest: null,
  projectedMessageId: null,
  providerAcceptedAt: null,
  providerMessageId: null,
  retryable: null,
  safeOutcomeReason: null,
  updatedAt: new Date('2026-03-10T14:00:00.000Z'),
  ...overrides,
});

const sequenceSubmission = (): CampaignSequenceSubmissionInput => ({
  attemptId: ids.attempt,
  authorizationId: ids.authorization,
  campaignId: ids.campaign,
  connectedAccountId: ids.account,
  enrollmentId: ids.enrollment,
  finalEvidenceDigest: digestB,
  messageChannelId: ids.channel,
  messageId: ids.message,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  occurrenceId: ids.occurrence,
  provider: 'google',
  renderDigest: digest,
  source: 'CAMPAIGN_SEQUENCE',
  submissionCapability: {
    attemptId: ids.attempt,
    kind: 'CAMPAIGN_SEQUENCE_SUBMISSION',
    reservationBinding: {
      attemptNumber: 1,
      claimedAt,
      localDate: '2026-03-10',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'ROTATE',
      senderPoolFingerprint: digestB,
      slotAt,
      unknownAfter,
    },
    renderContext: {
      authorizationId: ids.authorization,
      campaignId: ids.campaign,
      connectedAccountId: ids.account,
      enrollmentId: ids.enrollment,
      messageChannelId: ids.channel,
      messageId: ids.message,
      normalizedRecipient: 'recipient@example.com',
      normalizedSenderHandle: 'sender@example.com',
      occurrenceId: ids.occurrence,
      provider: 'google',
      workflowVersionId: ids.version,
      workspaceId: ids.workspace,
    },
    renderDigest: digest,
  },
  workflowVersionId: ids.version,
  workspaceId: ids.workspace,
});

const testSubmission = (): CampaignTestSubmissionInput => ({
  attemptId: ids.attempt,
  campaignId: ids.campaign,
  connectedAccountId: ids.account,
  finalEvidenceDigest: digestB,
  messageChannelId: ids.channel,
  messageId: ids.message,
  normalizedRecipient: 'verified@example.com',
  normalizedSenderHandle: 'sender@example.com',
  previewDigest: digestB,
  provider: 'google',
  renderDigest: digest,
  requesterUserWorkspaceId: ids.requester,
  source: 'CAMPAIGN_TEST',
  submissionCapability: {
    attemptId: ids.attempt,
    campaignId: ids.campaign,
    connectedAccountId: ids.account,
    kind: 'CAMPAIGN_TEST_SUBMISSION',
    messageChannelId: ids.channel,
    messageId: ids.message,
    normalizedRecipient: 'verified@example.com',
    normalizedSenderHandle: 'sender@example.com',
    previewDigest: digestB,
    reservationBinding: {
      claimedAt,
      localDate: '2026-03-10',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'ROTATE',
      senderPoolFingerprint: digest,
      slotAt,
      unknownAfter,
    },
    provider: 'google',
    renderDigest: digest,
    requesterUserWorkspaceId: ids.requester,
    testPreparationProofId: ids.proof,
    testSubmissionCapabilityId: ids.capability,
    testTransportDigest: digest,
    workflowVersionId: ids.version,
    workspaceId: ids.workspace,
  },
  testPreparationProofId: ids.proof,
  testTransportDigest: digest,
  workflowVersionId: ids.version,
  workspaceId: ids.workspace,
});

const directSubmission = (): DirectSubmissionInput => ({
  attemptId: ids.attempt,
  connectedAccountId: ids.account,
  directReservationCapabilityId: ids.capability,
  finalEvidenceDigest: digestB,
  messageChannelId: ids.channel,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  provider: 'google',
  source: 'INBOX',
  submissionCapability: {
    attemptId: ids.attempt,
    connectedAccountId: ids.account,
    directReservationCapabilityId: ids.capability,
    directSubmissionCapabilityId: ids.evidence,
    finalEvidenceDigest: digestB,
    kind: 'DIRECT_SUBMISSION_CAPABILITY',
    messageChannelId: ids.channel,
    normalizedRecipient: 'recipient@example.com',
    normalizedSenderHandle: 'sender@example.com',
    provider: 'google',
    reservationBinding: {
      claimedAt,
      directReservationCapabilityId: ids.capability,
      localDate: '2026-03-10',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'EXPLICIT',
      slotAt,
      unknownAfter,
    },
    workspaceId: ids.workspace,
  },
  workspaceId: ids.workspace,
});

type HarnessOptions = {
  observedAt?: Date;
  processingResult?: (updated: OutboundEmailAttemptReceipt) => unknown;
  row?: OutboundEmailAttemptReceipt | null;
};

const createHarness = (options: HarnessOptions = {}) => {
  const calls: Array<{
    params: unknown[];
    sql: string;
    useStructuredResult?: boolean;
  }> = [];
  let row = options.row === undefined ? null : options.row;
  const query = jest.fn(
    async (
      sql: string,
      params: unknown[] = [],
      useStructuredResult?: boolean,
    ) => {
      calls.push({ params, sql, useStructuredResult });
      if (sql.includes('pg_advisory_xact_lock')) return [{ locked: true }];
      if (sql.includes('INSERT INTO "core"."outboundEmailAttempt"')) {
        if (row !== null) return [];
        const columnSection = sql.slice(
          sql.indexOf('(') + 1,
          sql.indexOf(') VALUES'),
        );
        const columns = [...columnSection.matchAll(/"([^"]+)"/g)].map(
          ([, column]) => column,
        );
        if (columns.length !== 36 || params.length !== columns.length) {
          throw new Error(
            'INSERT fake received an incomplete parameter vector',
          );
        }
        row = {
          ...Object.fromEntries(
            columns.map((column, index) => [column, params[index]]),
          ),
          createdAt: claimedAt,
          updatedAt: claimedAt,
        } as unknown as OutboundEmailAttemptReceipt;
        return [row];
      }
      if (sql.includes('UPDATE "core"."outboundEmailAttempt"')) {
        if (useStructuredResult !== true) {
          throw new Error('Processing UPDATE must request a structured result');
        }
        if (row === null || row.attemptState !== 'RESERVED') {
          return { affected: 0, raw: [[], 0], records: [] };
        }
        row = {
          ...row,
          attemptState: 'PROCESSING',
          finalEvidenceDigest: params[2] as string,
        };
        return options.processingResult === undefined
          ? {
              affected: 1,
              raw: [[row], 1],
              records: [row],
            }
          : options.processingResult(row);
      }
      if (sql.includes('MATERIALIZED')) {
        return [{ observedAt: options.observedAt ?? claimedAt }];
      }
      if (sql.includes('FROM "core"."outboundEmailAttempt"')) {
        if (row === null) return [];
        if (
          sql.includes('"workspaceId" = $1') &&
          row.workspaceId !== params[0]
        ) {
          return [];
        }
        return [row];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  );
  const queryRunner = { isTransactionActive: true, query };

  return {
    calls,
    manager: { queryRunner } as unknown as EntityManager,
    query,
    service: new OutboundEmailAttemptService(),
  };
};

const compileTimeNegativeFixtures = () => {
  const input = testReservation();
  // @ts-expect-error preparation proofs can never authorize submission
  input.reservationEvidence.maySubmit = true;

  // @ts-expect-error Campaign sequence cannot use explicit sender selection
  const explicitSequence: OutboundEmailAttemptReservationIdentity = {
    ...sequenceReservation(),
    selectionConstraintKind: 'EXPLICIT',
  };
  // @ts-expect-error Campaign test cannot use pinned-reply sender selection
  const pinnedTest: OutboundEmailAttemptReservationIdentity = {
    ...testReservation(),
    priorAcceptedEvidenceId: ids.evidence,
    selectionConstraintKind: 'PINNED_REPLY',
  };
  // @ts-expect-error direct sources cannot rotate sender selection
  const rotatingDirect: OutboundEmailAttemptReservationIdentity = {
    ...directReservation(),
    selectionConstraintKind: 'ROTATE',
  };

  const submission = testSubmission();
  // @ts-expect-error submission capabilities cannot be reservation evidence
  input.reservationEvidence = submission.submissionCapability;

  const sequence = sequenceReservation();
  // @ts-expect-error pre-reservation Campaign render context cannot begin submission
  const invalidSequenceBegin: BeginOutboundEmailSubmissionInput = sequence;
  const test = testReservation();
  // @ts-expect-error test preparation proof cannot begin submission
  const invalidTestBegin: BeginOutboundEmailSubmissionInput = test;
  const direct = directReservation();
  // @ts-expect-error reservation capabilities cannot begin provider submission
  const invalidDirectBegin: BeginOutboundEmailSubmissionInput = direct;

  // @ts-expect-error sequence post-final capability requires its render context
  const incompleteSequenceCapability: CampaignSequenceSubmissionInput['submissionCapability'] =
    {
      attemptId: ids.attempt,
      kind: 'CAMPAIGN_SEQUENCE_SUBMISSION',
      renderDigest: digest,
    };
  // @ts-expect-error test post-final capability requires every preparation and identity binding
  const incompleteTestCapability: CampaignTestSubmissionInput['submissionCapability'] =
    {
      attemptId: ids.attempt,
      kind: 'CAMPAIGN_TEST_SUBMISSION',
      testPreparationProofId: ids.proof,
      testSubmissionCapabilityId: ids.capability,
    };
  // @ts-expect-error direct post-final capability requires every exact identity binding
  const incompleteDirectCapability: DirectSubmissionInput['submissionCapability'] =
    {
      attemptId: ids.attempt,
      directReservationCapabilityId: ids.capability,
      directSubmissionCapabilityId: ids.evidence,
      finalEvidenceDigest: digestB,
      kind: 'DIRECT_SUBMISSION_CAPABILITY',
      normalizedRecipient: 'recipient@example.com',
      normalizedSenderHandle: 'sender@example.com',
    };

  return [
    explicitSequence,
    pinnedTest,
    rotatingDirect,
    invalidSequenceBegin,
    invalidTestBegin,
    invalidDirectBegin,
    incompleteSequenceCapability,
    incompleteTestCapability,
    incompleteDirectCapability,
  ];
};
void compileTimeNegativeFixtures;

describe('OutboundEmailAttempt entity contract', () => {
  it('declares the sole core attempt table with exact columns and no relations', () => {
    const metadata = getMetadataArgsStorage();
    const table = metadata.tables.find(
      ({ target }) => target === OutboundEmailAttemptEntity,
    );
    const columns = metadata.columns.filter(
      ({ target }) => target === OutboundEmailAttemptEntity,
    );
    const relations = metadata.relations.filter(
      ({ target }) => target === OutboundEmailAttemptEntity,
    );

    expect(table).toMatchObject({
      name: 'outboundEmailAttempt',
      schema: 'core',
    });
    expect(columns.map(({ propertyName }) => propertyName)).toEqual([
      'attemptId',
      'workspaceId',
      'source',
      'attemptState',
      'capacityState',
      'connectedAccountId',
      'messageChannelId',
      'provider',
      'normalizedSenderHandle',
      'normalizedRecipient',
      'selectionConstraintKind',
      'priorAcceptedEvidenceId',
      'senderPoolFingerprint',
      'localDate',
      'claimedAt',
      'slotAt',
      'unknownAfter',
      'campaignId',
      'enrollmentId',
      'occurrenceId',
      'authorizationId',
      'workflowVersionId',
      'messageId',
      'attemptNumber',
      'renderDigest',
      'testPreparationProofId',
      'requesterUserWorkspaceId',
      'previewDigest',
      'testTransportDigest',
      'directReservationCapabilityId',
      'finalEvidenceDigest',
      'providerMessageId',
      'providerAcceptedAt',
      'safeOutcomeReason',
      'retryable',
      'projectedMessageId',
      'createdAt',
      'updatedAt',
    ]);
    expect(relations).toHaveLength(0);
    expect(
      columns.find(({ propertyName }) => propertyName === 'attemptId')?.options,
    ).toMatchObject({ primary: true, type: 'uuid' });
  });

  it('declares stable source/state checks and separately scoped partial indexes', () => {
    const metadata = getMetadataArgsStorage();
    const checks = metadata.checks.filter(
      ({ target }) => target === OutboundEmailAttemptEntity,
    );
    const indices = metadata.indices.filter(
      ({ target }) => target === OutboundEmailAttemptEntity,
    );

    expect(checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'CHK_OUTBOUND_EMAIL_ATTEMPT_SOURCE_SHAPE',
        'CHK_OUTBOUND_EMAIL_ATTEMPT_STATE_CAPACITY_SHAPE',
        'CHK_OUTBOUND_EMAIL_ATTEMPT_UNKNOWN_AFTER',
        'CHK_OUTBOUND_EMAIL_ATTEMPT_SELECTION_EVIDENCE',
      ]),
    );
    expect(indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: [
            'workspaceId',
            'connectedAccountId',
            'provider',
            'providerMessageId',
          ],
          name: 'UQ_OUTBOUND_EMAIL_ATTEMPT_PROVIDER_MESSAGE',
          unique: true,
        }),
        expect.objectContaining({
          columns: ['workspaceId', 'projectedMessageId'],
          name: 'UQ_OUTBOUND_EMAIL_ATTEMPT_PROJECTED_MESSAGE',
          unique: true,
        }),
        expect.objectContaining({
          columns: ['workspaceId', 'occurrenceId'],
          name: 'UQ_OUTBOUND_EMAIL_ATTEMPT_UNRESOLVED_OCCURRENCE',
          unique: true,
        }),
        expect.objectContaining({
          columns: ['workspaceId', 'occurrenceId'],
          name: 'UQ_OUTBOUND_EMAIL_ATTEMPT_ACCEPTED_OCCURRENCE',
          unique: true,
        }),
      ]),
    );
    expect(JSON.stringify(indices)).toContain('unknownAfter');

    const sourceCheck = checks.find(
      ({ name }) => name === 'CHK_OUTBOUND_EMAIL_ATTEMPT_SOURCE_SHAPE',
    )?.expression;
    expect(sourceCheck).toContain(
      `"source" = 'CAMPAIGN_SEQUENCE'\n      AND "selectionConstraintKind" IN ('ROTATE', 'PINNED_REPLY')`,
    );
    expect(sourceCheck).toContain(
      '"attemptNumber" IS NOT NULL\n      AND "attemptNumber" > 0',
    );
    expect(sourceCheck).toContain(
      `"source" = 'CAMPAIGN_TEST'\n      AND "selectionConstraintKind" = 'ROTATE'\n      AND "priorAcceptedEvidenceId" IS NULL`,
    );
    expect(sourceCheck).toContain(
      `"source" IN ('INBOX', 'AUTOMATED_REPLY')\n      AND "directReservationCapabilityId" IS NOT NULL\n      AND "selectionConstraintKind" IN ('PINNED_REPLY', 'EXPLICIT')`,
    );
  });
});

describe('OutboundEmailAttemptService reservation fence', () => {
  it.each([
    ['missing runner', {}],
    ['inactive runner', { queryRunner: { isTransactionActive: false } }],
  ])('rejects a %s before SQL', async (_label, manager) => {
    await expect(
      new OutboundEmailAttemptService().lockAttemptForReservation(
        sequenceReservation(),
        manager as EntityManager,
      ),
    ).rejects.toThrow('active query runner');
  });

  it.each([
    ['uppercase uuid', { workspaceId: ids.workspace.toUpperCase() }],
    ['bad digest', { renderDigest: 'not-a-digest' }],
    [
      'wrong unknown window',
      { unknownAfter: new Date(claimedAt.getTime() + 59_999) },
    ],
    [
      'unnormalized recipient',
      { normalizedRecipient: 'Recipient@example.com' },
    ],
    ['invalid timestamp', { slotAt: new Date('invalid') }],
  ])('rejects %s before SQL', async (_label, override) => {
    const harness = createHarness();
    await expect(
      harness.service.lockAttemptForReservation(
        {
          ...sequenceReservation(),
          ...override,
        } as OutboundEmailAttemptReservationIdentity,
        harness.manager,
      ),
    ).rejects.toThrow('Invalid outbound email attempt input');
    expect(harness.query).not.toHaveBeenCalled();
  });

  it.each([
    [
      'Campaign sequence explicit selection',
      { ...sequenceReservation(), selectionConstraintKind: 'EXPLICIT' },
    ],
    [
      'Campaign test pinned selection',
      {
        ...testReservation(),
        priorAcceptedEvidenceId: ids.evidence,
        selectionConstraintKind: 'PINNED_REPLY',
      },
    ],
    [
      'Campaign test explicit selection',
      { ...testReservation(), selectionConstraintKind: 'EXPLICIT' },
    ],
    [
      'direct rotating selection',
      { ...directReservation(), selectionConstraintKind: 'ROTATE' },
    ],
  ])('rejects illegal %s before SQL', async (_label, input) => {
    const harness = createHarness();
    await expect(
      harness.service.lockAttemptForReservation(
        input as OutboundEmailAttemptReservationIdentity,
        harness.manager,
      ),
    ).rejects.toThrow('Invalid outbound email attempt input');
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('takes the namespaced parameterized advisory fence before row lookup and returns NEW', async () => {
    const harness = createHarness();
    await expect(
      harness.service.lockAttemptForReservation(
        sequenceReservation(),
        harness.manager,
      ),
    ).resolves.toEqual({ status: 'NEW' });

    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[0].sql).toContain(
      'pg_advisory_xact_lock(hashtextextended($1, $2))',
    );
    expect(harness.calls[0].params).toEqual([
      `outbound-email-attempt:${ids.attempt}`,
      322331,
    ]);
    expect(harness.calls[1].sql).toContain('FOR UPDATE');
    expect(harness.calls[1].params).toEqual([ids.attempt]);
  });

  it('returns an exact replay in every state only when every immutable field matches', async () => {
    for (const attemptState of [
      'RESERVED',
      'PROCESSING',
      'BLOCKED',
      'ACCEPTED',
      'DEFINITELY_UNACCEPTED',
      'UNKNOWN',
    ] as const) {
      const receipt = receiptFrom(sequenceReservation(), { attemptState });
      const harness = createHarness({ row: receipt });
      await expect(
        harness.service.lockAttemptForReservation(
          sequenceReservation(),
          harness.manager,
        ),
      ).resolves.toEqual({ receipt, status: 'EXACT_REPLAY' });
      expect(harness.calls).toHaveLength(2);
    }
  });

  it.each([
    ['workspace', { workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }],
    ['account', { connectedAccountId: ids.channel }],
    ['channel', { messageChannelId: ids.account }],
    ['digest', { renderDigest: digestB }],
    ['claim time', { claimedAt: new Date(claimedAt.getTime() + 1) }],
    ['local day', { localDate: '2026-03-11' }],
  ])('returns identity conflict for changed %s', async (_label, override) => {
    const stored = receiptFrom(sequenceReservation());
    const candidate = {
      ...sequenceReservation(),
      ...override,
    } as OutboundEmailAttemptReservationIdentity;
    if ('claimedAt' in override) {
      (candidate as { unknownAfter: Date }).unknownAfter = new Date(
        candidate.claimedAt.getTime() + 60_000,
      );
    }
    const harness = createHarness({ row: stored });
    await expect(
      harness.service.lockAttemptForReservation(candidate, harness.manager),
    ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
  });

  it('conflicts when a test proof or direct reservation capability changes', async () => {
    for (const [stored, candidate] of [
      [
        testReservation(),
        {
          ...testReservation(),
          reservationEvidence: {
            ...testReservation().reservationEvidence,
            testPreparationProofId: ids.evidence,
          },
        },
      ],
      [
        directReservation(),
        {
          ...directReservation(),
          directReservationCapabilityId: ids.evidence,
          reservationEvidence: {
            kind: 'DIRECT_RESERVATION_CAPABILITY',
            directReservationCapabilityId: ids.evidence,
          },
        },
      ],
    ] as const) {
      const harness = createHarness({ row: receiptFrom(stored) });
      await expect(
        harness.service.lockAttemptForReservation(
          candidate as OutboundEmailAttemptReservationIdentity,
          harness.manager,
        ),
      ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
    }
  });

  it('reacquires the fence and inserts one complete RESERVED/RESERVED row without capacity SQL', async () => {
    const harness = createHarness();
    const receipt = await harness.service.insertReservedAttempt(
      sequenceReservation(),
      harness.manager,
    );
    expect(receipt).toMatchObject({
      attemptState: 'RESERVED',
      capacityState: 'RESERVED',
    });
    expect(harness.calls.map(({ sql }) => sql)).toHaveLength(3);
    expect(harness.calls[0].sql).toContain('pg_advisory_xact_lock');
    expect(harness.calls[1].sql).toContain('FOR UPDATE');
    expect(harness.calls[2].sql).toContain(
      'INSERT INTO "core"."outboundEmailAttempt"',
    );
    expect(harness.calls[2].params).toEqual([
      ids.attempt,
      ids.workspace,
      'CAMPAIGN_SEQUENCE',
      'RESERVED',
      'RESERVED',
      ids.account,
      ids.channel,
      'google',
      'sender@example.com',
      'recipient@example.com',
      'ROTATE',
      null,
      digestB,
      '2026-03-10',
      claimedAt,
      slotAt,
      unknownAfter,
      ids.campaign,
      ids.enrollment,
      ids.occurrence,
      ids.authorization,
      ids.version,
      ids.message,
      1,
      digest,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(
      harness.calls.some(({ sql }) =>
        /mailboxCapacityDay|mailboxDispatchClock/.test(sql),
      ),
    ).toBe(false);
  });

  it.each([
    [
      'Campaign test',
      testReservation(),
      [
        ids.attempt,
        ids.workspace,
        'CAMPAIGN_TEST',
        'RESERVED',
        'RESERVED',
        ids.account,
        ids.channel,
        'google',
        'sender@example.com',
        'verified@example.com',
        'ROTATE',
        null,
        digest,
        '2026-03-10',
        claimedAt,
        slotAt,
        unknownAfter,
        ids.campaign,
        null,
        null,
        null,
        ids.version,
        ids.message,
        null,
        digest,
        ids.proof,
        ids.requester,
        digestB,
        digest,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    ],
    [
      'direct',
      directReservation(),
      [
        ids.attempt,
        ids.workspace,
        'INBOX',
        'RESERVED',
        'RESERVED',
        ids.account,
        ids.channel,
        'google',
        'sender@example.com',
        'recipient@example.com',
        'EXPLICIT',
        null,
        null,
        '2026-03-10',
        claimedAt,
        slotAt,
        unknownAfter,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        ids.capability,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    ],
  ] as const)(
    'inserts a complete source-shaped %s identity',
    async (_label, input, expectedParams) => {
      const harness = createHarness();
      const receipt = await harness.service.insertReservedAttempt(
        input,
        harness.manager,
      );

      expect(harness.calls[2].params).toEqual(expectedParams);
      expect(harness.calls[2].params).toHaveLength(36);
      expect(receipt).toMatchObject({
        attemptState: 'RESERVED',
        capacityState: 'RESERVED',
        source: input.source,
      });
      if (input.source === 'CAMPAIGN_TEST') {
        expect(receipt).toMatchObject({
          directReservationCapabilityId: null,
          senderPoolFingerprint: digest,
          testPreparationProofId: ids.proof,
        });
      } else {
        expect(receipt).toMatchObject({
          campaignId: null,
          directReservationCapabilityId: ids.capability,
          senderPoolFingerprint: null,
        });
      }
    },
  );

  it('rejects insert when the attempt already exists', async () => {
    const harness = createHarness({ row: receiptFrom(sequenceReservation()) });
    await expect(
      harness.service.insertReservedAttempt(
        sequenceReservation(),
        harness.manager,
      ),
    ).rejects.toThrow('already exists');
    expect(harness.calls).toHaveLength(2);
  });
});

describe('OutboundEmailAttemptService processing CAS and receipt', () => {
  it('acquires exact Campaign sequence submission once with row-lock then one DB time sample', async () => {
    const harness = createHarness({
      observedAt: new Date('2026-03-10T14:00:29.999Z'),
      row: receiptFrom(sequenceReservation()),
    });
    await expect(
      harness.service.beginSubmission(sequenceSubmission(), harness.manager),
    ).resolves.toMatchObject({
      receipt: { attemptState: 'PROCESSING', finalEvidenceDigest: digestB },
      status: 'PROCESSING_ACQUIRED',
    });
    expect(
      harness.calls.map(({ sql }) =>
        sql.includes('FOR UPDATE')
          ? 'lock'
          : sql.includes('clock_timestamp()')
            ? 'time'
            : sql.includes('UPDATE')
              ? 'cas'
              : 'other',
      ),
    ).toEqual(['lock', 'time', 'cas']);
    expect(harness.calls[2].params).toEqual([
      ids.workspace,
      ids.attempt,
      digestB,
      new Date('2026-03-10T14:00:29.999Z'),
    ]);
    expect(harness.calls[2].sql).toContain('"attemptState" = \'RESERVED\'');
    expect(harness.calls[2].useStructuredResult).toBe(true);

    await expect(
      harness.service.beginSubmission(sequenceSubmission(), harness.manager),
    ).resolves.toMatchObject({
      currentState: 'PROCESSING',
      status: 'NOT_ACQUIRED',
    });
    expect(
      harness.calls.filter(({ sql }) => sql.trimStart().startsWith('UPDATE')),
    ).toHaveLength(1);
  });

  it.each([
    [
      'affected zero',
      (updated: OutboundEmailAttemptReceipt) => ({
        affected: 0,
        raw: [[updated], 0],
        records: [updated],
      }),
    ],
    ['empty records', () => ({ affected: 1, raw: [[], 1], records: [] })],
    [
      'multiple records',
      (updated: OutboundEmailAttemptReceipt) => ({
        affected: 1,
        raw: [[updated, updated], 1],
        records: [updated, updated],
      }),
    ],
    ['malformed records', () => ({ affected: 1, raw: [[], 1], records: null })],
    ['malformed result', () => null],
    [
      'malformed returned receipt',
      () => ({ affected: 1, raw: [[{}], 1], records: [{}] }),
    ],
  ])(
    'rejects a processing UPDATE %s result instead of reporting acquisition',
    async (_label, processingResult) => {
      const harness = createHarness({
        observedAt: new Date('2026-03-10T14:00:29.999Z'),
        processingResult,
        row: receiptFrom(sequenceReservation()),
      });

      await expect(
        harness.service.beginSubmission(sequenceSubmission(), harness.manager),
      ).rejects.toThrow('processing CAS did not affect one valid row');
      expect(harness.calls).toHaveLength(3);
      expect(harness.calls[2]).toMatchObject({
        params: [
          ids.workspace,
          ids.attempt,
          digestB,
          new Date('2026-03-10T14:00:29.999Z'),
        ],
        useStructuredResult: true,
      });
    },
  );

  it('rejects every mismatched Campaign sequence capability binding before time sampling or CAS', async () => {
    const base = sequenceSubmission();
    const capability = base.submissionCapability;
    const contextMismatch = (
      override: Partial<typeof capability.renderContext>,
    ) => ({
      ...capability,
      renderContext: { ...capability.renderContext, ...override },
    });
    const bindingMismatch = (
      override: Record<string, unknown>,
    ): typeof capability =>
      ({
        ...capability,
        reservationBinding: { ...capability.reservationBinding, ...override },
      }) as typeof capability;
    const mismatches: Array<[string, typeof capability]> = [
      ['attempt', { ...capability, attemptId: ids.evidence }],
      ['attempt number', bindingMismatch({ attemptNumber: 2 })],
      ['pool fingerprint', bindingMismatch({ senderPoolFingerprint: digest })],
      [
        'selection and prior evidence',
        bindingMismatch({
          priorAcceptedEvidenceId: ids.evidence,
          selectionConstraintKind: 'PINNED_REPLY',
        }),
      ],
      ['local date', bindingMismatch({ localDate: '2026-03-11' })],
      [
        'slot time',
        bindingMismatch({ slotAt: new Date(slotAt.getTime() + 1) }),
      ],
      ['render digest', { ...capability, renderDigest: digestB }],
      ['workspace', contextMismatch({ workspaceId: ids.evidence })],
      ['Campaign', contextMismatch({ campaignId: ids.evidence })],
      ['enrollment', contextMismatch({ enrollmentId: ids.evidence })],
      ['occurrence', contextMismatch({ occurrenceId: ids.evidence })],
      ['authorization', contextMismatch({ authorizationId: ids.evidence })],
      [
        'workflow version',
        contextMismatch({ workflowVersionId: ids.evidence }),
      ],
      ['authored message', contextMismatch({ messageId: ids.evidence })],
      ['account', contextMismatch({ connectedAccountId: ids.evidence })],
      ['channel', contextMismatch({ messageChannelId: ids.evidence })],
      ['provider', contextMismatch({ provider: 'microsoft' })],
      [
        'sender handle',
        contextMismatch({ normalizedSenderHandle: 'other@example.com' }),
      ],
      [
        'recipient',
        contextMismatch({ normalizedRecipient: 'other@example.com' }),
      ],
    ];

    for (const [_binding, submissionCapability] of mismatches) {
      const harness = createHarness({
        row: receiptFrom(sequenceReservation()),
      });
      await expect(
        harness.service.beginSubmission(
          { ...base, submissionCapability },
          harness.manager,
        ),
      ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
      expect(harness.calls).toHaveLength(1);
    }
  });

  it('rejects every mismatched Campaign test capability binding before time sampling or CAS', async () => {
    const base = testSubmission();
    const capability = base.submissionCapability;
    const bindingMismatch = (
      override: Record<string, unknown>,
    ): typeof capability =>
      ({
        ...capability,
        reservationBinding: { ...capability.reservationBinding, ...override },
      }) as typeof capability;
    const mismatches: Array<[string, typeof capability]> = [
      ['attempt', { ...capability, attemptId: ids.evidence }],
      ['pool fingerprint', bindingMismatch({ senderPoolFingerprint: digestB })],
      ['local date', bindingMismatch({ localDate: '2026-03-11' })],
      [
        'slot time',
        bindingMismatch({ slotAt: new Date(slotAt.getTime() + 1) }),
      ],
      [
        'preparation proof',
        { ...capability, testPreparationProofId: ids.evidence },
      ],
      ['workspace', { ...capability, workspaceId: ids.evidence }],
      ['Campaign', { ...capability, campaignId: ids.evidence }],
      ['workflow version', { ...capability, workflowVersionId: ids.evidence }],
      ['authored message', { ...capability, messageId: ids.evidence }],
      ['requester', { ...capability, requesterUserWorkspaceId: ids.evidence }],
      [
        'recipient',
        { ...capability, normalizedRecipient: 'other@example.com' },
      ],
      ['account', { ...capability, connectedAccountId: ids.evidence }],
      ['channel', { ...capability, messageChannelId: ids.evidence }],
      [
        'sender handle',
        { ...capability, normalizedSenderHandle: 'other@example.com' },
      ],
      ['provider', { ...capability, provider: 'microsoft' }],
      ['render digest', { ...capability, renderDigest: digestB }],
      ['preview digest', { ...capability, previewDigest: digest }],
      [
        'test transport digest',
        { ...capability, testTransportDigest: digestB },
      ],
    ];

    for (const [_binding, submissionCapability] of mismatches) {
      const harness = createHarness({ row: receiptFrom(testReservation()) });
      await expect(
        harness.service.beginSubmission(
          { ...base, submissionCapability },
          harness.manager,
        ),
      ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
      expect(harness.calls).toHaveLength(1);
    }
  });

  it('rejects every mismatched direct capability binding before time sampling or CAS', async () => {
    const base = directSubmission();
    const capability = base.submissionCapability;
    const bindingMismatch = (
      override: Record<string, unknown>,
    ): typeof capability =>
      ({
        ...capability,
        reservationBinding: { ...capability.reservationBinding, ...override },
      }) as typeof capability;
    const mismatches: Array<[string, typeof capability]> = [
      ['attempt', { ...capability, attemptId: ids.proof }],
      [
        'selection kind',
        bindingMismatch({
          selectionConstraintKind: 'PINNED_REPLY',
          priorAcceptedEvidenceId: ids.evidence,
        }),
      ],
      [
        'reservation binding capability',
        bindingMismatch({ directReservationCapabilityId: ids.proof }),
      ],
      ['local date', bindingMismatch({ localDate: '2026-03-11' })],
      [
        'slot time',
        bindingMismatch({ slotAt: new Date(slotAt.getTime() + 1) }),
      ],
      [
        'reservation capability',
        { ...capability, directReservationCapabilityId: ids.proof },
      ],
      ['workspace', { ...capability, workspaceId: ids.proof }],
      ['account', { ...capability, connectedAccountId: ids.proof }],
      ['channel', { ...capability, messageChannelId: ids.proof }],
      ['provider', { ...capability, provider: 'microsoft' }],
      [
        'sender handle',
        { ...capability, normalizedSenderHandle: 'other@example.com' },
      ],
      [
        'recipient',
        { ...capability, normalizedRecipient: 'other@example.com' },
      ],
      ['final evidence', { ...capability, finalEvidenceDigest: digest }],
    ];

    for (const [_binding, submissionCapability] of mismatches) {
      const harness = createHarness({ row: receiptFrom(directReservation()) });
      await expect(
        harness.service.beginSubmission(
          { ...base, submissionCapability },
          harness.manager,
        ),
      ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
      expect(harness.calls).toHaveLength(1);
    }
  });

  it.each([
    [
      'sequence selection kind',
      sequenceReservation(),
      sequenceSubmission(),
      { selectionConstraintKind: 'PINNED_REPLY' },
    ],
    [
      'sequence prior evidence',
      sequenceReservation(),
      sequenceSubmission(),
      { priorAcceptedEvidenceId: ids.evidence },
    ],
    [
      'sequence attempt number',
      sequenceReservation(),
      sequenceSubmission(),
      { attemptNumber: 2 },
    ],
    [
      'sequence pool fingerprint',
      sequenceReservation(),
      sequenceSubmission(),
      { senderPoolFingerprint: digest },
    ],
    [
      'test selection kind',
      testReservation(),
      testSubmission(),
      { selectionConstraintKind: 'PINNED_REPLY' },
    ],
    [
      'test prior evidence',
      testReservation(),
      testSubmission(),
      { priorAcceptedEvidenceId: ids.evidence },
    ],
    [
      'test pool fingerprint',
      testReservation(),
      testSubmission(),
      { senderPoolFingerprint: digestB },
    ],
    [
      'direct selection kind',
      directReservation(),
      directSubmission(),
      { selectionConstraintKind: 'PINNED_REPLY' },
    ],
    [
      'direct prior evidence',
      directReservation(),
      directSubmission(),
      { priorAcceptedEvidenceId: ids.evidence },
    ],
    [
      'direct reservation capability',
      directReservation(),
      directSubmission(),
      { directReservationCapabilityId: ids.proof },
    ],
    [
      'local date',
      sequenceReservation(),
      sequenceSubmission(),
      { localDate: '2026-03-11' },
    ],
    [
      'claimed time',
      sequenceReservation(),
      sequenceSubmission(),
      { claimedAt: new Date(claimedAt.getTime() + 1) },
    ],
    [
      'slot time',
      sequenceReservation(),
      sequenceSubmission(),
      { slotAt: new Date(slotAt.getTime() + 1) },
    ],
    [
      'unknown time',
      sequenceReservation(),
      sequenceSubmission(),
      { unknownAfter: new Date(unknownAfter.getTime() + 1) },
    ],
  ] as const)(
    'rejects a locked receipt with changed %s binding before time sampling or CAS',
    async (_label, reservation, submission, receiptOverride) => {
      const harness = createHarness({
        row: receiptFrom(reservation, receiptOverride),
      });

      await expect(
        harness.service.beginSubmission(submission, harness.manager),
      ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0].sql).toContain('FOR UPDATE');
    },
  );

  it.each([
    [
      'more than budget remains',
      '2026-03-10T14:00:29.999Z',
      'PROCESSING_ACQUIRED',
    ],
    [
      'exactly budget remains',
      '2026-03-10T14:00:30.000Z',
      'RESERVATION_WINDOW_EXPIRED',
    ],
    [
      'less than budget remains',
      '2026-03-10T14:00:30.001Z',
      'RESERVATION_WINDOW_EXPIRED',
    ],
  ])(
    '%s according to post-lock DB time',
    async (_label, observedAt, expected) => {
      const harness = createHarness({
        observedAt: new Date(observedAt),
        row: receiptFrom(sequenceReservation()),
      });
      const result = await harness.service.beginSubmission(
        sequenceSubmission(),
        harness.manager,
      );
      expect(result.status).toBe(expected);
      expect(
        harness.calls.filter(({ sql }) => sql.includes('MATERIALIZED')),
      ).toHaveLength(1);
      if (expected === 'RESERVATION_WINDOW_EXPIRED') {
        expect(result).toMatchObject({
          currentState: 'RESERVED',
          receipt: { attemptState: 'RESERVED', capacityState: 'RESERVED' },
        });
        expect(
          harness.calls.some(({ sql }) => sql.trimStart().startsWith('UPDATE')),
        ).toBe(false);
      }
    },
  );

  it.each(['BLOCKED', 'ACCEPTED', 'DEFINITELY_UNACCEPTED', 'UNKNOWN'] as const)(
    'does not acquire, overwrite, release, or sample time from %s',
    async (attemptState) => {
      const receipt = receiptFrom(sequenceReservation(), { attemptState });
      const harness = createHarness({ row: receipt });
      await expect(
        harness.service.beginSubmission(sequenceSubmission(), harness.manager),
      ).resolves.toEqual({
        currentState: attemptState,
        receipt,
        status: 'NOT_ACQUIRED',
      });
      expect(harness.calls).toHaveLength(1);
    },
  );

  it('reads only the exact workspace receipt using the supplied runner', async () => {
    const receipt = receiptFrom(sequenceReservation());
    const harness = createHarness({ row: receipt });
    await expect(
      harness.service.getReceipt(
        { attemptId: ids.attempt, workspaceId: ids.workspace },
        harness.manager,
      ),
    ).resolves.toEqual(receipt);
    expect(harness.calls[0].params).toEqual([ids.workspace, ids.attempt]);
    expect(harness.calls[0].sql).not.toContain('FOR UPDATE');

    await expect(
      harness.service.getReceipt(
        { attemptId: ids.attempt, workspaceId: ids.campaign },
        harness.manager,
      ),
    ).resolves.toBeNull();
  });
});

describe('frozen outcome semantics', () => {
  it('keeps accepted distinct from verified projected SENT evidence', () => {
    const accepted = receiptFrom(sequenceReservation(), {
      attemptState: 'ACCEPTED',
    });
    expect(hasVerifiedSentEvidence(accepted)).toBe(false);
    expect(
      hasVerifiedSentEvidence({ ...accepted, projectedMessageId: ids.message }),
    ).toBe(true);
  });

  it('freezes capacity and retry meaning without implementing outcome methods', () => {
    expect(OUTBOUND_EMAIL_ATTEMPT_TRANSITIONS).toEqual({
      ACCEPTED: {
        capacityState: 'CONSUMED',
        compactSpacing: false,
        retryAutomatically: false,
      },
      BLOCKED: {
        capacityState: 'RELEASED',
        compactSpacing: false,
        retryAutomatically: false,
      },
      DEFINITELY_UNACCEPTED: {
        capacityState: 'RELEASED',
        compactSpacing: false,
        retryAutomatically: false,
      },
      UNKNOWN: {
        capacityState: 'PROVISIONAL_UNKNOWN',
        compactSpacing: false,
        retryAutomatically: false,
      },
      UNKNOWN_RESOLUTIONS: ['ACCEPTED', 'DEFINITELY_UNACCEPTED'],
    });
    expect(
      Object.getOwnPropertyNames(OutboundEmailAttemptService.prototype),
    ).toEqual([
      'constructor',
      'lockAttemptForReservation',
      'insertReservedAttempt',
      'beginSubmission',
      'getReceipt',
    ]);
  });
});
