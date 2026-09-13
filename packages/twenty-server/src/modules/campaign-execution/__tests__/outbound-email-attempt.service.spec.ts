import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type EntityManager, getMetadataArgsStorage } from 'typeorm';

import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import {
  OUTBOUND_EMAIL_ATTEMPT_TRANSITIONS,
  type AttemptOutcomeResult,
  type BeginOutboundEmailSubmissionInput,
  type BlockReservedAttemptBeforeProviderResult,
  type CampaignSequenceSubmissionInput,
  type CampaignTestSubmissionInput,
  type DirectSubmissionInput,
  type OutboundEmailAttemptReceipt,
  type OutboundEmailAttemptReservationIdentity,
  type RecordDefinitelyUnacceptedInput,
  type ReserveOutboundEmailAttemptInput,
  type UnknownAttemptOutcomeResult,
  hasVerifiedSentEvidence,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';
import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

const ids = {
  account: '22222222-2222-4222-8222-222222222222',
  activation: '13131313-1313-4313-8313-131313131313',
  attempt: '11111111-1111-4111-8111-111111111111',
  authorization: '33333333-3333-4333-8333-333333333333',
  campaign: '44444444-4444-4444-8444-444444444444',
  capability: '55555555-5555-4555-8555-555555555555',
  channel: '66666666-6666-4666-8666-666666666666',
  enrollment: '77777777-7777-4777-8777-777777777777',
  evidence: '88888888-8888-4888-8888-888888888888',
  execution: '14141414-1414-4414-8414-141414141414',
  message: '99999999-9999-4999-8999-999999999999',
  otherAccount: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  otherChannel: '12121212-1212-4212-8212-121212121212',
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

const pinnedTestReservation = (): OutboundEmailAttemptReservationIdentity => ({
  ...testReservation(),
  priorAcceptedEvidenceId: ids.evidence,
  selectionConstraintKind: 'PINNED_REPLY',
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
  projectedMessageThreadId: null,
  providerAcceptedAt: null,
  providerHeaderMessageId: null,
  providerMessageExternalId: null,
  reconciledProviderHeaderMessageId: null,
  providerThreadExternalId: null,
  resolvedThreadExternalId: null,
  providerDeliveredRecipients: null,
  providerMessageId: null,
  retryable: null,
  safeOutcomeReason: null,
  updatedAt: new Date('2026-03-10T14:00:00.000Z'),
  ...overrides,
});

const acceptedEvidence = (
  providerMessageId: string,
  projectedMessageId: string | null = null,
) => ({
  projectedMessageId,
  projectedMessageThreadId: projectedMessageId === null ? null : ids.evidence,
  providerDeliveredRecipients: {
    to: ['recipient@example.com'],
    cc: [],
    bcc: [],
  },
  providerHeaderMessageId: `<${providerMessageId}@example.com>`,
  providerMessageExternalId: providerMessageId,
  providerMessageId,
  providerThreadExternalId: 'provider-thread-1',
  resolvedThreadExternalId: 'provider-thread-1',
});

const sequenceSubmission = (): CampaignSequenceSubmissionInput => ({
  activationId: ids.activation,
  attemptId: ids.attempt,
  authorizationGeneration: 1,
  authorizationId: ids.authorization,
  campaignExecutionId: ids.execution,
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
    activationId: ids.activation,
    attemptId: ids.attempt,
    authorizationGeneration: 1,
    campaignExecutionId: ids.execution,
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
      activationId: ids.activation,
      authorizationGeneration: 1,
      authorizationId: ids.authorization,
      campaignExecutionId: ids.execution,
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

const pinnedTestSubmission = (): CampaignTestSubmissionInput => {
  const submission = testSubmission();

  submission.submissionCapability.reservationBinding = {
    ...submission.submissionCapability.reservationBinding,
    priorAcceptedEvidenceId: ids.evidence,
    selectionConstraintKind: 'PINNED_REPLY',
  };

  return submission;
};

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
  const pinnedTest: OutboundEmailAttemptReservationIdentity =
    pinnedTestReservation();
  // @ts-expect-error Campaign test cannot use explicit sender selection
  const explicitTest: OutboundEmailAttemptReservationIdentity = {
    ...testReservation(),
    selectionConstraintKind: 'EXPLICIT',
  };
  // @ts-expect-error pinned Campaign test requires non-null evidence
  const pinnedTestWithoutEvidence: OutboundEmailAttemptReservationIdentity = {
    ...testReservation(),
    priorAcceptedEvidenceId: null,
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

  const {
    claimedAt: _claimedAt,
    localDate: _localDate,
    slotAt: _slotAt,
    unknownAfter: _unknownAfter,
    ...request
  } = sequenceReservation();
  const reserveInput: ReserveOutboundEmailAttemptInput = {
    ...request,
    candidates: [],
    workspaceTimeZone: 'UTC',
  };
  // @ts-expect-error callers cannot supply a reservation local day
  reserveInput.localDate = '2026-03-10';
  // @ts-expect-error callers cannot supply the claim timestamp
  reserveInput.claimedAt = claimedAt;
  // @ts-expect-error callers cannot supply the spacing slot timestamp
  reserveInput.slotAt = slotAt;
  // @ts-expect-error callers cannot supply the unknown deadline
  reserveInput.unknownAfter = unknownAfter;

  const definiteInput: RecordDefinitelyUnacceptedInput = {
    ...sequenceSubmission(),
    safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
  };
  // @ts-expect-error retryability is derived from the reason and cannot be supplied
  definiteInput.retryable = true;

  const nonUnknownResult = undefined as unknown as AttemptOutcomeResult;
  // @ts-expect-error NOT_DUE is exclusive to unknown marking
  if (nonUnknownResult.status === 'NOT_DUE') void nonUnknownResult.receipt;
  const unknownResult = undefined as unknown as UnknownAttemptOutcomeResult;
  if (unknownResult.status === 'NOT_DUE') void unknownResult.receipt;
  const blockResult =
    undefined as unknown as BlockReservedAttemptBeforeProviderResult;
  if (blockResult.status === 'NOT_RESERVED') void blockResult.status;
  // @ts-expect-error provider outcome state is not exposed by the dedicated block result
  if (blockResult.status === 'INCOMPATIBLE_STATE') void blockResult.receipt;

  return [
    explicitSequence,
    pinnedTest,
    explicitTest,
    pinnedTestWithoutEvidence,
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
      'providerHeaderMessageId',
      'providerMessageExternalId',
      'reconciledProviderHeaderMessageId',
      'providerThreadExternalId',
      'resolvedThreadExternalId',
      'providerDeliveredRecipients',
      'safeOutcomeReason',
      'retryable',
      'projectedMessageId',
      'projectedMessageThreadId',
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
      `"source" = 'CAMPAIGN_TEST'\n      AND "selectionConstraintKind" IN ('ROTATE', 'PINNED_REPLY')`,
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

  it.each([
    ['missing pinned evidence', null],
    ['noncanonical pinned evidence', ids.workspace.toUpperCase()],
    ['malformed pinned evidence', 'not-a-uuid'],
  ])('rejects Campaign test %s before SQL', async (_label, evidence) => {
    const harness = createHarness();
    await expect(
      harness.service.lockAttemptForReservation(
        {
          ...pinnedTestReservation(),
          priorAcceptedEvidenceId: evidence,
        } as OutboundEmailAttemptReservationIdentity,
        harness.manager,
      ),
    ).rejects.toThrow('Invalid outbound email attempt input');
    expect(harness.query).not.toHaveBeenCalled();
  });

  it('accepts canonical pinned Campaign test evidence and takes the attempt fence', async () => {
    const harness = createHarness();

    await expect(
      harness.service.lockAttemptForReservation(
        pinnedTestReservation(),
        harness.manager,
      ),
    ).resolves.toEqual({ status: 'NEW' });
    expect(harness.calls.map(({ sql }) => sql)).toEqual([
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.stringContaining('FOR UPDATE'),
    ]);
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

  it('acquires a pinned Campaign test only with its exact nested evidence binding', async () => {
    const reservation = pinnedTestReservation();
    const receipt = receiptFrom(reservation);
    const submission = pinnedTestSubmission();
    const harness = createHarness({
      observedAt: new Date('2026-03-10T14:00:29.999Z'),
      row: receipt,
    });

    await expect(
      harness.service.beginSubmission(submission, harness.manager),
    ).resolves.toMatchObject({
      receipt: {
        priorAcceptedEvidenceId: ids.evidence,
        selectionConstraintKind: 'PINNED_REPLY',
      },
      status: 'PROCESSING_ACQUIRED',
    });

    const mismatchedEvidence = {
      ...submission.submissionCapability.reservationBinding,
      priorAcceptedEvidenceId: ids.proof,
      selectionConstraintKind: 'PINNED_REPLY' as const,
    };
    const mismatchHarness = createHarness({ row: receipt });

    await expect(
      mismatchHarness.service.beginSubmission(
        {
          ...submission,
          submissionCapability: {
            ...submission.submissionCapability,
            reservationBinding: mismatchedEvidence,
          },
        },
        mismatchHarness.manager,
      ),
    ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
    expect(mismatchHarness.calls).toHaveLength(1);

    for (const reservationBinding of [
      {
        ...submission.submissionCapability.reservationBinding,
        priorAcceptedEvidenceId: null,
      },
      {
        ...submission.submissionCapability.reservationBinding,
        priorAcceptedEvidenceId: ids.workspace.toUpperCase(),
      },
      {
        ...submission.submissionCapability.reservationBinding,
        priorAcceptedEvidenceId: null,
        selectionConstraintKind: 'EXPLICIT',
      },
    ]) {
      const invalidHarness = createHarness({ row: receipt });

      await expect(
        invalidHarness.service.beginSubmission(
          {
            ...submission,
            submissionCapability: {
              ...submission.submissionCapability,
              reservationBinding,
            },
          } as CampaignTestSubmissionInput,
          invalidHarness.manager,
        ),
      ).rejects.toThrow('Invalid outbound email submission input');
      expect(invalidHarness.calls).toHaveLength(0);
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

  it('freezes capacity and retry meaning for every outcome method', () => {
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
      'reserveWithMailboxCapacity',
      'lockAttemptForReservation',
      'insertReservedAttempt',
      'beginSubmission',
      'blockReservedAttemptBeforeProvider',
      'recheckProcessingWindowBeforeProvider',
      'recordAccepted',
      'recordDefinitelyUnaccepted',
      'markUnknownAfterDeadline',
      'resolveUnknownAccepted',
      'resolveUnknownDefinitelyUnaccepted',
      'getReceipt',
      'recordAcceptedFromState',
      'recordDefinitelyUnacceptedFromState',
      'requirePositiveReservationCount',
      'sampleObservedAt',
      'isExpectedSender',
      'insertReservedRow',
    ]);
  });
});

describe('OutboundEmailAttemptService atomic capacity composition', () => {
  const sender: ReadyCampaignSenderReadiness = {
    bindingStatus: 'RESOLVED_BINDING',
    campaignAccountId: 'campaign-account',
    connectedAccountId: ids.account,
    dailySendLimit: 50,
    messageChannelId: ids.channel,
    minimumSendIntervalMs: 300_000,
    missingBinding: null,
    provider: ConnectedAccountProvider.GOOGLE,
    reason: null,
    recoveryPath: null,
    senderHandle: 'sender@example.com',
    status: 'READY',
  };
  const reserveInput = (): ReserveOutboundEmailAttemptInput => {
    const {
      claimedAt: _claimedAt,
      localDate: _localDate,
      slotAt: _slotAt,
      unknownAfter: _unknownAfter,
      ...request
    } = sequenceReservation();

    return {
      ...request,
      candidates: [sender],
      workspaceTimeZone: 'America/New_York',
    };
  };
  const locked = (observedAt: Date) => ({
    acceptedCount: 0,
    earliestEligibleAt: observedAt,
    localDate: '2026-03-10',
    nextEligibleAt: null,
    nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
    reservedCount: 0,
    sender,
  });

  const capacityMock = (finalAt = claimedAt) => {
    const initialSelected = locked(new Date(finalAt.getTime() - 1_000));
    const finalSelected = locked(finalAt);

    return {
      consumeReserved: jest.fn(),
      incrementReservedAndAdvanceClock: jest.fn(),
      lockAndRankForReservation: jest.fn(async () => ({
        lockedCandidates: [initialSelected],
        observedAt: initialSelected.earliestEligibleAt,
        selected: initialSelected,
        status: 'ELIGIBLE_NOW' as const,
      })),
      lockReservationDay: jest.fn(async () => ({
        acceptedCount: 0,
        connectedAccountId: ids.account,
        localDate: '2026-03-10',
        reservedCount: 0,
        workspaceId: ids.workspace,
      })),
      releaseReserved: jest.fn(),
      revalidateForReservationMutation: jest.fn(async () => ({
        lockedCandidates: [finalSelected],
        observedAt: finalAt,
        selected: finalSelected,
        status: 'ELIGIBLE_NOW' as const,
      })),
    };
  };

  it('reserves once using only the decisive capacity sample and structured capacity mutations', async () => {
    const finalAt = new Date('2026-03-10T14:02:02.000Z');
    const capacity = capacityMock(finalAt);
    let row: OutboundEmailAttemptReceipt | null = null;
    const sqlOrder: string[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        sqlOrder.push('attempt-fence');
        return [{ locked: true }];
      }
      if (sql.includes('FROM "core"."outboundEmailAttempt"')) {
        sqlOrder.push('attempt-lock');
        return row === null ? [] : [row];
      }
      if (sql.includes('MATERIALIZED')) {
        return [{ observedAt: new Date(finalAt.getTime() + 1_000) }];
      }
      if (sql.includes('UPDATE "core"."outboundEmailAttempt"')) {
        if (row === null) throw new Error('Missing reserved row');
        row = {
          ...row,
          attemptState: 'PROCESSING',
          finalEvidenceDigest: params[2] as string,
          updatedAt: params[3] as Date,
        };
        return { affected: 1, records: [row] };
      }
      if (sql.includes('INSERT INTO "core"."outboundEmailAttempt"')) {
        sqlOrder.push('attempt-insert');
        const columns = [
          ...sql
            .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
            .matchAll(/"([^"]+)"/g),
        ].map(([, column]) => column);
        row = {
          ...Object.fromEntries(
            columns.map((column, index) => [column, params[index]]),
          ),
          createdAt: finalAt,
          updatedAt: finalAt,
        } as unknown as OutboundEmailAttemptReceipt;
        return [row];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    // SAFETY: this strict mock implements every public capacity method exercised by the composition.
    const service = new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    );
    const result = await service.reserveWithMailboxCapacity(reserveInput(), {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager);

    expect(result.status).toBe('RESERVED');
    if (result.status !== 'RESERVED') return;
    expect(result.receipt.claimedAt).toEqual(finalAt);
    expect(result.receipt.slotAt).toEqual(finalAt);
    expect(result.receipt.unknownAfter).toEqual(
      new Date(finalAt.getTime() + 60_000),
    );
    expect(sqlOrder).toEqual([
      'attempt-fence',
      'attempt-lock',
      'attempt-insert',
    ]);
    expect(capacity.incrementReservedAndAdvanceClock).toHaveBeenCalledTimes(1);
    expect(capacity.incrementReservedAndAdvanceClock).toHaveBeenCalledWith(
      expect.objectContaining({ slotAt: finalAt }),
      expect.anything(),
    );

    const submission = sequenceSubmission();
    submission.submissionCapability.reservationBinding = {
      attemptNumber: result.receipt.attemptNumber as number,
      claimedAt: result.receipt.claimedAt,
      localDate: result.receipt.localDate,
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: result.receipt
        .selectionConstraintKind as 'ROTATE',
      senderPoolFingerprint: result.receipt.senderPoolFingerprint as string,
      slotAt: result.receipt.slotAt,
      unknownAfter: result.receipt.unknownAfter,
    };
    const processing = await service.beginSubmission(submission, {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager);

    expect(processing.status).toBe('PROCESSING_ACQUIRED');
  });

  it('gives exact replay precedence over changed timezone and unavailable candidates', async () => {
    const existing = receiptFrom(sequenceReservation(), {
      attemptState: 'UNKNOWN',
      capacityState: 'PROVISIONAL_UNKNOWN',
      finalEvidenceDigest: digestB,
      retryable: false,
      safeOutcomeReason: 'PROVIDER_OUTCOME_UNCONFIRMED',
    });
    const capacity = capacityMock();
    const query = jest.fn(async (sql: string) =>
      sql.includes('pg_advisory_xact_lock') ? [{ locked: true }] : [existing],
    );
    const input = reserveInput();
    input.workspaceTimeZone = 'Invalid/Changed';
    input.candidates = [];
    const result = await new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    ).reserveWithMailboxCapacity(input, {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager);

    expect(result).toEqual({ receipt: existing, status: 'EXACT_REPLAY' });
    expect(capacity.lockAndRankForReservation).not.toHaveBeenCalled();
  });

  it('returns stale when the final decisive rerank changes the winner and writes no attempt', async () => {
    const other = { ...sender, connectedAccountId: ids.evidence };
    const capacity = capacityMock();
    capacity.revalidateForReservationMutation.mockResolvedValue({
      lockedCandidates: [{ ...locked(claimedAt), sender: other }],
      observedAt: claimedAt,
      selected: { ...locked(claimedAt), sender: other },
      status: 'ELIGIBLE_NOW',
    });
    const query = jest.fn(async (sql: string) =>
      sql.includes('pg_advisory_xact_lock') ? [{ locked: true }] : [],
    );
    const result = await new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    ).reserveWithMailboxCapacity(reserveInput(), {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager);

    expect(result).toEqual({ status: 'STALE_PROJECTION' });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO')),
    ).toBe(false);
    expect(capacity.incrementReservedAndAdvanceClock).not.toHaveBeenCalled();
  });

  it('relies on caller rollback when a capacity mutation fails after attempt insertion', async () => {
    const capacity = capacityMock();
    const aggregate = {
      nextEligibleAt: null as Date | null,
      reservedCount: 0,
    };
    capacity.incrementReservedAndAdvanceClock.mockImplementation(async () => {
      aggregate.reservedCount += 1;
      aggregate.nextEligibleAt = new Date('2026-03-10T14:05:00.000Z');
      throw new Error('clock structured result mismatch');
    });
    let row: OutboundEmailAttemptReceipt | null = null;
    const before = {
      nextEligibleAt: aggregate.nextEligibleAt,
      reservedCount: aggregate.reservedCount,
      row,
    };
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('pg_advisory_xact_lock')) return [{ locked: true }];
      if (sql.includes('FROM "core"."outboundEmailAttempt"'))
        return row === null ? [] : [row];
      if (sql.includes('INSERT INTO "core"."outboundEmailAttempt"')) {
        const columns = [
          ...sql
            .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
            .matchAll(/"([^"]+)"/g),
        ].map(([, column]) => column);
        row = {
          ...Object.fromEntries(
            columns.map((column, index) => [column, params[index]]),
          ),
          createdAt: claimedAt,
          updatedAt: claimedAt,
        } as unknown as OutboundEmailAttemptReceipt;
        return [row];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const service = new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    );

    await expect(
      (async () => {
        try {
          return await service.reserveWithMailboxCapacity(reserveInput(), {
            queryRunner: { isTransactionActive: true, query },
          } as unknown as EntityManager);
        } catch (error) {
          row = before.row;
          aggregate.reservedCount = before.reservedCount;
          aggregate.nextEligibleAt = before.nextEligibleAt;
          throw error;
        }
      })(),
    ).rejects.toThrow('clock structured result mismatch');
    expect(row).toBeNull();
    expect(aggregate).toEqual({ nextEligibleAt: null, reservedCount: 0 });
  });

  it('records accepted only after identity, final-digest, day-lock, and post-lock DB time fences', async () => {
    const input = {
      ...sequenceSubmission(),
      ...acceptedEvidence('provider-1'),
    };
    let row = receiptFrom(sequenceReservation(), {
      attemptState: 'PROCESSING',
      capacityState: 'RESERVED',
      finalEvidenceDigest: digestB,
    });
    const capacity = capacityMock();
    const order: string[] = [];
    capacity.lockReservationDay.mockImplementation(async () => {
      order.push('day-lock');
      return {
        acceptedCount: 0,
        connectedAccountId: ids.account,
        localDate: '2026-03-10',
        reservedCount: 1,
        workspaceId: ids.workspace,
      };
    });
    capacity.consumeReserved.mockImplementation(async () => {
      order.push('day-consume');
    });
    const acceptedAt = new Date('2026-03-10T14:00:30.000Z');
    const query = jest.fn(
      async (sql: string, params: unknown[] = [], structured?: boolean) => {
        if (sql.includes('FROM "core"."outboundEmailAttempt"')) return [row];
        if (sql.includes('MATERIALIZED')) {
          order.push('time-sample');
          return [{ observedAt: acceptedAt }];
        }
        if (sql.includes('SET "attemptState" = \'ACCEPTED\'')) {
          expect(structured).toBe(true);
          order.push('attempt-cas');
          row = {
            ...row,
            attemptState: 'ACCEPTED',
            capacityState: 'CONSUMED',
            projectedMessageId: params[4] as null,
            projectedMessageThreadId: params[10] as null,
            providerAcceptedAt: params[3] as Date,
            providerDeliveredRecipients: params[9] as {
              to: string[];
              cc: string[];
              bcc: string[];
            },
            providerHeaderMessageId: params[5] as string,
            providerMessageExternalId: params[6] as string,
            providerMessageId: params[2] as string,
            providerThreadExternalId: params[7] as string,
            resolvedThreadExternalId: params[8] as string,
            retryable: false,
            safeOutcomeReason: null,
            updatedAt: params[3] as Date,
          };
          return { affected: 1, records: [row] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );
    const result = await new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    ).recordAccepted(input, {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager);

    expect(result.status).toBe('RECORDED');
    expect(order).toEqual([
      'day-lock',
      'time-sample',
      'attempt-cas',
      'day-consume',
    ]);
    if (result.status === 'RECORDED') {
      expect(hasVerifiedSentEvidence(result.receipt)).toBe(false);
    }
  });

  it('rejects a changed winning final digest before reservation-day SQL', async () => {
    const input = {
      ...sequenceSubmission(),
      ...acceptedEvidence('provider-1'),
    };
    const row = receiptFrom(sequenceReservation(), {
      attemptState: 'PROCESSING',
      capacityState: 'RESERVED',
      finalEvidenceDigest: digest,
    });
    const capacity = capacityMock();
    const query = jest.fn(async () => [row]);
    const result = await new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    ).recordAccepted(input, {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager);

    expect(result).toEqual({ status: 'IDENTITY_CONFLICT' });
    expect(capacity.lockReservationDay).not.toHaveBeenCalled();
  });

  it('marks unknown only from a post-day-lock sample at the immutable deadline without releasing capacity', async () => {
    const input = sequenceSubmission();
    let row = receiptFrom(sequenceReservation(), {
      attemptState: 'PROCESSING',
      capacityState: 'RESERVED',
      finalEvidenceDigest: digestB,
    });
    const capacity = capacityMock();
    capacity.lockReservationDay.mockResolvedValue({
      acceptedCount: 0,
      connectedAccountId: ids.account,
      localDate: '2026-03-10',
      reservedCount: 1,
      workspaceId: ids.workspace,
    });
    const query = jest.fn(
      async (sql: string, _params: unknown[] = [], structured?: boolean) => {
        if (sql.includes('FROM "core"."outboundEmailAttempt"')) return [row];
        if (sql.includes('MATERIALIZED')) return [{ observedAt: unknownAfter }];
        if (sql.includes('SET "attemptState" = \'UNKNOWN\'')) {
          expect(structured).toBe(true);
          row = {
            ...row,
            attemptState: 'UNKNOWN',
            capacityState: 'PROVISIONAL_UNKNOWN',
            retryable: false,
            safeOutcomeReason: 'PROVIDER_OUTCOME_UNCONFIRMED',
            updatedAt: _params[2] as Date,
          };
          return { affected: 1, records: [row] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );
    const result = await new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    ).markUnknownAfterDeadline(input, {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager);

    expect(result.status).toBe('RECORDED');
    expect(capacity.releaseReserved).not.toHaveBeenCalled();
    expect(capacity.consumeReserved).not.toHaveBeenCalled();
  });

  it('blocks a reserved attempt once, releases its immutable day, and preserves spacing', async () => {
    let row = receiptFrom(sequenceReservation());
    const capacity = capacityMock();
    capacity.lockReservationDay.mockResolvedValue({
      acceptedCount: 0,
      connectedAccountId: ids.account,
      localDate: '2026-03-10',
      reservedCount: 1,
      workspaceId: ids.workspace,
    });
    const query = jest.fn(
      async (sql: string, _params: unknown[] = [], structured?: boolean) => {
        if (sql.includes('FROM "core"."outboundEmailAttempt"')) return [row];
        if (sql.includes('MATERIALIZED')) return [{ observedAt: claimedAt }];
        if (sql.includes('SET "attemptState" = \'BLOCKED\'')) {
          expect(structured).toBe(true);
          row = {
            ...row,
            attemptState: 'BLOCKED',
            capacityState: 'RELEASED',
            retryable: false,
            safeOutcomeReason: _params[2] as string,
            updatedAt: _params[3] as Date,
          };
          return { affected: 1, records: [row] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );
    const service = new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    );
    const manager = {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager;
    const input = {
      reason: 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL' as const,
      reservation: sequenceReservation(),
    };

    expect(
      await service.blockReservedAttemptBeforeProvider(input, manager),
    ).toMatchObject({
      receipt: {
        capacityState: 'RELEASED',
        safeOutcomeReason: 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL',
      },
      status: 'RECORDED',
    });
    expect(
      await service.blockReservedAttemptBeforeProvider(input, manager),
    ).toMatchObject({
      status: 'EXACT_REPLAY',
    });
    expect(capacity.releaseReserved).toHaveBeenCalledTimes(1);
    expect(capacity.incrementReservedAndAdvanceClock).not.toHaveBeenCalled();
  });

  it('rejects malformed persisted and DB-authored timestamps before capacity or CAS', async () => {
    const capacity = capacityMock();
    const malformedReplay = receiptFrom(sequenceReservation(), {
      slotAt: new Date('invalid'),
    });
    const replayQuery = jest.fn(async (sql: string) =>
      sql.includes('pg_advisory_xact_lock')
        ? [{ locked: true }]
        : [malformedReplay],
    );

    await expect(
      new OutboundEmailAttemptService(
        capacity as unknown as MailboxCapacityService,
      ).reserveWithMailboxCapacity(reserveInput(), {
        queryRunner: { isTransactionActive: true, query: replayQuery },
      } as unknown as EntityManager),
    ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
    expect(capacity.lockAndRankForReservation).not.toHaveBeenCalled();

    const accepted = receiptFrom(sequenceReservation(), {
      attemptState: 'ACCEPTED',
      capacityState: 'CONSUMED',
      ...acceptedEvidence('provider-1'),
      finalEvidenceDigest: digestB,
      providerAcceptedAt: new Date('invalid'),
      retryable: false,
    });
    const acceptedQuery = jest.fn(async () => [accepted]);
    await expect(
      new OutboundEmailAttemptService(
        capacity as unknown as MailboxCapacityService,
      ).recordAccepted(
        {
          ...sequenceSubmission(),
          ...acceptedEvidence('provider-1'),
        },
        {
          queryRunner: { isTransactionActive: true, query: acceptedQuery },
        } as unknown as EntityManager,
      ),
    ).resolves.toMatchObject({ status: 'EVIDENCE_CONFLICT' });

    const processing = receiptFrom(sequenceReservation(), {
      attemptState: 'PROCESSING',
      capacityState: 'RESERVED',
      finalEvidenceDigest: digestB,
    });
    capacity.lockReservationDay.mockResolvedValue({
      acceptedCount: 0,
      connectedAccountId: ids.account,
      localDate: '2026-03-10',
      reservedCount: 1,
      workspaceId: ids.workspace,
    });
    const invalidSampleQuery = jest.fn(async (sql: string) =>
      sql.includes('FROM "core"."outboundEmailAttempt"')
        ? [processing]
        : [{ observedAt: new Date('invalid') }],
    );
    await expect(
      new OutboundEmailAttemptService(
        capacity as unknown as MailboxCapacityService,
      ).recordAccepted(
        {
          ...sequenceSubmission(),
          ...acceptedEvidence('provider-1'),
        },
        {
          queryRunner: { isTransactionActive: true, query: invalidSampleQuery },
        } as unknown as EntityManager,
      ),
    ).rejects.toThrow('Invalid outbound email attempt time sample');
    expect(
      invalidSampleQuery.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE "core"."outboundEmailAttempt"'),
      ),
    ).toBe(false);
  });

  it('returns NOT_RESERVED for an exact PROCESSING block lost race before day SQL', async () => {
    const row = receiptFrom(sequenceReservation(), {
      attemptState: 'PROCESSING',
      capacityState: 'RESERVED',
      finalEvidenceDigest: digestB,
    });
    const capacity = capacityMock();
    const query = jest.fn(async () => [row]);
    const result = await new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    ).blockReservedAttemptBeforeProvider(
      {
        reason: 'STALE_FINAL_EVIDENCE',
        reservation: sequenceReservation(),
      },
      {
        queryRunner: { isTransactionActive: true, query },
      } as unknown as EntityManager,
    );

    expect(result).toEqual({ status: 'NOT_RESERVED' });
    expect(capacity.lockReservationDay).not.toHaveBeenCalled();
  });

  it('persists only a frozen definite reason/retry pair and distinguishes replay from conflict', async () => {
    let row = receiptFrom(sequenceReservation(), {
      attemptState: 'PROCESSING',
      capacityState: 'RESERVED',
      finalEvidenceDigest: digestB,
    });
    const capacity = capacityMock();
    capacity.lockReservationDay.mockResolvedValue({
      acceptedCount: 0,
      connectedAccountId: ids.account,
      localDate: '2026-03-10',
      reservedCount: 1,
      workspaceId: ids.workspace,
    });
    const query = jest.fn(
      async (sql: string, params: unknown[] = [], structured?: boolean) => {
        if (sql.includes('FROM "core"."outboundEmailAttempt"')) return [row];
        if (sql.includes('MATERIALIZED')) return [{ observedAt: claimedAt }];
        if (sql.includes('SET "attemptState" = \'DEFINITELY_UNACCEPTED\'')) {
          expect(structured).toBe(true);
          row = {
            ...row,
            attemptState: 'DEFINITELY_UNACCEPTED',
            capacityState: 'RELEASED',
            retryable: params[3] as boolean,
            safeOutcomeReason: params[2] as string,
            updatedAt: params[4] as Date,
          };
          return { affected: 1, records: [row] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    );
    const service = new OutboundEmailAttemptService(
      capacity as unknown as MailboxCapacityService,
    );
    const manager = {
      queryRunner: { isTransactionActive: true, query },
    } as unknown as EntityManager;
    const input = {
      ...sequenceSubmission(),
      safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE' as const,
    };

    expect(
      await service.recordDefinitelyUnaccepted(input, manager),
    ).toMatchObject({
      status: 'RECORDED',
    });
    expect(
      await service.recordDefinitelyUnaccepted(input, manager),
    ).toMatchObject({
      status: 'EXACT_REPLAY',
    });
    expect(
      await service.recordDefinitelyUnaccepted(
        {
          ...input,
          safeOutcomeReason: 'DEFINITELY_UNACCEPTED_NON_RETRYABLE',
        },
        manager,
      ),
    ).toMatchObject({ status: 'EVIDENCE_CONFLICT' });
    expect(capacity.releaseReserved).toHaveBeenCalledTimes(1);
  });
});

type StatefulFaultFamily =
  | 'attemptInsert'
  | 'dayIncrement'
  | 'clockAdvance'
  | 'blockCas'
  | 'acceptedCas'
  | 'definiteCas'
  | 'unknownCas'
  | 'dayRelease'
  | 'dayConsume';
type StatefulFaultMode =
  | 'throw'
  | 'zero'
  | 'multiple'
  | 'malformed'
  | 'missingUpdatedAt'
  | 'wrongUpdatedAt'
  | 'wrongCreatedAt';
type StatefulDay = {
  acceptedCount: number;
  connectedAccountId: string;
  localDate: string;
  reservedCount: number;
  workspaceId: string;
};
type StatefulClock = {
  connectedAccountId: string;
  nextEligibleAt: Date | null;
  workspaceId: string;
};
type StatefulSample = {
  localDate: string;
  nextLocalMidnightAt: Date;
  observedAt: Date;
};

const createStatefulCompositionHarness = (options?: {
  samples?: StatefulSample[];
  faults?: Partial<Record<StatefulFaultFamily, StatefulFaultMode>>;
  dayReadFault?: {
    connectedAccountId: string;
    localDate: string;
    returnedLocalDate: string | null;
  };
}) => {
  const attempts = new Map<string, OutboundEmailAttemptReceipt>();
  const clocks = new Map<string, StatefulClock>();
  const days = new Map<string, StatefulDay>();
  const calls: Array<{
    params: unknown[];
    sql: string;
    structured?: boolean;
  }> = [];
  const faults = { ...options?.faults };
  const samples = [...(options?.samples ?? [])];
  const fallbackSample: StatefulSample = {
    localDate: '2026-03-10',
    nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
    observedAt: claimedAt,
  };
  const dayKey = (workspace: string, account: string, day: string) =>
    `${workspace}:${account}:${day}`;
  const clockKey = (workspace: string, account: string) =>
    `${workspace}:${account}`;
  const clone = <Value>(value: Value): Value => {
    if (value instanceof Date) return new Date(value.getTime()) as Value;
    if (Array.isArray(value)) {
      return value.map((item) => clone(item)) as Value;
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, clone(item)]),
      ) as Value;
    }

    return value;
  };
  const consumeFault = (family: StatefulFaultFamily) => {
    const mode = faults[family];

    delete faults[family];

    return mode;
  };
  const structuredResult = (
    family: StatefulFaultFamily,
    record: Record<string, unknown> | null,
  ) => {
    const mode = consumeFault(family);

    if (mode === 'throw') throw new Error(`${family} injected failure`);
    if (mode === 'zero' || record === null) {
      return { affected: 0, records: [] };
    }
    if (mode === 'multiple') {
      return { affected: 2, records: [clone(record), clone(record)] };
    }
    if (mode === 'malformed') {
      return {
        affected: 1,
        records: [{ ...clone(record), connectedAccountId: ids.evidence }],
      };
    }
    if (mode === 'missingUpdatedAt') {
      const malformed = { ...clone(record) };

      delete malformed.updatedAt;

      return { affected: 1, records: [malformed] };
    }
    if (mode === 'wrongUpdatedAt') {
      return {
        affected: 1,
        records: [{ ...clone(record), updatedAt: new Date(0) }],
      };
    }
    if (mode === 'wrongCreatedAt') {
      return {
        affected: 1,
        records: [{ ...clone(record), createdAt: new Date(0) }],
      };
    }

    return { affected: 1, records: [clone(record)] };
  };
  const query = jest.fn(
    async (
      sql: string,
      params: unknown[] = [],
      structured?: boolean,
    ): Promise<unknown> => {
      calls.push({ params: clone(params), sql, structured });

      if (sql.includes('pg_advisory_xact_lock')) return [{ locked: true }];

      if (sql.includes('INSERT INTO "core"."mailboxDispatchClock"')) {
        const key = clockKey(params[0] as string, params[1] as string);

        if (!clocks.has(key)) {
          clocks.set(key, {
            connectedAccountId: params[1] as string,
            nextEligibleAt: null,
            workspaceId: params[0] as string,
          });
        }

        return [];
      }

      if (sql.includes('FROM "core"."mailboxDispatchClock"')) {
        const row = clocks.get(
          clockKey(params[0] as string, params[1] as string),
        );

        return row === undefined ? [] : [clone(row)];
      }

      if (sql.includes('MATERIALIZED')) {
        return [samples.shift() ?? fallbackSample];
      }

      if (sql.includes('INSERT INTO "core"."mailboxCapacityDay"')) {
        const key = dayKey(
          params[0] as string,
          params[1] as string,
          params[2] as string,
        );

        if (!days.has(key)) {
          days.set(key, {
            acceptedCount: 0,
            connectedAccountId: params[1] as string,
            localDate: params[2] as string,
            reservedCount: 0,
            workspaceId: params[0] as string,
          });
        }

        return [];
      }

      if (sql.includes('FROM "core"."mailboxCapacityDay"')) {
        const row = days.get(
          dayKey(params[0] as string, params[1] as string, params[2] as string),
        );

        if (row === undefined) return [];
        // SAFETY: the fake intentionally corrupts a selected database column.
        const returned = clone(row) as unknown as Record<string, unknown>;

        if (
          options?.dayReadFault?.connectedAccountId ===
            row.connectedAccountId &&
          options.dayReadFault.localDate === row.localDate
        ) {
          if (options.dayReadFault.returnedLocalDate === null) {
            delete returned.localDate;
          } else {
            returned.localDate = options.dayReadFault.returnedLocalDate;
          }
        }

        return [returned];
      }

      if (sql.includes('INSERT INTO "core"."outboundEmailAttempt"')) {
        const columns = [
          ...sql
            .slice(sql.indexOf('(') + 1, sql.indexOf(') VALUES'))
            .matchAll(/"([^"]+)"/g),
        ].map(([, column]) => column);
        const inserted = {
          ...Object.fromEntries(
            columns.map((column, index) => [column, params[index]]),
          ),
          createdAt: params[14],
          updatedAt: params[14],
        } as unknown as OutboundEmailAttemptReceipt;
        const mode = consumeFault('attemptInsert');

        if (mode === 'throw') throw new Error('attemptInsert injected failure');
        attempts.set(inserted.attemptId, clone(inserted));
        if (mode === 'zero') return [];
        if (mode === 'multiple') return [clone(inserted), clone(inserted)];
        if (mode === 'malformed') {
          return [{ ...clone(inserted), connectedAccountId: ids.evidence }];
        }

        return [clone(inserted)];
      }

      if (sql.includes('UPDATE "core"."mailboxCapacityDay"')) {
        const key = dayKey(
          params[0] as string,
          params[1] as string,
          params[2] as string,
        );
        const row = days.get(key);

        if (row === undefined) return { affected: 0, records: [] };
        let family: StatefulFaultFamily;

        if (sql.includes('"acceptedCount" = "acceptedCount" + 1')) {
          family = 'dayConsume';
          if (row.reservedCount > 0) {
            row.reservedCount -= 1;
            row.acceptedCount += 1;
          }
        } else if (sql.includes('"reservedCount" = "reservedCount" + 1')) {
          family = 'dayIncrement';
          row.reservedCount += 1;
        } else {
          family = 'dayRelease';
          if (row.reservedCount > 0) row.reservedCount -= 1;
        }

        return structuredResult(family, row);
      }

      if (sql.includes('UPDATE "core"."mailboxDispatchClock"')) {
        const key = clockKey(params[0] as string, params[1] as string);
        const row = clocks.get(key);

        if (row === undefined) return { affected: 0, records: [] };
        const requested = params[3] as Date;

        if (
          row.nextEligibleAt === null ||
          row.nextEligibleAt.getTime() < requested.getTime()
        ) {
          row.nextEligibleAt = requested;
        }

        return structuredResult('clockAdvance', row);
      }

      if (sql.includes('UPDATE "core"."outboundEmailAttempt"')) {
        const row = attempts.get(params[1] as string);

        if (row === undefined) return { affected: 0, records: [] };
        let family: StatefulFaultFamily;
        let updated: OutboundEmailAttemptReceipt | null = null;

        if (sql.includes('SET "attemptState" = \'PROCESSING\'')) {
          if (row.attemptState === 'RESERVED') {
            updated = {
              ...row,
              attemptState: 'PROCESSING',
              finalEvidenceDigest: params[2] as string,
              updatedAt: params[3] as Date,
            };
          }
          if (updated !== null) attempts.set(row.attemptId, clone(updated));

          return structuredResult('acceptedCas', updated);
        }

        if (sql.includes('SET "attemptState" = \'BLOCKED\'')) {
          family = 'blockCas';
          if (
            row.attemptState === 'RESERVED' &&
            row.capacityState === 'RESERVED'
          ) {
            updated = {
              ...row,
              attemptState: 'BLOCKED',
              capacityState: 'RELEASED',
              retryable: false,
              safeOutcomeReason: params[2] as string,
              updatedAt: params[3] as Date,
            };
          }
        } else if (sql.includes('SET "attemptState" = \'ACCEPTED\'')) {
          family = 'acceptedCas';
          if (
            row.attemptState === params[11] &&
            row.capacityState === params[12]
          ) {
            const campaignEvidence = row.source === 'CAMPAIGN_SEQUENCE';

            updated = {
              ...row,
              attemptState: 'ACCEPTED',
              capacityState: 'CONSUMED',
              projectedMessageId: null,
              projectedMessageThreadId: null,
              providerAcceptedAt: params[3] as Date,
              providerDeliveredRecipients: campaignEvidence
                ? (params[9] as {
                    to: string[];
                    cc: string[];
                    bcc: string[];
                  } | null)
                : null,
              providerHeaderMessageId: campaignEvidence
                ? (params[5] as string | null)
                : null,
              providerMessageExternalId: campaignEvidence
                ? (params[6] as string | null)
                : null,
              providerMessageId: params[2] as string,
              providerThreadExternalId: campaignEvidence
                ? (params[7] as string | null)
                : null,
              resolvedThreadExternalId: campaignEvidence
                ? (params[8] as string | null)
                : null,
              retryable: false,
              safeOutcomeReason: null,
              updatedAt: params[3] as Date,
            };
          }
        } else if (
          sql.includes('SET "attemptState" = \'DEFINITELY_UNACCEPTED\'')
        ) {
          family = 'definiteCas';
          if (
            row.attemptState === params[5] &&
            row.capacityState === params[6]
          ) {
            updated = {
              ...row,
              attemptState: 'DEFINITELY_UNACCEPTED',
              capacityState: 'RELEASED',
              retryable: params[3] as boolean,
              safeOutcomeReason: params[2] as string,
              updatedAt: params[4] as Date,
            };
          }
        } else {
          family = 'unknownCas';
          if (
            row.attemptState === 'PROCESSING' &&
            row.capacityState === 'RESERVED'
          ) {
            updated = {
              ...row,
              attemptState: 'UNKNOWN',
              capacityState: 'PROVISIONAL_UNKNOWN',
              retryable: false,
              safeOutcomeReason: 'PROVIDER_OUTCOME_UNCONFIRMED',
              updatedAt: params[2] as Date,
            };
          }
        }

        if (updated !== null) attempts.set(row.attemptId, clone(updated));

        return structuredResult(family, updated);
      }

      if (sql.includes('FROM "core"."outboundEmailAttempt"')) {
        const attemptId = sql.includes('"workspaceId" = $1')
          ? (params[1] as string)
          : (params[0] as string);
        const row = attempts.get(attemptId);

        if (
          row === undefined ||
          (sql.includes('"workspaceId" = $1') && row.workspaceId !== params[0])
        ) {
          return [];
        }

        return [clone(row)];
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
  );
  const manager = {
    queryRunner: { isTransactionActive: true, query },
  } as unknown as EntityManager;
  const service = new OutboundEmailAttemptService(new MailboxCapacityService());
  const snapshot = () => ({
    attempts: clone([...attempts.entries()]),
    clocks: clone([...clocks.entries()]),
    days: clone([...days.entries()]),
  });
  const transaction = async <Result>(work: () => Promise<Result>) => {
    const before = snapshot();

    try {
      return await work();
    } catch (error) {
      attempts.clear();
      clocks.clear();
      days.clear();
      for (const [key, value] of before.attempts) attempts.set(key, value);
      for (const [key, value] of before.clocks) clocks.set(key, value);
      for (const [key, value] of before.days) days.set(key, value);
      throw error;
    }
  };

  return {
    attempts,
    calls,
    clocks,
    days,
    faults,
    manager,
    samples,
    service,
    snapshot,
    transaction,
  };
};

const statefulSender: ReadyCampaignSenderReadiness = {
  bindingStatus: 'RESOLVED_BINDING',
  campaignAccountId: 'campaign-account',
  connectedAccountId: ids.account,
  dailySendLimit: 50,
  messageChannelId: ids.channel,
  minimumSendIntervalMs: 300_000,
  missingBinding: null,
  provider: ConnectedAccountProvider.GOOGLE,
  reason: null,
  recoveryPath: null,
  senderHandle: 'sender@example.com',
  status: 'READY',
};

const otherStatefulSender: ReadyCampaignSenderReadiness = {
  ...statefulSender,
  campaignAccountId: 'other-campaign-account',
  connectedAccountId: ids.otherAccount,
  messageChannelId: ids.otherChannel,
  senderHandle: 'other-sender@example.com',
};

const statefulReserveInput = (
  source: 'CAMPAIGN_SEQUENCE' | 'CAMPAIGN_TEST' | 'INBOX',
): ReserveOutboundEmailAttemptInput => {
  const full =
    source === 'CAMPAIGN_SEQUENCE'
      ? sequenceReservation()
      : source === 'CAMPAIGN_TEST'
        ? testReservation()
        : directReservation();
  const {
    claimedAt: _claimedAt,
    localDate: _localDate,
    slotAt: _slotAt,
    unknownAfter: _unknownAfter,
    ...request
  } = full;

  return {
    ...request,
    candidates: [statefulSender],
    workspaceTimeZone: 'America/New_York',
  } as ReserveOutboundEmailAttemptInput;
};

const statefulSubmission = (
  source: 'CAMPAIGN_SEQUENCE' | 'CAMPAIGN_TEST' | 'INBOX',
  receipt: OutboundEmailAttemptReceipt,
): BeginOutboundEmailSubmissionInput => {
  if (source === 'CAMPAIGN_SEQUENCE') {
    const input = sequenceSubmission();

    input.submissionCapability.reservationBinding = {
      attemptNumber: receipt.attemptNumber as number,
      claimedAt: receipt.claimedAt,
      localDate: receipt.localDate,
      priorAcceptedEvidenceId:
        receipt.selectionConstraintKind === 'PINNED_REPLY'
          ? (receipt.priorAcceptedEvidenceId as string)
          : null,
      selectionConstraintKind: receipt.selectionConstraintKind as
        | 'ROTATE'
        | 'PINNED_REPLY',
      senderPoolFingerprint: receipt.senderPoolFingerprint as string,
      slotAt: receipt.slotAt,
      unknownAfter: receipt.unknownAfter,
    } as CampaignSequenceSubmissionInput['submissionCapability']['reservationBinding'];

    return input;
  }
  if (source === 'CAMPAIGN_TEST') {
    const input = testSubmission();

    const selectionBinding =
      receipt.selectionConstraintKind === 'PINNED_REPLY'
        ? {
            priorAcceptedEvidenceId: receipt.priorAcceptedEvidenceId as string,
            selectionConstraintKind: 'PINNED_REPLY' as const,
          }
        : {
            priorAcceptedEvidenceId: null,
            selectionConstraintKind: 'ROTATE' as const,
          };

    input.submissionCapability.reservationBinding = {
      claimedAt: receipt.claimedAt,
      localDate: receipt.localDate,
      ...selectionBinding,
      senderPoolFingerprint: receipt.senderPoolFingerprint as string,
      slotAt: receipt.slotAt,
      unknownAfter: receipt.unknownAfter,
    };

    return input;
  }

  const input = directSubmission();

  input.submissionCapability.reservationBinding = {
    claimedAt: receipt.claimedAt,
    directReservationCapabilityId:
      receipt.directReservationCapabilityId as string,
    localDate: receipt.localDate,
    priorAcceptedEvidenceId: null,
    selectionConstraintKind: 'EXPLICIT',
    slotAt: receipt.slotAt,
    unknownAfter: receipt.unknownAfter,
  };

  return input;
};

const sameDaySamples = (count: number, start = claimedAt): StatefulSample[] =>
  Array.from({ length: count }, (_, index) => ({
    localDate: '2026-03-10',
    nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
    observedAt: new Date(start.getTime() + index * 1_000),
  }));

const expectedStatefulAttemptInsertParams = (
  source: 'CAMPAIGN_SEQUENCE' | 'CAMPAIGN_TEST' | 'INBOX',
  observedAt: Date,
): unknown[] => {
  const input = statefulReserveInput(source);
  const sourceFields =
    source === 'CAMPAIGN_SEQUENCE'
      ? [
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
        ]
      : source === 'CAMPAIGN_TEST'
        ? [
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
          ]
        : [
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
          ];

  return [
    ids.attempt,
    ids.workspace,
    source,
    'RESERVED',
    'RESERVED',
    ids.account,
    ids.channel,
    'google',
    'sender@example.com',
    input.normalizedRecipient,
    input.selectionConstraintKind,
    input.priorAcceptedEvidenceId,
    'senderPoolFingerprint' in input ? input.senderPoolFingerprint : null,
    '2026-03-10',
    observedAt,
    observedAt,
    new Date(observedAt.getTime() + 60_000),
    ...sourceFields,
    null,
    null,
    null,
    null,
    null,
    null,
  ];
};

const statefulSqlLabel = (sql: string): string => {
  if (sql.includes('pg_advisory')) return 'attempt-fence';
  if (sql.includes('FROM "core"."outboundEmailAttempt"')) {
    return 'attempt-lock';
  }
  if (sql.includes('INSERT INTO "core"."mailboxDispatchClock"')) {
    return 'clock-upsert';
  }
  if (sql.includes('FROM "core"."mailboxDispatchClock"')) return 'clock-lock';
  if (sql.includes('MATERIALIZED')) return 'time-sample';
  if (sql.includes('INSERT INTO "core"."mailboxCapacityDay"')) {
    return 'day-upsert';
  }
  if (sql.includes('FROM "core"."mailboxCapacityDay"')) return 'day-lock';
  if (sql.includes('INSERT INTO "core"."outboundEmailAttempt"')) {
    return 'attempt-insert';
  }
  if (sql.includes('UPDATE "core"."mailboxCapacityDay"')) {
    return 'day-increment';
  }
  if (sql.includes('UPDATE "core"."mailboxDispatchClock"')) {
    return 'clock-advance';
  }
  if (sql.includes('SET "attemptState" = \'PROCESSING\'')) {
    return 'processing-cas';
  }

  return 'unexpected';
};

describe('real-service stateful Task4B composition', () => {
  it.each(['CAMPAIGN_SEQUENCE', 'CAMPAIGN_TEST', 'INBOX'] as const)(
    'composes %s through PROCESSING with every SQL vector and result mode',
    async (source) => {
      const harness = createStatefulCompositionHarness({
        samples: sameDaySamples(3),
      });
      const reservedAt = new Date(claimedAt.getTime() + 1_000);
      const processingAt = new Date(claimedAt.getTime() + 2_000);
      const reserved = await harness.transaction(() =>
        harness.service.reserveWithMailboxCapacity(
          statefulReserveInput(source),
          harness.manager,
        ),
      );

      expect(reserved).toMatchObject({ status: 'RESERVED' });
      if (reserved.status !== 'RESERVED') return;
      const processing = await harness.transaction(() =>
        harness.service.beginSubmission(
          statefulSubmission(source, reserved.receipt),
          harness.manager,
        ),
      );

      expect(processing.status).toBe('PROCESSING_ACQUIRED');
      expect(
        harness.calls.map(({ params, sql, structured }) => ({
          label: statefulSqlLabel(sql),
          params,
          structured,
        })),
      ).toEqual([
        {
          label: 'attempt-fence',
          params: [`outbound-email-attempt:${ids.attempt}`, 322331],
          structured: undefined,
        },
        {
          label: 'attempt-lock',
          params: [ids.attempt],
          structured: undefined,
        },
        {
          label: 'clock-upsert',
          params: [ids.workspace, ids.account],
          structured: undefined,
        },
        {
          label: 'clock-lock',
          params: [ids.workspace, ids.account],
          structured: undefined,
        },
        {
          label: 'time-sample',
          params: ['America/New_York'],
          structured: undefined,
        },
        {
          label: 'day-upsert',
          params: [ids.workspace, ids.account, '2026-03-10'],
          structured: undefined,
        },
        {
          label: 'day-lock',
          params: [ids.workspace, ids.account, '2026-03-10'],
          structured: undefined,
        },
        {
          label: 'time-sample',
          params: ['America/New_York'],
          structured: undefined,
        },
        {
          label: 'clock-lock',
          params: [ids.workspace, ids.account],
          structured: undefined,
        },
        {
          label: 'day-lock',
          params: [ids.workspace, ids.account, '2026-03-10'],
          structured: undefined,
        },
        {
          label: 'day-lock',
          params: [ids.workspace, ids.account, '2026-03-10'],
          structured: undefined,
        },
        {
          label: 'attempt-insert',
          params: expectedStatefulAttemptInsertParams(source, reservedAt),
          structured: undefined,
        },
        {
          label: 'day-increment',
          params: [ids.workspace, ids.account, '2026-03-10'],
          structured: true,
        },
        {
          label: 'clock-advance',
          params: [
            ids.workspace,
            ids.account,
            reservedAt,
            new Date(reservedAt.getTime() + 300_000),
          ],
          structured: true,
        },
        {
          label: 'attempt-lock',
          params: [ids.attempt],
          structured: undefined,
        },
        {
          label: 'time-sample',
          params: [],
          structured: undefined,
        },
        {
          label: 'processing-cas',
          params: [ids.workspace, ids.attempt, digestB, processingAt],
          structured: true,
        },
      ]);
      expect(
        harness.days.get(`${ids.workspace}:${ids.account}:2026-03-10`),
      ).toMatchObject({
        acceptedCount: 0,
        reservedCount: 1,
      });
      expect(
        harness.clocks.get(`${ids.workspace}:${ids.account}`)?.nextEligibleAt,
      ).toEqual(new Date(reservedAt.getTime() + 300_000));
    },
  );

  it('uses a >60-second post-new-day-lock sample for attempt, day, and clock together', async () => {
    const final = new Date('2026-03-11T04:01:02.000Z');
    const harness = createStatefulCompositionHarness({
      samples: [
        {
          localDate: '2026-03-10',
          nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
          observedAt: new Date('2026-03-11T03:59:59.000Z'),
        },
        {
          localDate: '2026-03-11',
          nextLocalMidnightAt: new Date('2026-03-12T04:00:00.000Z'),
          observedAt: new Date('2026-03-11T04:00:01.000Z'),
        },
        {
          localDate: '2026-03-11',
          nextLocalMidnightAt: new Date('2026-03-12T04:00:00.000Z'),
          observedAt: final,
        },
      ],
    });
    const result = await harness.transaction(() =>
      harness.service.reserveWithMailboxCapacity(
        statefulReserveInput('CAMPAIGN_SEQUENCE'),
        harness.manager,
      ),
    );

    expect(result.status).toBe('RESERVED');
    if (result.status !== 'RESERVED') return;
    expect(result.receipt).toMatchObject({
      claimedAt: final,
      localDate: '2026-03-11',
      slotAt: final,
      unknownAfter: new Date(final.getTime() + 60_000),
    });
    expect(
      harness.days.get(`${ids.workspace}:${ids.account}:2026-03-11`),
    ).toMatchObject({
      reservedCount: 1,
    });
    expect(
      harness.clocks.get(`${ids.workspace}:${ids.account}`)?.nextEligibleAt,
    ).toEqual(new Date(final.getTime() + 300_000));
  });
});

type StatefulHarness = ReturnType<typeof createStatefulCompositionHarness>;

const reserveAndBeginStatefully = async (
  harness: StatefulHarness,
  source: 'CAMPAIGN_SEQUENCE' | 'CAMPAIGN_TEST' | 'INBOX' = 'CAMPAIGN_SEQUENCE',
) => {
  const reserved = await harness.transaction(() =>
    harness.service.reserveWithMailboxCapacity(
      statefulReserveInput(source),
      harness.manager,
    ),
  );

  if (reserved.status !== 'RESERVED') {
    throw new Error(`Expected reservation, received ${reserved.status}`);
  }
  const submission = statefulSubmission(source, reserved.receipt);
  const processing = await harness.transaction(() =>
    harness.service.beginSubmission(submission, harness.manager),
  );

  if (processing.status !== 'PROCESSING_ACQUIRED') {
    throw new Error(`Expected processing, received ${processing.status}`);
  }

  return { receipt: processing.receipt, submission };
};

const pushStatefulSample = (
  harness: StatefulHarness,
  observedAt: Date,
  localDate = '2026-03-10',
) => {
  harness.samples.push({
    localDate,
    nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
    observedAt,
  });
};

describe('real-service stateful Task4B outcomes and failures', () => {
  it('resolves UNKNOWN to accepted on its immutable day exactly once', async () => {
    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(3),
    });
    const { receipt, submission } = await reserveAndBeginStatefully(harness);

    pushStatefulSample(harness, receipt.unknownAfter);
    expect(
      await harness.transaction(() =>
        harness.service.markUnknownAfterDeadline(submission, harness.manager),
      ),
    ).toMatchObject({ status: 'RECORDED' });
    pushStatefulSample(
      harness,
      new Date(receipt.unknownAfter.getTime() + 1_000),
    );
    const resolved = await harness.transaction(() =>
      harness.service.resolveUnknownAccepted(
        {
          ...submission,
          ...acceptedEvidence('provider-unknown-accepted'),
        },
        harness.manager,
      ),
    );

    expect(resolved).toMatchObject({
      receipt: {
        attemptState: 'ACCEPTED',
        capacityState: 'CONSUMED',
        retryable: false,
      },
      status: 'RECORDED',
    });
    expect(
      harness.days.get(`${ids.workspace}:${ids.account}:2026-03-10`),
    ).toMatchObject({
      acceptedCount: 1,
      reservedCount: 0,
    });
    expect(
      await harness.service.resolveUnknownAccepted(
        {
          ...submission,
          ...acceptedEvidence('provider-unknown-accepted'),
        },
        harness.manager,
      ),
    ).toMatchObject({ status: 'EXACT_REPLAY' });
  });

  it.each([
    'DEFINITELY_UNACCEPTED_RETRYABLE',
    'DEFINITELY_UNACCEPTED_NON_RETRYABLE',
  ] as const)(
    'resolves UNKNOWN with reason-only %s and derives retryability',
    async (safeOutcomeReason) => {
      const harness = createStatefulCompositionHarness({
        samples: sameDaySamples(3),
      });
      const { receipt, submission } = await reserveAndBeginStatefully(harness);

      pushStatefulSample(harness, receipt.unknownAfter);
      await harness.transaction(() =>
        harness.service.markUnknownAfterDeadline(submission, harness.manager),
      );
      pushStatefulSample(
        harness,
        new Date(receipt.unknownAfter.getTime() + 1_000),
      );
      const result = await harness.transaction(() =>
        harness.service.resolveUnknownDefinitelyUnaccepted(
          { ...submission, safeOutcomeReason },
          harness.manager,
        ),
      );

      expect(result).toMatchObject({
        receipt: {
          attemptState: 'DEFINITELY_UNACCEPTED',
          capacityState: 'RELEASED',
          retryable: safeOutcomeReason === 'DEFINITELY_UNACCEPTED_RETRYABLE',
          safeOutcomeReason,
        },
        status: 'RECORDED',
      });
      expect(
        harness.days.get(`${ids.workspace}:${ids.account}:2026-03-10`),
      ).toMatchObject({
        acceptedCount: 0,
        reservedCount: 0,
      });
    },
  );

  it('returns accepted replay and rejects changed provider or premature projection evidence', async () => {
    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(3),
    });
    const { submission } = await reserveAndBeginStatefully(harness);

    pushStatefulSample(harness, new Date('2026-03-10T14:00:30.000Z'));
    const input = {
      ...submission,
      ...acceptedEvidence('provider-accepted'),
    };
    expect(
      await harness.transaction(() =>
        harness.service.recordAccepted(input, harness.manager),
      ),
    ).toMatchObject({ status: 'RECORDED' });
    const dayLocksBefore = harness.calls.filter(({ sql }) =>
      sql.includes('FROM "core"."mailboxCapacityDay"'),
    ).length;

    expect(
      await harness.service.recordAccepted(input, harness.manager),
    ).toMatchObject({
      status: 'EXACT_REPLAY',
    });
    expect(
      await harness.service.recordAccepted(
        { ...input, providerMessageId: 'provider-changed' },
        harness.manager,
      ),
    ).toMatchObject({ status: 'EVIDENCE_CONFLICT' });
    await expect(
      harness.service.recordAccepted(
        {
          ...input,
          projectedMessageId: ids.evidence,
          projectedMessageThreadId: ids.message,
        },
        harness.manager,
      ),
    ).rejects.toThrow('Invalid accepted outcome input');
    expect(
      harness.calls.filter(({ sql }) =>
        sql.includes('FROM "core"."mailboxCapacityDay"'),
      ),
    ).toHaveLength(dayLocksBefore);
  });

  it.each(['CAMPAIGN_TEST', 'INBOX'] as const)(
    'preserves legacy accepted shape and exact replay for %s',
    async (source) => {
      const harness = createStatefulCompositionHarness({
        samples: sameDaySamples(3),
      });
      const { submission } = await reserveAndBeginStatefully(harness, source);

      pushStatefulSample(harness, new Date('2026-03-10T14:00:30.000Z'));
      const input = {
        ...submission,
        ...acceptedEvidence(`provider-${source.toLowerCase()}`),
      };
      const recorded = await harness.transaction(() =>
        harness.service.recordAccepted(input, harness.manager),
      );

      expect(recorded).toMatchObject({
        receipt: {
          projectedMessageId: null,
          projectedMessageThreadId: null,
          providerDeliveredRecipients: null,
          providerHeaderMessageId: null,
          providerMessageExternalId: null,
          providerThreadExternalId: null,
          resolvedThreadExternalId: null,
        },
        status: 'RECORDED',
      });
      await expect(
        harness.service.recordAccepted(input, harness.manager),
      ).resolves.toMatchObject({ status: 'EXACT_REPLAY' });
    },
  );

  it.each(['CAMPAIGN_SEQUENCE', 'CAMPAIGN_TEST', 'INBOX'] as const)(
    'rejects a %s persisted winning-final-digest mismatch before day SQL',
    async (source) => {
      const harness = createStatefulCompositionHarness({
        samples: sameDaySamples(3),
      });
      const { submission } = await reserveAndBeginStatefully(harness, source);
      const mismatched = {
        ...submission,
        finalEvidenceDigest: digest,
      } as BeginOutboundEmailSubmissionInput;

      if (mismatched.source === 'INBOX') {
        mismatched.submissionCapability.finalEvidenceDigest = digest;
      }
      const dayLocksBefore = harness.calls.filter(({ sql }) =>
        sql.includes('FROM "core"."mailboxCapacityDay"'),
      ).length;
      const result = await harness.service.recordAccepted(
        {
          ...mismatched,
          ...acceptedEvidence('provider-mismatch'),
        },
        harness.manager,
      );

      expect(result).toEqual({ status: 'IDENTITY_CONFLICT' });
      expect(
        harness.calls.filter(({ sql }) =>
          sql.includes('FROM "core"."mailboxCapacityDay"'),
        ),
      ).toHaveLength(dayLocksBefore);
    },
  );

  it('covers NOT_FOUND, NOT_DUE with day-lock-before-sample, and INCOMPATIBLE_STATE', async () => {
    const empty = createStatefulCompositionHarness();
    expect(
      await empty.service.recordAccepted(
        {
          ...sequenceSubmission(),
          ...acceptedEvidence('missing'),
        },
        empty.manager,
      ),
    ).toEqual({ status: 'NOT_FOUND' });

    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(3),
    });
    const { receipt, submission } = await reserveAndBeginStatefully(harness);
    const callCount = harness.calls.length;

    pushStatefulSample(
      harness,
      new Date(receipt.unknownAfter.getTime() - 1_000),
    );
    expect(
      await harness.service.markUnknownAfterDeadline(
        submission,
        harness.manager,
      ),
    ).toMatchObject({ status: 'NOT_DUE' });
    const outcomeCalls = harness.calls.slice(callCount);
    const dayLockIndex = outcomeCalls.findIndex(({ sql }) =>
      sql.includes('FROM "core"."mailboxCapacityDay"'),
    );
    const sampleIndex = outcomeCalls.findIndex(({ sql }) =>
      sql.includes('MATERIALIZED'),
    );

    expect(dayLockIndex).toBeGreaterThanOrEqual(0);
    expect(sampleIndex).toBeGreaterThan(dayLockIndex);

    pushStatefulSample(harness, new Date('2026-03-10T14:00:30.000Z'));
    await harness.transaction(() =>
      harness.service.recordAccepted(
        {
          ...submission,
          ...acceptedEvidence('accepted-first'),
        },
        harness.manager,
      ),
    );
    expect(
      await harness.service.markUnknownAfterDeadline(
        submission,
        harness.manager,
      ),
    ).toMatchObject({ status: 'INCOMPATIBLE_STATE' });
  });

  it.each([
    'PROCESSING',
    'ACCEPTED',
    'DEFINITELY_UNACCEPTED',
    'UNKNOWN',
  ] as const)(
    'returns NOT_RESERVED for an exact %s block lost race with identity-conflict precedence',
    async (attemptState) => {
      const harness = createStatefulCompositionHarness({
        samples: sameDaySamples(2),
      });
      const reserved = await harness.transaction(() =>
        harness.service.reserveWithMailboxCapacity(
          statefulReserveInput('CAMPAIGN_SEQUENCE'),
          harness.manager,
        ),
      );

      if (reserved.status !== 'RESERVED') throw new Error('Expected reserve');
      const current = harness.attempts.get(ids.attempt);

      if (current === undefined) throw new Error('Missing attempt');
      harness.attempts.set(ids.attempt, {
        ...current,
        attemptState,
        capacityState:
          attemptState === 'ACCEPTED'
            ? 'CONSUMED'
            : attemptState === 'UNKNOWN'
              ? 'PROVISIONAL_UNKNOWN'
              : attemptState === 'DEFINITELY_UNACCEPTED'
                ? 'RELEASED'
                : 'RESERVED',
      });
      const dayLocksBefore = harness.calls.filter(({ sql }) =>
        sql.includes('FROM "core"."mailboxCapacityDay"'),
      ).length;

      expect(
        await harness.service.blockReservedAttemptBeforeProvider(
          {
            reason: 'STALE_FINAL_EVIDENCE',
            reservation: {
              ...sequenceReservation(),
              claimedAt: reserved.receipt.claimedAt,
              localDate: reserved.receipt.localDate,
              slotAt: reserved.receipt.slotAt,
              unknownAfter: reserved.receipt.unknownAfter,
            },
          },
          harness.manager,
        ),
      ).toEqual({ status: 'NOT_RESERVED' });
      expect(
        await harness.service.blockReservedAttemptBeforeProvider(
          {
            reason: 'STALE_FINAL_EVIDENCE',
            reservation: {
              ...sequenceReservation(),
              campaignId: ids.evidence,
              claimedAt: reserved.receipt.claimedAt,
              localDate: reserved.receipt.localDate,
              slotAt: reserved.receipt.slotAt,
              unknownAfter: reserved.receipt.unknownAfter,
            } as OutboundEmailAttemptReservationIdentity,
          },
          harness.manager,
        ),
      ).toEqual({ status: 'IDENTITY_CONFLICT' });
      expect(
        harness.calls.filter(({ sql }) =>
          sql.includes('FROM "core"."mailboxCapacityDay"'),
        ),
      ).toHaveLength(dayLocksBefore);
    },
  );

  it('runtime-rejects malformed definite reasons and independently supplied retryability', async () => {
    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(3),
    });
    const { submission } = await reserveAndBeginStatefully(harness);
    const callsBefore = harness.calls.length;

    await expect(
      harness.service.recordDefinitelyUnaccepted(
        {
          ...submission,
          safeOutcomeReason: 'RAW_PROVIDER_ERROR',
        } as unknown as RecordDefinitelyUnacceptedInput,
        harness.manager,
      ),
    ).rejects.toThrow('Invalid definitely-unaccepted outcome input');
    await expect(
      harness.service.recordDefinitelyUnaccepted(
        {
          ...submission,
          retryable: true,
          safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
        } as unknown as RecordDefinitelyUnacceptedInput,
        harness.manager,
      ),
    ).rejects.toThrow('Invalid definitely-unaccepted outcome input');
    expect(harness.calls).toHaveLength(callsBefore);
  });

  it.each([
    ['attemptInsert', 'zero'],
    ['attemptInsert', 'multiple'],
    ['attemptInsert', 'malformed'],
    ['dayIncrement', 'zero'],
    ['dayIncrement', 'multiple'],
    ['dayIncrement', 'malformed'],
    ['clockAdvance', 'zero'],
    ['clockAdvance', 'multiple'],
    ['clockAdvance', 'malformed'],
  ] as Array<[StatefulFaultFamily, StatefulFaultMode]>)(
    'rolls back attempt/day/clock snapshots for %s %s results',
    async (family, mode) => {
      const harness = createStatefulCompositionHarness({
        faults: { [family]: mode },
        samples: sameDaySamples(2),
      });

      await expect(
        harness.transaction(() =>
          harness.service.reserveWithMailboxCapacity(
            statefulReserveInput('CAMPAIGN_SEQUENCE'),
            harness.manager,
          ),
        ),
      ).rejects.toThrow();
      expect([...harness.attempts.values()]).toEqual([]);
      expect([...harness.days.values()]).toEqual([]);
      expect([...harness.clocks.values()]).toEqual([]);
    },
  );

  it('repeated same-attempt composition increments and advances exactly once', async () => {
    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(2),
    });
    const input = statefulReserveInput('CAMPAIGN_SEQUENCE');
    const first = await harness.transaction(() =>
      harness.service.reserveWithMailboxCapacity(input, harness.manager),
    );
    const second = await harness.transaction(() =>
      harness.service.reserveWithMailboxCapacity(
        { ...input, candidates: [], workspaceTimeZone: 'Invalid/Changed' },
        harness.manager,
      ),
    );

    expect(first).toMatchObject({ status: 'RESERVED' });
    expect(second).toMatchObject({ status: 'EXACT_REPLAY' });
    expect(
      harness.days.get(`${ids.workspace}:${ids.account}:2026-03-10`),
    ).toMatchObject({
      reservedCount: 1,
    });
    expect(
      harness.calls.filter(({ sql }) =>
        sql.includes('UPDATE "core"."mailboxCapacityDay"'),
      ),
    ).toHaveLength(1);
    expect(
      harness.calls.filter(({ sql }) =>
        sql.includes('UPDATE "core"."mailboxDispatchClock"'),
      ),
    ).toHaveLength(1);
  });

  it('covers every Campaign-test immutable field plus DB-authored day/window replay in every state without capacity SQL', async () => {
    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(2),
    });
    const input = statefulReserveInput('CAMPAIGN_TEST');
    const first = await harness.transaction(() =>
      harness.service.reserveWithMailboxCapacity(input, harness.manager),
    );

    if (first.status !== 'RESERVED') throw new Error('Expected reserve');
    const base = harness.attempts.get(ids.attempt);

    if (base === undefined) throw new Error('Missing attempt');
    const callsBeforeReplay = harness.calls.length;
    const attemptStates = [
      'RESERVED',
      'PROCESSING',
      'BLOCKED',
      'ACCEPTED',
      'DEFINITELY_UNACCEPTED',
      'UNKNOWN',
    ] as const;
    const shiftedClaimedAt = new Date('2026-03-11T15:00:00.000Z');
    const shiftedSlotAt = new Date('2026-03-11T15:00:01.000Z');

    for (const attemptState of attemptStates) {
      harness.attempts.set(ids.attempt, { ...base, attemptState });
      await expect(
        harness.service.reserveWithMailboxCapacity(input, harness.manager),
      ).resolves.toMatchObject({ status: 'EXACT_REPLAY' });

      harness.attempts.set(ids.attempt, {
        ...base,
        attemptState,
        claimedAt: shiftedClaimedAt,
        localDate: '2026-03-11',
        slotAt: shiftedSlotAt,
        unknownAfter: new Date(shiftedClaimedAt.getTime() + 60_000),
      });
      await expect(
        harness.service.reserveWithMailboxCapacity(input, harness.manager),
      ).resolves.toMatchObject({
        receipt: {
          claimedAt: shiftedClaimedAt,
          localDate: '2026-03-11',
          slotAt: shiftedSlotAt,
        },
        status: 'EXACT_REPLAY',
      });

      for (const malformed of [
        { slotAt: new Date('invalid') },
        { claimedAt: new Date('invalid') },
        { unknownAfter: new Date('invalid') },
        {
          unknownAfter: new Date(first.receipt.claimedAt.getTime() + 59_999),
        },
        { localDate: '2026-99-99' },
      ]) {
        harness.attempts.set(ids.attempt, {
          ...base,
          attemptState,
          ...malformed,
        });
        await expect(
          harness.service.reserveWithMailboxCapacity(input, harness.manager),
        ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
      }
    }

    const immutableChanges: Array<
      [keyof OutboundEmailAttemptReceipt, unknown]
    > = [
      ['attemptId', ids.evidence],
      ['workspaceId', ids.evidence],
      ['source', 'CAMPAIGN_SEQUENCE'],
      ['connectedAccountId', ids.evidence],
      ['messageChannelId', ids.evidence],
      ['provider', 'microsoft'],
      ['normalizedSenderHandle', 'changed-sender@example.com'],
      ['normalizedRecipient', 'changed-recipient@example.com'],
      ['selectionConstraintKind', 'EXPLICIT'],
      ['priorAcceptedEvidenceId', ids.evidence],
      ['senderPoolFingerprint', digestB],
      ['campaignId', ids.evidence],
      ['workflowVersionId', ids.evidence],
      ['messageId', ids.evidence],
      ['renderDigest', digestB],
      ['testPreparationProofId', ids.evidence],
      ['requesterUserWorkspaceId', ids.evidence],
      ['previewDigest', digest],
      ['testTransportDigest', digestB],
    ];

    for (const [field, value] of immutableChanges) {
      harness.attempts.set(ids.attempt, {
        ...base,
        [field]: value,
      } as OutboundEmailAttemptReceipt);
      await expect(
        harness.service.reserveWithMailboxCapacity(input, harness.manager),
      ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
    }

    expect(
      harness.calls
        .slice(callsBeforeReplay)
        .every(
          ({ sql }) =>
            sql.includes('pg_advisory_xact_lock') ||
            sql.includes('FROM "core"."outboundEmailAttempt"'),
        ),
    ).toBe(true);
  });
});

describe('real-service aggregate rollback after successful outcome CAS', () => {
  const cases = (
    [
      ['block', 'dayRelease'],
      ['definite', 'dayRelease'],
      ['accepted', 'dayConsume'],
      ['resolve-accepted', 'dayConsume'],
      ['resolve-definite', 'dayRelease'],
    ] as const
  ).flatMap(([target, family]) =>
    (['throw', 'zero', 'multiple', 'malformed'] as const).map((mode) => ({
      family,
      mode,
      target,
    })),
  );

  it.each(cases)(
    'restores attempt/day/clock after $target CAS when $family returns $mode',
    async ({ family, mode, target }) => {
      const harness = createStatefulCompositionHarness({
        samples: sameDaySamples(3),
      });
      let submission: BeginOutboundEmailSubmissionInput | null = null;

      if (target === 'block') {
        const reserved = await harness.transaction(() =>
          harness.service.reserveWithMailboxCapacity(
            statefulReserveInput('CAMPAIGN_SEQUENCE'),
            harness.manager,
          ),
        );

        if (reserved.status !== 'RESERVED') throw new Error('Expected reserve');
      } else {
        const setup = await reserveAndBeginStatefully(harness);

        submission = setup.submission;
        if (target.startsWith('resolve-')) {
          pushStatefulSample(harness, setup.receipt.unknownAfter);
          await harness.transaction(() =>
            harness.service.markUnknownAfterDeadline(
              setup.submission,
              harness.manager,
            ),
          );
        }
      }

      const before = harness.snapshot();
      const callsBefore = harness.calls.length;
      const stored = harness.attempts.get(ids.attempt);

      if (stored === undefined) throw new Error('Missing attempt');
      harness.faults[family] = mode;
      pushStatefulSample(harness, stored.unknownAfter);

      const operation = () => {
        if (target === 'block') {
          return harness.service.blockReservedAttemptBeforeProvider(
            {
              reason: 'STALE_FINAL_EVIDENCE',
              reservation: {
                ...sequenceReservation(),
                claimedAt: stored.claimedAt,
                localDate: stored.localDate,
                slotAt: stored.slotAt,
                unknownAfter: stored.unknownAfter,
              } as OutboundEmailAttemptReservationIdentity,
            },
            harness.manager,
          );
        }
        if (submission === null) throw new Error('Missing submission');
        if (target === 'accepted') {
          return harness.service.recordAccepted(
            {
              ...submission,
              ...acceptedEvidence('provider-aggregate'),
            },
            harness.manager,
          );
        }
        if (target === 'definite') {
          return harness.service.recordDefinitelyUnaccepted(
            {
              ...submission,
              safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
            },
            harness.manager,
          );
        }
        if (target === 'resolve-accepted') {
          return harness.service.resolveUnknownAccepted(
            {
              ...submission,
              ...acceptedEvidence('provider-resolved-aggregate'),
            },
            harness.manager,
          );
        }

        return harness.service.resolveUnknownDefinitelyUnaccepted(
          {
            ...submission,
            safeOutcomeReason: 'DEFINITELY_UNACCEPTED_NON_RETRYABLE',
          },
          harness.manager,
        );
      };

      await expect(harness.transaction<unknown>(operation)).rejects.toThrow();
      expect(harness.snapshot()).toEqual(before);

      const failedCalls = harness.calls.slice(callsBefore);

      expect(
        failedCalls.filter(({ sql }) =>
          sql.includes('UPDATE "core"."outboundEmailAttempt"'),
        ),
      ).toHaveLength(1);
      expect(
        failedCalls.filter(({ sql }) =>
          sql.includes('UPDATE "core"."mailboxCapacityDay"'),
        ),
      ).toHaveLength(1);
      expect(
        failedCalls.filter(({ sql }) =>
          sql.includes('UPDATE "core"."mailboxDispatchClock"'),
        ),
      ).toHaveLength(0);
    },
  );
});

describe('real-service outcome structured-result validation', () => {
  it('rejects malformed row counts, bindings, updatedAt, and createdAt for every outcome CAS and rolls back', async () => {
    const targets = [
      'block',
      'unknown',
      'accepted',
      'definite',
      'resolve-accepted',
      'resolve-definite',
    ] as const;
    const modes = [
      'zero',
      'multiple',
      'malformed',
      'missingUpdatedAt',
      'wrongUpdatedAt',
      'wrongCreatedAt',
    ] as const;

    for (const target of targets) {
      for (const mode of modes) {
        const harness = createStatefulCompositionHarness({
          samples: sameDaySamples(3),
        });
        let submission: BeginOutboundEmailSubmissionInput | null = null;

        if (target === 'block') {
          const reserved = await harness.transaction(() =>
            harness.service.reserveWithMailboxCapacity(
              statefulReserveInput('CAMPAIGN_SEQUENCE'),
              harness.manager,
            ),
          );

          if (reserved.status !== 'RESERVED')
            throw new Error('Expected reserve');
        } else {
          const setup = await reserveAndBeginStatefully(harness);

          submission = setup.submission;
          if (target.startsWith('resolve-')) {
            pushStatefulSample(harness, setup.receipt.unknownAfter);
            await harness.transaction(() =>
              harness.service.markUnknownAfterDeadline(
                setup.submission,
                harness.manager,
              ),
            );
          }
        }

        const family: StatefulFaultFamily =
          target === 'block'
            ? 'blockCas'
            : target === 'unknown'
              ? 'unknownCas'
              : target === 'accepted' || target === 'resolve-accepted'
                ? 'acceptedCas'
                : 'definiteCas';
        harness.faults[family] = mode;
        const storedAttempt = harness.attempts.get(ids.attempt);
        const storedDay = harness.days.get(
          `${ids.workspace}:${ids.account}:2026-03-10`,
        );
        const beforeAttempt =
          storedAttempt === undefined ? undefined : { ...storedAttempt };
        const beforeDay =
          storedDay === undefined ? undefined : { ...storedDay };
        const currentAttempt = harness.attempts.get(ids.attempt);

        if (currentAttempt === undefined) throw new Error('Missing attempt');
        pushStatefulSample(harness, currentAttempt.unknownAfter);

        const operation = () => {
          if (target === 'block') {
            const stored = harness.attempts.get(ids.attempt);

            if (stored === undefined) throw new Error('Missing reserve');
            return harness.service.blockReservedAttemptBeforeProvider(
              {
                reason: 'STALE_FINAL_EVIDENCE',
                reservation: {
                  ...sequenceReservation(),
                  claimedAt: stored.claimedAt,
                  localDate: stored.localDate,
                  slotAt: stored.slotAt,
                  unknownAfter: stored.unknownAfter,
                } as OutboundEmailAttemptReservationIdentity,
              },
              harness.manager,
            );
          }
          if (submission === null) throw new Error('Missing submission');
          if (target === 'unknown') {
            return harness.service.markUnknownAfterDeadline(
              submission,
              harness.manager,
            );
          }
          if (target === 'accepted') {
            return harness.service.recordAccepted(
              {
                ...submission,
                ...acceptedEvidence('provider-structured'),
              },
              harness.manager,
            );
          }
          if (target === 'definite') {
            return harness.service.recordDefinitelyUnaccepted(
              {
                ...submission,
                safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
              },
              harness.manager,
            );
          }
          if (target === 'resolve-accepted') {
            return harness.service.resolveUnknownAccepted(
              {
                ...submission,
                ...acceptedEvidence('provider-resolved-structured'),
              },
              harness.manager,
            );
          }

          return harness.service.resolveUnknownDefinitelyUnaccepted(
            {
              ...submission,
              safeOutcomeReason: 'DEFINITELY_UNACCEPTED_NON_RETRYABLE',
            },
            harness.manager,
          );
        };

        await expect(harness.transaction<unknown>(operation)).rejects.toThrow();
        expect(harness.attempts.get(ids.attempt)).toEqual(beforeAttempt);
        expect(
          harness.days.get(`${ids.workspace}:${ids.account}:2026-03-10`),
        ).toEqual(beforeDay);
      }
    }
  });
});

describe('real-service composed selection and readiness exits', () => {
  it('composes pinned Campaign test through exact locks, replay, begin, digest fence, and outcome without fallback', async () => {
    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(4),
    });
    const input = statefulReserveInput('CAMPAIGN_TEST');

    if (input.source !== 'CAMPAIGN_TEST') throw new Error('Invalid fixture');
    input.candidates = [statefulSender, otherStatefulSender];
    input.selectionConstraintKind = 'PINNED_REPLY';
    input.priorAcceptedEvidenceId = ids.evidence;

    const reserved = await harness.transaction(() =>
      harness.service.reserveWithMailboxCapacity(input, harness.manager),
    );

    expect(reserved.status).toBe('RESERVED');
    if (reserved.status !== 'RESERVED') return;
    expect(reserved.receipt).toMatchObject({
      connectedAccountId: ids.account,
      priorAcceptedEvidenceId: ids.evidence,
      selectionConstraintKind: 'PINNED_REPLY',
    });
    expect(
      harness.calls
        .filter(({ sql }) =>
          ['mailboxDispatchClock', 'mailboxCapacityDay'].some((table) =>
            sql.includes(table),
          ),
        )
        .every(({ params }) => params[1] === ids.account),
    ).toBe(true);
    expect(
      harness.calls.some(({ params }) => params.includes(ids.otherAccount)),
    ).toBe(false);

    await expect(
      harness.transaction(() =>
        harness.service.reserveWithMailboxCapacity(input, harness.manager),
      ),
    ).resolves.toMatchObject({ status: 'EXACT_REPLAY' });

    const submission = statefulSubmission('CAMPAIGN_TEST', reserved.receipt);
    await expect(
      harness.transaction(() =>
        harness.service.beginSubmission(submission, harness.manager),
      ),
    ).resolves.toMatchObject({ status: 'PROCESSING_ACQUIRED' });
    expect(
      await harness.service.blockReservedAttemptBeforeProvider(
        {
          reason: 'STALE_FINAL_EVIDENCE',
          reservation: {
            ...pinnedTestReservation(),
            claimedAt: reserved.receipt.claimedAt,
            localDate: reserved.receipt.localDate,
            slotAt: reserved.receipt.slotAt,
            unknownAfter: reserved.receipt.unknownAfter,
          },
        },
        harness.manager,
      ),
    ).toEqual({ status: 'NOT_RESERVED' });
    await expect(
      harness.service.recordAccepted(
        {
          ...submission,
          ...acceptedEvidence('pinned-test-mismatch'),
          finalEvidenceDigest: digest,
        },
        harness.manager,
      ),
    ).resolves.toEqual({ status: 'IDENTITY_CONFLICT' });
    pushStatefulSample(harness, new Date('2026-03-10T14:00:30.000Z'));
    await expect(
      harness.transaction(() =>
        harness.service.recordAccepted(
          {
            ...submission,
            ...acceptedEvidence('pinned-test-accepted'),
          },
          harness.manager,
        ),
      ),
    ).resolves.toMatchObject({
      receipt: {
        attemptState: 'ACCEPTED',
        priorAcceptedEvidenceId: ids.evidence,
      },
      status: 'RECORDED',
    });

    const blockedHarness = createStatefulCompositionHarness({
      samples: sameDaySamples(3),
    });
    const blocked = await blockedHarness.transaction(() =>
      blockedHarness.service.reserveWithMailboxCapacity(
        input,
        blockedHarness.manager,
      ),
    );

    expect(blocked.status).toBe('RESERVED');
    if (blocked.status !== 'RESERVED') return;
    const exactReservation = {
      ...pinnedTestReservation(),
      claimedAt: blocked.receipt.claimedAt,
      localDate: blocked.receipt.localDate,
      slotAt: blocked.receipt.slotAt,
      unknownAfter: blocked.receipt.unknownAfter,
    };
    await expect(
      blockedHarness.transaction(() =>
        blockedHarness.service.blockReservedAttemptBeforeProvider(
          {
            reason: 'STALE_FINAL_EVIDENCE',
            reservation: exactReservation,
          },
          blockedHarness.manager,
        ),
      ),
    ).resolves.toMatchObject({ status: 'RECORDED' });
    await expect(
      blockedHarness.service.blockReservedAttemptBeforeProvider(
        {
          reason: 'STALE_FINAL_EVIDENCE',
          reservation: exactReservation,
        },
        blockedHarness.manager,
      ),
    ).resolves.toMatchObject({ status: 'EXACT_REPLAY' });

    const missing = createStatefulCompositionHarness();
    await expect(
      missing.service.reserveWithMailboxCapacity(
        { ...input, candidates: [otherStatefulSender] },
        missing.manager,
      ),
    ).resolves.toEqual({
      reason: 'PINNED_SENDER_NOT_READY',
      status: 'BLOCKED',
    });
    expect(missing.clocks.size).toBe(0);
    expect(missing.days.size).toBe(0);
  });

  it('composes PINNED_REPLY without fallback and binds the produced PROCESSING input', async () => {
    const harness = createStatefulCompositionHarness({
      samples: sameDaySamples(3),
    });
    const input = statefulReserveInput('CAMPAIGN_SEQUENCE');

    if (input.source !== 'CAMPAIGN_SEQUENCE')
      throw new Error('Invalid fixture');
    input.selectionConstraintKind = 'PINNED_REPLY';
    input.priorAcceptedEvidenceId = ids.evidence;
    const reserved = await harness.transaction(() =>
      harness.service.reserveWithMailboxCapacity(input, harness.manager),
    );

    expect(reserved.status).toBe('RESERVED');
    if (reserved.status !== 'RESERVED') return;
    expect(reserved.receipt).toMatchObject({
      priorAcceptedEvidenceId: ids.evidence,
      selectionConstraintKind: 'PINNED_REPLY',
    });
    expect(
      await harness.transaction(() =>
        harness.service.beginSubmission(
          statefulSubmission('CAMPAIGN_SEQUENCE', reserved.receipt),
          harness.manager,
        ),
      ),
    ).toMatchObject({ status: 'PROCESSING_ACQUIRED' });

    const missing = createStatefulCompositionHarness();
    expect(
      await missing.service.reserveWithMailboxCapacity(
        { ...input, candidates: [] },
        missing.manager,
      ),
    ).toEqual({
      reason: 'PINNED_SENDER_NOT_READY',
      status: 'BLOCKED',
    });
    expect(missing.clocks.size).toBe(0);
    expect(missing.days.size).toBe(0);
  });

  it('composes exact daily-limit and spacing-through-midnight gates with initialization-only state', async () => {
    const limitHarness = createStatefulCompositionHarness({
      samples: sameDaySamples(1),
    });
    limitHarness.days.set(`${ids.workspace}:${ids.account}:2026-03-10`, {
      acceptedCount: 50,
      connectedAccountId: ids.account,
      localDate: '2026-03-10',
      reservedCount: 0,
      workspaceId: ids.workspace,
    });
    const atLimit = await limitHarness.service.reserveWithMailboxCapacity(
      statefulReserveInput('CAMPAIGN_SEQUENCE'),
      limitHarness.manager,
    );

    expect(atLimit).toEqual({
      nextEligibleAt: new Date('2026-03-11T04:00:00.000Z'),
      status: 'NOT_READY',
    });
    expect(limitHarness.attempts.size).toBe(0);
    expect(limitHarness.clocks.size).toBe(1);
    expect(
      limitHarness.calls.some(({ sql }) => sql.includes('UPDATE "core"')),
    ).toBe(false);

    const spacingHarness = createStatefulCompositionHarness({
      samples: sameDaySamples(1),
    });
    spacingHarness.days.set(`${ids.workspace}:${ids.account}:2026-03-10`, {
      acceptedCount: 50,
      connectedAccountId: ids.account,
      localDate: '2026-03-10',
      reservedCount: 0,
      workspaceId: ids.workspace,
    });
    spacingHarness.clocks.set(`${ids.workspace}:${ids.account}`, {
      connectedAccountId: ids.account,
      nextEligibleAt: new Date('2026-03-11T04:04:00.000Z'),
      workspaceId: ids.workspace,
    });
    expect(
      await spacingHarness.service.reserveWithMailboxCapacity(
        statefulReserveInput('CAMPAIGN_SEQUENCE'),
        spacingHarness.manager,
      ),
    ).toEqual({
      nextEligibleAt: new Date('2026-03-11T04:04:00.000Z'),
      status: 'NOT_READY',
    });
  });

  it('uses PostgreSQL-returned DST day/midnight and permits only zero-row initialization on stale winner', async () => {
    const dstAt = new Date('2026-11-01T05:30:00.000Z');
    const nextMidnight = new Date('2026-11-02T05:00:00.000Z');
    const dstHarness = createStatefulCompositionHarness({
      samples: [
        {
          localDate: '2026-11-01',
          nextLocalMidnightAt: nextMidnight,
          observedAt: dstAt,
        },
        {
          localDate: '2026-11-01',
          nextLocalMidnightAt: nextMidnight,
          observedAt: new Date(dstAt.getTime() + 1_000),
        },
      ],
    });
    const dst = await dstHarness.transaction(() =>
      dstHarness.service.reserveWithMailboxCapacity(
        statefulReserveInput('CAMPAIGN_SEQUENCE'),
        dstHarness.manager,
      ),
    );

    expect(dst).toMatchObject({
      receipt: { localDate: '2026-11-01' },
      status: 'RESERVED',
    });

    const other: ReadyCampaignSenderReadiness = {
      ...statefulSender,
      campaignAccountId: 'other-campaign-account',
      connectedAccountId: '11111111-1111-4111-8111-111111111112',
      messageChannelId: '11111111-1111-4111-8111-111111111113',
      senderHandle: 'other@example.com',
    };
    const staleHarness = createStatefulCompositionHarness({
      samples: sameDaySamples(1),
    });
    const staleInput = statefulReserveInput('CAMPAIGN_SEQUENCE');

    staleInput.candidates = [statefulSender, other];
    expect(
      await staleHarness.service.reserveWithMailboxCapacity(
        staleInput,
        staleHarness.manager,
      ),
    ).toEqual({ status: 'STALE_PROJECTION' });
    expect(staleHarness.attempts.size).toBe(0);
    expect([...staleHarness.days.values()]).toHaveLength(2);
    expect(
      [...staleHarness.days.values()].every(
        ({ acceptedCount, reservedCount }) =>
          acceptedCount === 0 && reservedCount === 0,
      ),
    ).toBe(true);
    expect(
      staleHarness.calls.some(({ sql }) => sql.includes('UPDATE "core"')),
    ).toBe(false);
  });

  it.each([
    ['missing', null],
    ['wrong', '2026-03-12'],
  ] as const)(
    'rejects a %s selected new-day binding after midnight without material mutation',
    async (_label, returnedLocalDate) => {
      const harness = createStatefulCompositionHarness({
        dayReadFault: {
          connectedAccountId: ids.account,
          localDate: '2026-03-11',
          returnedLocalDate,
        },
        samples: [
          {
            localDate: '2026-03-10',
            nextLocalMidnightAt: new Date('2026-03-11T04:00:00.000Z'),
            observedAt: new Date('2026-03-11T03:59:59.000Z'),
          },
          {
            localDate: '2026-03-11',
            nextLocalMidnightAt: new Date('2026-03-12T04:00:00.000Z'),
            observedAt: new Date('2026-03-11T04:00:01.000Z'),
          },
        ],
      });
      const result = await harness.service.reserveWithMailboxCapacity(
        statefulReserveInput('CAMPAIGN_SEQUENCE'),
        harness.manager,
      );

      expect(result).toEqual({
        reason: 'INVALID_CAPACITY_INPUT',
        status: 'BLOCKED',
      });
      expect(harness.attempts.size).toBe(0);
      expect(
        harness.calls.some(({ sql }) => sql.includes('UPDATE "core"')),
      ).toBe(false);
    },
  );
});
