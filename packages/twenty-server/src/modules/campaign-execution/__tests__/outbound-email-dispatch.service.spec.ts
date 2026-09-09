import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type EntityManager } from 'typeorm';

import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { OutboundEmailDispatchService } from 'src/modules/campaign-execution/services/outbound-email-dispatch.service';
import {
  type BeginOutboundEmailSubmissionInput,
  type CampaignSequenceSubmissionInput,
  type CampaignTestSubmissionInput,
  type DirectSubmissionInput,
  type OutboundEmailAttemptReceipt,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';
import {
  type DispatchTrustedOutboundEmailInput,
  type FinalSubmissionAuthorityRevalidator,
  type OutboundEmailDispatchTransactionPort,
  type RecoverOutboundEmailOutcomeInput,
  type SuspendAwareMonotonicClock,
} from 'src/modules/campaign-execution/types/outbound-email-dispatch.type';
import { type MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';

const ids = {
  account: '11111111-1111-4111-8111-111111111111',
  attempt: '22222222-2222-4222-8222-222222222222',
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
const renderDigest = 'a'.repeat(64);
const poolDigest = 'b'.repeat(64);
const finalDigest = 'c'.repeat(64);
const previewDigest = 'd'.repeat(64);
const transportDigest = 'e'.repeat(64);
const updatedAt = new Date('2026-09-09T12:00:00.000Z');
const unknownAfter = new Date('2026-09-09T12:01:00.000Z');

const sequenceSubmission = (): CampaignSequenceSubmissionInput => ({
  attemptId: ids.attempt,
  authorizationId: ids.authorization,
  campaignId: ids.campaign,
  connectedAccountId: ids.account,
  enrollmentId: ids.enrollment,
  finalEvidenceDigest: finalDigest,
  messageChannelId: ids.channel,
  messageId: ids.message,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  occurrenceId: ids.occurrence,
  provider: ConnectedAccountProvider.GOOGLE,
  renderDigest,
  source: 'CAMPAIGN_SEQUENCE',
  submissionCapability: {
    attemptId: ids.attempt,
    kind: 'CAMPAIGN_SEQUENCE_SUBMISSION',
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
      provider: ConnectedAccountProvider.GOOGLE,
      workflowVersionId: ids.version,
      workspaceId: ids.workspace,
    },
    renderDigest,
    reservationBinding: {
      attemptNumber: 1,
      claimedAt: new Date('2026-09-09T12:00:00.000Z'),
      localDate: '2026-09-09',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'ROTATE',
      senderPoolFingerprint: poolDigest,
      slotAt: new Date('2026-09-09T12:00:00.000Z'),
      unknownAfter,
    },
  },
  workflowVersionId: ids.version,
  workspaceId: ids.workspace,
});

const testSubmission = (): CampaignTestSubmissionInput => ({
  attemptId: ids.attempt,
  campaignId: ids.campaign,
  connectedAccountId: ids.account,
  finalEvidenceDigest: finalDigest,
  messageChannelId: ids.channel,
  messageId: ids.message,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  previewDigest,
  provider: ConnectedAccountProvider.GOOGLE,
  renderDigest,
  requesterUserWorkspaceId: ids.requester,
  source: 'CAMPAIGN_TEST',
  submissionCapability: {
    attemptId: ids.attempt,
    campaignId: ids.campaign,
    connectedAccountId: ids.account,
    kind: 'CAMPAIGN_TEST_SUBMISSION',
    messageChannelId: ids.channel,
    messageId: ids.message,
    normalizedRecipient: 'recipient@example.com',
    normalizedSenderHandle: 'sender@example.com',
    previewDigest,
    provider: ConnectedAccountProvider.GOOGLE,
    renderDigest,
    requesterUserWorkspaceId: ids.requester,
    reservationBinding: {
      claimedAt: new Date('2026-09-09T12:00:00.000Z'),
      localDate: '2026-09-09',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'ROTATE',
      senderPoolFingerprint: poolDigest,
      slotAt: new Date('2026-09-09T12:00:00.000Z'),
      unknownAfter,
    },
    testPreparationProofId: ids.proof,
    testSubmissionCapabilityId: ids.capability,
    testTransportDigest: transportDigest,
    workflowVersionId: ids.version,
    workspaceId: ids.workspace,
  },
  testPreparationProofId: ids.proof,
  testTransportDigest: transportDigest,
  workflowVersionId: ids.version,
  workspaceId: ids.workspace,
});

const directSubmission = (
  source: 'INBOX' | 'AUTOMATED_REPLY' = 'INBOX',
): DirectSubmissionInput => ({
  attemptId: ids.attempt,
  connectedAccountId: ids.account,
  directReservationCapabilityId: ids.capability,
  finalEvidenceDigest: finalDigest,
  messageChannelId: ids.channel,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  provider: ConnectedAccountProvider.GOOGLE,
  source,
  submissionCapability: {
    attemptId: ids.attempt,
    connectedAccountId: ids.account,
    directReservationCapabilityId: ids.capability,
    directSubmissionCapabilityId: ids.proof,
    finalEvidenceDigest: finalDigest,
    kind: 'DIRECT_SUBMISSION_CAPABILITY',
    messageChannelId: ids.channel,
    normalizedRecipient: 'recipient@example.com',
    normalizedSenderHandle: 'sender@example.com',
    provider: ConnectedAccountProvider.GOOGLE,
    reservationBinding: {
      claimedAt: new Date('2026-09-09T12:00:00.000Z'),
      directReservationCapabilityId: ids.capability,
      localDate: '2026-09-09',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'EXPLICIT',
      slotAt: new Date('2026-09-09T12:00:00.000Z'),
      unknownAfter,
    },
    workspaceId: ids.workspace,
  },
  workspaceId: ids.workspace,
});

const account = (): ConnectedAccountEntity =>
  ({
    handle: 'sender@example.com',
    id: ids.account,
    provider: ConnectedAccountProvider.GOOGLE,
    workspaceId: ids.workspace,
  }) as ConnectedAccountEntity;

const dispatchInput = (
  submission: BeginOutboundEmailSubmissionInput = sequenceSubmission(),
): DispatchTrustedOutboundEmailInput =>
  ({
    kind:
      submission.source === 'CAMPAIGN_SEQUENCE'
        ? 'CAMPAIGN_SEQUENCE_FINAL'
        : submission.source === 'CAMPAIGN_TEST'
          ? 'CAMPAIGN_TEST_FINAL'
          : 'DIRECT_FINAL',
    material: {
      connectedAccount: account(),
      projectedMessageId: ids.message,
      sendMessageInput: {
        body: 'Plain body',
        html: '<p>Body</p>',
        subject: 'Subject',
        to: 'recipient@example.com',
      },
    },
    submission,
  }) as DispatchTrustedOutboundEmailInput;

const validConnectionParameters = () => ({
  IMAP: {
    connectionSecurity: 'SSL_TLS',
    host: 'imap.example.com',
    password: 'imap-secret',
    port: 993,
    username: 'sender@example.com',
  },
  SMTP: {
    connectionSecurity: 'STARTTLS',
    host: 'smtp.example.com',
    password: 'smtp-secret',
    port: 587,
    username: 'sender@example.com',
  },
});

const imapDispatchInput = (): DispatchTrustedOutboundEmailInput => {
  const input = dispatchInput();
  input.material.connectedAccount.provider =
    ConnectedAccountProvider.IMAP_SMTP_CALDAV;
  input.material.connectedAccount.connectionParameters =
    validConnectionParameters() as never;
  input.submission.provider = ConnectedAccountProvider.IMAP_SMTP_CALDAV;
  if (input.submission.source === 'CAMPAIGN_SEQUENCE') {
    input.submission.submissionCapability.renderContext.provider =
      ConnectedAccountProvider.IMAP_SMTP_CALDAV;
  }

  return input;
};

const receipt = (
  state: OutboundEmailAttemptReceipt['attemptState'] = 'PROCESSING',
): OutboundEmailAttemptReceipt =>
  ({
    ...sequenceSubmission(),
    attemptNumber: 1,
    attemptState: state,
    capacityState: state === 'UNKNOWN' ? 'PROVISIONAL_UNKNOWN' : 'RESERVED',
    claimedAt: new Date('2026-09-09T12:00:00.000Z'),
    createdAt: new Date('2026-09-09T12:00:00.000Z'),
    localDate: '2026-09-09',
    priorAcceptedEvidenceId: null,
    projectedMessageId: null,
    providerAcceptedAt: null,
    providerMessageId: null,
    reservationEvidence: undefined,
    retryable: null,
    safeOutcomeReason: null,
    selectionConstraintKind: 'ROTATE',
    senderPoolFingerprint: poolDigest,
    slotAt: updatedAt,
    unknownAfter,
    updatedAt,
  }) as unknown as OutboundEmailAttemptReceipt;

const recorded = (state: OutboundEmailAttemptReceipt['attemptState']) => ({
  receipt: receipt(state),
  status: 'RECORDED' as const,
});

type AttemptPort = ConstructorParameters<
  typeof OutboundEmailDispatchService
>[3];

const createHarness = () => {
  const events: string[] = [];
  const managers = [
    { queryRunner: { isTransactionActive: true } },
    { queryRunner: { isTransactionActive: true } },
  ] as unknown as EntityManager[];
  let transactionIndex = 0;
  const transactionPort: OutboundEmailDispatchTransactionPort = {
    runInTransaction: jest.fn(async (work) => {
      const index = transactionIndex++;
      events.push(`transaction:${index}:start`);
      const result = await work(managers[index] ?? managers[1]);
      events.push(`transaction:${index}:commit`);
      return result;
    }),
  };
  const revalidator: FinalSubmissionAuthorityRevalidator = {
    revalidate: jest.fn(async ({ submission }) => {
      events.push('revalidate');
      return {
        projectedMessageId: ids.message,
        status: 'AUTHORIZED' as const,
        submission,
      };
    }),
  };
  const clock: SuspendAwareMonotonicClock = {
    now: jest.fn().mockReturnValueOnce(10_000).mockReturnValueOnce(10_000),
  };
  const attemptService = {
    beginSubmission: jest.fn(async () => {
      events.push('beginSubmission');
      return { receipt: receipt(), status: 'PROCESSING_ACQUIRED' as const };
    }),
    getReceipt: jest.fn(),
    markUnknownAfterDeadline: jest.fn(async () => recorded('UNKNOWN')),
    recordAccepted: jest.fn(async () => {
      events.push('recordAccepted');
      return recorded('ACCEPTED');
    }),
    recordDefinitelyUnaccepted: jest.fn(async () => {
      events.push('recordDefinitelyUnaccepted');
      return recorded('DEFINITELY_UNACCEPTED');
    }),
    resolveUnknownAccepted: jest.fn(async () => recorded('ACCEPTED')),
    resolveUnknownDefinitelyUnaccepted: jest.fn(async () =>
      recorded('DEFINITELY_UNACCEPTED'),
    ),
  } as unknown as jest.Mocked<AttemptPort>;
  const outboundService = {
    getProviderRequestTimeoutMs: jest.fn(() => 30_000),
    sendMessage: jest.fn(async () => {
      events.push('sendMessage');
      return {
        headerMessageId: '<header@example.com>',
        messageExternalId: 'provider-123',
      };
    }),
  } as unknown as jest.Mocked<MessagingMessageOutboundService>;
  const service = new OutboundEmailDispatchService(
    transactionPort,
    revalidator,
    clock,
    attemptService,
    outboundService,
  );

  return {
    attemptService,
    clock,
    events,
    managers,
    outboundService,
    revalidator,
    service,
    transactionPort,
  };
};

describe('OutboundEmailDispatchService', () => {
  it.each([
    ['CAMPAIGN_SEQUENCE', sequenceSubmission()],
    ['CAMPAIGN_TEST', testSubmission()],
    ['INBOX', directSubmission('INBOX')],
    ['AUTOMATED_REPLY', directSubmission('AUTOMATED_REPLY')],
  ])(
    'routes %s through the one provider call site',
    async (_source, submission) => {
      const harness = createHarness();

      await expect(
        harness.service.dispatch(dispatchInput(submission)),
      ).resolves.toMatchObject({
        status: 'ACCEPTED_RECORDED',
      });
      expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['kind mismatch', (input: any) => (input.kind = 'DIRECT_FINAL')],
    [
      'noncanonical attempt',
      (input: any) => (input.submission.attemptId = 'BAD'),
    ],
    [
      'account mismatch',
      (input: any) => (input.material.connectedAccount.id = ids.channel),
    ],
    [
      'provider mismatch',
      (input: any) =>
        (input.material.connectedAccount.provider =
          ConnectedAccountProvider.MICROSOFT),
    ],
    [
      'sender mismatch',
      (input: any) =>
        (input.material.connectedAccount.handle = 'other@example.com'),
    ],
    [
      'recipient mismatch',
      (input: any) =>
        (input.material.sendMessageInput.to = 'other@example.com'),
    ],
    [
      'multiple recipients',
      (input: any) =>
        (input.material.sendMessageInput.to = [
          'recipient@example.com',
          'other@example.com',
        ]),
    ],
    [
      'additional cc recipient',
      (input: any) =>
        (input.material.sendMessageInput.cc = 'other@example.com'),
    ],
    [
      'additional bcc recipient',
      (input: any) =>
        (input.material.sendMessageInput.bcc = 'other@example.com'),
    ],
    [
      'bad digest',
      (input: any) => (input.submission.finalEvidenceDigest = 'bad'),
    ],
    [
      'bad projected id',
      (input: any) => (input.material.projectedMessageId = '<rfc@example.com>'),
    ],
  ])(
    'rejects malformed trusted input before SQL/provider: %s',
    async (_case, mutate) => {
      const harness = createHarness();
      const input = dispatchInput() as any;
      mutate(input);

      await expect(harness.service.dispatch(input)).resolves.toEqual({
        status: 'CONTRACT_CONFLICT',
      });
      expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    'NOT_ACQUIRED',
    'RESERVATION_WINDOW_EXPIRED',
    'IDENTITY_CONFLICT',
  ] as const)(
    'never submits when beginSubmission returns %s',
    async (status) => {
      const harness = createHarness();
      const result =
        status === 'NOT_ACQUIRED'
          ? { currentState: 'PROCESSING' as const, receipt: receipt(), status }
          : status === 'RESERVATION_WINDOW_EXPIRED'
            ? {
                currentState: 'RESERVED' as const,
                receipt: receipt('RESERVED'),
                status,
              }
            : { status };
      harness.attemptService.beginSubmission.mockResolvedValueOnce(result);

      const dispatchResult = await harness.service.dispatch(dispatchInput());

      expect(dispatchResult.status).toBe(
        status === 'NOT_ACQUIRED'
          ? 'NOT_PROCESSING_WINNER'
          : status === 'RESERVATION_WINDOW_EXPIRED'
            ? 'RESERVATION_WINDOW_EXPIRED'
            : 'CONTRACT_CONFLICT',
      );
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
      expect(harness.transactionPort.runInTransaction).toHaveBeenCalledTimes(1);
    },
  );

  it('orders revalidation before CAS, commits before provider, and starts outcome afterward', async () => {
    const harness = createHarness();

    await harness.service.dispatch(dispatchInput());

    expect(harness.events).toEqual([
      'transaction:0:start',
      'revalidate',
      'beginSubmission',
      'transaction:0:commit',
      'sendMessage',
      'transaction:1:start',
      'recordAccepted',
      'transaction:1:commit',
    ]);
    expect(harness.revalidator.revalidate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'CAMPAIGN_SEQUENCE_FINAL' }),
      harness.managers[0],
    );
    expect(harness.attemptService.beginSubmission).toHaveBeenCalledWith(
      expect.anything(),
      harness.managers[0],
    );
    expect(harness.attemptService.recordAccepted).toHaveBeenCalledWith(
      expect.anything(),
      harness.managers[1],
    );
  });

  it.each(['DENIED', 'STALE', 'SUPPRESSED'] as const)(
    'rolls back before CAS/provider for %s authority',
    async (reason) => {
      const harness = createHarness();
      harness.revalidator.revalidate = jest.fn(async () => ({
        reason,
        status: 'REJECTED' as const,
      }));

      await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
        reason,
        status: 'AUTHORITY_REJECTED',
      });
      expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('rejects a revalidator submission or projected-message substitution', async () => {
    const harness = createHarness();
    const changed = sequenceSubmission();
    changed.normalizedRecipient = 'other@example.com';
    harness.revalidator.revalidate = jest.fn(async () => ({
      projectedMessageId: ids.channel,
      status: 'AUTHORIZED' as const,
      submission: changed,
    }));

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('allows only one provider entrant across concurrent duplicate dispatches', async () => {
    const harness = createHarness();
    (harness.clock.now as jest.Mock).mockReset().mockReturnValue(10_000);
    let calls = 0;
    harness.attemptService.beginSubmission.mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? { receipt: receipt(), status: 'PROCESSING_ACQUIRED' }
        : {
            currentState: 'PROCESSING',
            receipt: receipt(),
            status: 'NOT_ACQUIRED',
          };
    });

    const results = await Promise.all([
      harness.service.dispatch(dispatchInput()),
      harness.service.dispatch(dispatchInput()),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      'ACCEPTED_RECORDED',
      'NOT_PROCESSING_WINNER',
    ]);
    expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each([['less than full budget', [10_000, 40_001]]])(
    'records definite retryable without transport for %s',
    async (_case, samples) => {
      const harness = createHarness();
      (harness.clock.now as jest.Mock)
        .mockReset()
        .mockReturnValueOnce(samples[0])
        .mockReturnValueOnce(samples[1]);

      await expect(
        harness.service.dispatch(dispatchInput()),
      ).resolves.toMatchObject({
        status: 'DEFINITELY_UNACCEPTED_RECORDED',
      });
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
      expect(
        harness.attemptService.recordDefinitelyUnaccepted,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
        }),
        expect.anything(),
      );
    },
  );

  it('rejects a nonfinite clock anchor before opening a transaction', async () => {
    const harness = createHarness();
    (harness.clock.now as jest.Mock)
      .mockReset()
      .mockReturnValueOnce(Number.NaN);

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('accepts exactly a full remaining provider budget', async () => {
    const harness = createHarness();
    (harness.clock.now as jest.Mock)
      .mockReset()
      .mockReturnValueOnce(10_000)
      .mockReturnValueOnce(40_000);

    await expect(
      harness.service.dispatch(dispatchInput()),
    ).resolves.toMatchObject({ status: 'ACCEPTED_RECORDED' });
    expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects a driver timeout other than the fixed 30 seconds before SQL', async () => {
    const harness = createHarness();
    harness.outboundService.getProviderRequestTimeoutMs.mockReturnValueOnce(
      29_999,
    );

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        headerMessageId: '<header@example.com>',
        messageExternalId: ' external-id ',
      },
      'external-id',
    ],
    [{ headerMessageId: ' header-id ', messageExternalId: '   ' }, 'header-id'],
  ])(
    'persists a stable provider identity from accepted output',
    async (providerResult, expectedId) => {
      const harness = createHarness();
      harness.outboundService.sendMessage.mockResolvedValueOnce(providerResult);

      await harness.service.dispatch(dispatchInput());

      expect(harness.attemptService.recordAccepted).toHaveBeenCalledWith(
        expect.objectContaining({
          projectedMessageId: ids.message,
          providerMessageId: expectedId,
        }),
        expect.anything(),
      );
    },
  );

  it('does not infer projectedMessageId from an RFC header id', async () => {
    const harness = createHarness();
    const input = dispatchInput();
    input.material.projectedMessageId = null;
    harness.revalidator.revalidate = jest.fn(async ({ submission }) => ({
      projectedMessageId: null,
      status: 'AUTHORIZED' as const,
      submission,
    }));

    await harness.service.dispatch(input);

    expect(harness.attemptService.recordAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ projectedMessageId: null }),
      expect.anything(),
    );
  });

  it('holds accepted output without a provider/header identity for reconciliation', async () => {
    const harness = createHarness();
    harness.outboundService.sendMessage.mockResolvedValueOnce({
      headerMessageId: '  ',
    });

    const result = await harness.service.dispatch(dispatchInput());

    expect(result).toMatchObject({
      evidence: { kind: 'UNPERSISTABLE_ACCEPTANCE_EVIDENCE' },
      severity: 'HIGH',
      status: 'OUTCOME_RECOVERY_REQUIRED',
    });
    expect(harness.attemptService.recordAccepted).not.toHaveBeenCalled();
    expect(
      harness.attemptService.markUnknownAfterDeadline,
    ).not.toHaveBeenCalled();
    expect(
      harness.attemptService.recordDefinitelyUnaccepted,
    ).not.toHaveBeenCalled();
  });

  it('records only explicit classifier rejection as definitely unaccepted', async () => {
    const harness = createHarness();
    harness.outboundService.sendMessage.mockRejectedValueOnce({
      responseCode: 550,
      secret: 'do-not-leak',
    });

    const result = await harness.service.dispatch(dispatchInput());

    expect(result.status).toBe('DEFINITELY_UNACCEPTED_RECORDED');
    expect(
      harness.attemptService.recordDefinitelyUnaccepted,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
      }),
      expect.anything(),
    );
    expect(JSON.stringify(result)).not.toContain('do-not-leak');
  });

  it('records a native Error responseCode rejection as definitely unaccepted', async () => {
    const harness = createHarness();
    const nativeSmtpError = Object.assign(new Error('smtp'), {
      responseCode: 550,
    });
    const stackDescriptor = Object.getOwnPropertyDescriptor(
      nativeSmtpError,
      'stack',
    );
    expect(stackDescriptor).toBeDefined();
    expect(stackDescriptor).not.toHaveProperty('value');
    harness.outboundService.sendMessage.mockRejectedValueOnce(nativeSmtpError);

    await expect(
      harness.service.dispatch(dispatchInput()),
    ).resolves.toMatchObject({ status: 'DEFINITELY_UNACCEPTED_RECORDED' });
    expect(
      harness.attemptService.recordDefinitelyUnaccepted,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
      }),
      expect.anything(),
    );
  });

  it.each(['stack', 'message', 'name'] as const)(
    'keeps a native Error with custom %s accessor ambiguous without hooks',
    async (key) => {
      const harness = createHarness();
      const hook = jest.fn(() => {
        throw new Error('custom-error-accessor-hook');
      });
      const error = new Error('smtp');
      Object.defineProperty(error, key, {
        configurable: true,
        enumerable: key !== 'stack',
        get: hook,
        set: hook,
      });
      Object.defineProperty(error, 'responseCode', {
        configurable: true,
        enumerable: true,
        value: 550,
        writable: true,
      });
      harness.outboundService.sendMessage.mockRejectedValueOnce(error);

      await expect(
        harness.service.dispatch(dispatchInput()),
      ).resolves.toMatchObject({ status: 'UNKNOWN_PENDING_DEADLINE' });
      expect(hook).not.toHaveBeenCalled();
      expect(
        harness.attemptService.recordDefinitelyUnaccepted,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    new Error('socket secret'),
    { code: 'ETIMEDOUT', token: 'secret' },
    'raw secret',
  ])(
    'keeps ambiguous provider errors pending without releasing capacity',
    async (error) => {
      const harness = createHarness();
      harness.outboundService.sendMessage.mockRejectedValueOnce(error);

      const result = await harness.service.dispatch(dispatchInput());

      expect(result).toMatchObject({
        evidence: { kind: 'AMBIGUOUS_EVIDENCE' },
        status: 'UNKNOWN_PENDING_DEADLINE',
      });
      expect(
        harness.attemptService.recordDefinitelyUnaccepted,
      ).not.toHaveBeenCalled();
      expect(
        harness.attemptService.markUnknownAfterDeadline,
      ).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );

  it('returns sanitized accepted recovery evidence when outcome persistence fails', async () => {
    const harness = createHarness();
    harness.attemptService.recordAccepted.mockRejectedValueOnce(
      new Error('database secret'),
    );

    const result = await harness.service.dispatch(dispatchInput());

    expect(result).toMatchObject({
      evidence: {
        kind: 'ACCEPTED_EVIDENCE',
        projectedMessageId: ids.message,
        providerMessageId: 'provider-123',
      },
      status: 'OUTCOME_RECOVERY_REQUIRED',
    });
    expect(JSON.stringify(result)).not.toContain('database secret');
    expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('recovers accepted and definite evidence from UNKNOWN through the existing resolvers', async () => {
    const harness = createHarness();
    harness.attemptService.recordAccepted.mockResolvedValueOnce({
      receipt: receipt('UNKNOWN'),
      status: 'INCOMPATIBLE_STATE',
    });
    harness.attemptService.recordDefinitelyUnaccepted.mockResolvedValueOnce({
      receipt: receipt('UNKNOWN'),
      status: 'INCOMPATIBLE_STATE',
    });

    await expect(
      harness.service.recover({
        kind: 'ACCEPTED_EVIDENCE',
        projectedMessageId: ids.message,
        providerMessageId: 'provider-123',
        submission: sequenceSubmission(),
      }),
    ).resolves.toMatchObject({ status: 'ACCEPTED_RECORDED' });
    await expect(
      harness.service.recover({
        kind: 'DEFINITELY_UNACCEPTED_EVIDENCE',
        safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
        submission: sequenceSubmission(),
      }),
    ).resolves.toMatchObject({ status: 'DEFINITELY_UNACCEPTED_RECORDED' });
    expect(harness.attemptService.resolveUnknownAccepted).toHaveBeenCalledTimes(
      1,
    );
    expect(
      harness.attemptService.resolveUnknownDefinitelyUnaccepted,
    ).toHaveBeenCalledTimes(1);
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps ambiguous recovery NOT_DUE pending and records UNKNOWN only when authorized', async () => {
    const harness = createHarness();
    harness.attemptService.markUnknownAfterDeadline
      .mockResolvedValueOnce({ receipt: receipt(), status: 'NOT_DUE' })
      .mockResolvedValueOnce(recorded('UNKNOWN'));
    const evidence = {
      kind: 'AMBIGUOUS_EVIDENCE' as const,
      submission: sequenceSubmission(),
    };

    await expect(harness.service.recover(evidence)).resolves.toMatchObject({
      status: 'UNKNOWN_PENDING_DEADLINE',
    });
    await expect(harness.service.recover(evidence)).resolves.toMatchObject({
      status: 'UNKNOWN_RECORDED',
    });
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('holds recovery identity/evidence conflicts without overwriting', async () => {
    const harness = createHarness();
    harness.attemptService.recordAccepted.mockResolvedValueOnce({
      status: 'IDENTITY_CONFLICT',
    });

    await expect(
      harness.service.recover({
        kind: 'ACCEPTED_EVIDENCE',
        projectedMessageId: ids.message,
        providerMessageId: 'provider-123',
        submission: sequenceSubmission(),
      }),
    ).resolves.toMatchObject({ status: 'OUTCOME_RECOVERY_REQUIRED' });
    expect(
      harness.attemptService.resolveUnknownAccepted,
    ).not.toHaveBeenCalled();
  });

  it('rejects in-place authority digest and nested-binding mutation', async () => {
    const harness = createHarness();
    harness.revalidator.revalidate = jest.fn(async ({ submission }) => {
      expect(
        Reflect.set(submission, 'finalEvidenceDigest', 'f'.repeat(64)),
      ).toBe(false);
      submission.submissionCapability.reservationBinding.slotAt.setTime(
        Date.parse('2026-09-09T12:00:01.000Z'),
      );
      return {
        projectedMessageId: ids.message,
        status: 'AUTHORIZED' as const,
        submission,
      };
    });

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('does not expose its retained submission baseline to later revalidator mutation', async () => {
    const harness = createHarness();
    let retainedByRevalidator: BeginOutboundEmailSubmissionInput | undefined;
    harness.revalidator.revalidate = jest.fn(async ({ submission }) => {
      retainedByRevalidator = submission;
      return {
        projectedMessageId: ids.message,
        status: 'AUTHORIZED' as const,
        submission,
      };
    });
    harness.attemptService.beginSubmission.mockImplementationOnce(
      async (submission) => {
        expect(Object.isFrozen(retainedByRevalidator)).toBe(true);
        expect(
          retainedByRevalidator
            ? Reflect.set(
                retainedByRevalidator,
                'finalEvidenceDigest',
                'f'.repeat(64),
              )
            : true,
        ).toBe(false);
        expect(submission.finalEvidenceDigest).toBe(finalDigest);
        expect(submission).not.toBe(retainedByRevalidator);
        return { receipt: receipt(), status: 'PROCESSING_ACQUIRED' };
      },
    );

    await expect(
      harness.service.dispatch(dispatchInput()),
    ).resolves.toMatchObject({
      status: 'ACCEPTED_RECORDED',
    });
  });

  it('snapshots caller account, recipient and attachment bytes before awaiting authority', async () => {
    const harness = createHarness();
    let releaseAuthority: (() => void) | undefined;
    const authorityPaused = new Promise<void>((resolve) => {
      releaseAuthority = resolve;
    });
    harness.revalidator.revalidate = jest.fn(async ({ submission }) => {
      await authorityPaused;
      return {
        projectedMessageId: ids.message,
        status: 'AUTHORIZED' as const,
        submission,
      };
    });
    const input = dispatchInput();
    const bytes = Buffer.from('original');
    input.material.sendMessageInput.attachments = [
      { content: bytes, contentType: 'text/plain', filename: 'proof.txt' },
    ];

    const pending = harness.service.dispatch(input);
    input.material.connectedAccount.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    input.material.sendMessageInput.to = 'attacker@example.com';
    bytes.fill(0);
    releaseAuthority?.();
    await pending;

    expect(harness.outboundService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ content: Buffer.from('original') }),
        ],
        to: 'recipient@example.com',
      }),
      expect.objectContaining({ id: ids.account }),
    );
  });

  it('retains verified projectedMessageId while provider execution is pending', async () => {
    const harness = createHarness();
    let resolveProvider:
      | ((value: { headerMessageId: string }) => void)
      | undefined;
    let markProviderEntered: (() => void) | undefined;
    const providerEntered = new Promise<void>((resolve) => {
      markProviderEntered = resolve;
    });
    harness.outboundService.sendMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProvider = resolve;
          markProviderEntered?.();
        }),
    );
    const input = dispatchInput();
    const pending = harness.service.dispatch(input);
    await providerEntered;
    input.material.projectedMessageId = ids.channel;
    resolveProvider?.({ headerMessageId: '<accepted@example.com>' });
    await pending;

    expect(harness.attemptService.recordAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ projectedMessageId: ids.message }),
      expect.anything(),
    );
  });

  it('returns independently frozen recovery evidence without caller aliases', async () => {
    const harness = createHarness();
    const input = dispatchInput();
    harness.outboundService.sendMessage.mockRejectedValueOnce(
      new Error('ambiguous'),
    );

    const result = await harness.service.dispatch(input);
    expect(result.status).toBe('UNKNOWN_PENDING_DEADLINE');
    if (result.status !== 'UNKNOWN_PENDING_DEADLINE') return;
    input.submission.finalEvidenceDigest = 'f'.repeat(64);

    expect(result.evidence.submission.finalEvidenceDigest).toBe(finalDigest);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.evidence.submission)).toBe(true);
  });

  it.each([
    [
      'submission top-level secret',
      (input: any) => (input.submission.accessToken = 'secret'),
    ],
    [
      'nested capability body',
      (input: any) => (input.submission.submissionCapability.body = 'secret'),
    ],
    [
      'nested binding credential',
      (input: any) =>
        (input.submission.submissionCapability.reservationBinding.credential =
          'secret'),
    ],
    ['material raw body', (input: any) => (input.material.rawBody = 'secret')],
    [
      'send envelope secret',
      (input: any) => (input.material.sendMessageInput.accessToken = 'secret'),
    ],
    [
      'submission symbol',
      (input: any) =>
        Object.defineProperty(input.submission, Symbol('secret'), {
          value: 'secret',
        }),
    ],
    [
      'submission accessor',
      (input: any) =>
        Object.defineProperty(input.submission, 'accessToken', {
          enumerable: true,
          get: () => 'secret',
        }),
    ],
    [
      'submission cycle',
      (input: any) => (input.submission.cycle = input.submission),
    ],
    [
      'submission function',
      (input: any) => (input.submission.callback = () => 'secret'),
    ],
  ])(
    'fails closed before transaction for unsafe/extra shape: %s',
    async (_name, mutate) => {
      const harness = createHarness();
      const input = dispatchInput() as any;
      mutate(input);

      await expect(harness.service.dispatch(input)).resolves.toEqual({
        status: 'CONTRACT_CONFLICT',
      });
      expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('fails closed when proxy descriptor traps throw', async () => {
    const harness = createHarness();
    const input = dispatchInput() as any;
    const hook = jest.fn(() => {
      throw new Error('proxy-secret');
    });
    input.submission = new Proxy(input.submission, {
      getPrototypeOf: hook,
      ownKeys: hook,
    });

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it('strips connected-account credentials before transport', async () => {
    const harness = createHarness();
    const input = dispatchInput() as any;
    input.material.connectedAccount.accessToken = 'credential-secret';
    input.material.connectedAccount.refreshToken = 'refresh-secret';

    await harness.service.dispatch(input);

    const transportedAccount = harness.outboundService.sendMessage.mock
      .calls[0][1] as any;
    expect(transportedAccount).toEqual({
      id: ids.account,
      provider: ConnectedAccountProvider.GOOGLE,
    });
    expect(JSON.stringify(transportedAccount)).not.toContain('secret');
  });

  it('rejects extra recovery envelope fields without leaking them', async () => {
    const harness = createHarness();
    const evidence = {
      kind: 'AMBIGUOUS_EVIDENCE' as const,
      rawError: 'credential-secret',
      submission: sequenceSubmission(),
    };

    const result = await harness.service.recover(evidence);

    expect(result).toEqual({ status: 'CONTRACT_CONFLICT' });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it('models canonical source lock order before CAS on the same manager', async () => {
    const harness = createHarness();
    harness.revalidator.revalidate = jest.fn(
      async ({ submission }, manager) => {
        expect(manager).toBe(harness.managers[0]);
        harness.events.push('lock:campaign');
        harness.events.push('lock:enrollment');
        harness.events.push('lock:occurrence');
        harness.events.push('revalidate');
        return {
          projectedMessageId: ids.message,
          status: 'AUTHORIZED' as const,
          submission,
        };
      },
    );

    await harness.service.dispatch(dispatchInput());

    expect(harness.events.indexOf('lock:campaign')).toBeLessThan(
      harness.events.indexOf('lock:enrollment'),
    );
    expect(harness.events.indexOf('lock:enrollment')).toBeLessThan(
      harness.events.indexOf('lock:occurrence'),
    );
    expect(harness.events.indexOf('lock:occurrence')).toBeLessThan(
      harness.events.indexOf('beginSubmission'),
    );
  });

  it('rejects submission-only substitution independently', async () => {
    const harness = createHarness();
    const changed = sequenceSubmission();
    changed.finalEvidenceDigest = 'f'.repeat(64);
    harness.revalidator.revalidate = jest.fn(async () => ({
      projectedMessageId: ids.message,
      status: 'AUTHORIZED' as const,
      submission: changed,
    }));

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
  });

  it('rejects projection-only substitution independently', async () => {
    const harness = createHarness();
    harness.revalidator.revalidate = jest.fn(async ({ submission }) => ({
      projectedMessageId: ids.channel,
      status: 'AUTHORIZED' as const,
      submission,
    }));

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid updatedAt', new Date(Number.NaN), unknownAfter, 10_000, 10_000],
    ['invalid unknownAfter', updatedAt, new Date(Number.NaN), 10_000, 10_000],
    [
      'finite arithmetic overflow',
      updatedAt,
      unknownAfter,
      -Number.MAX_VALUE,
      Number.MAX_VALUE,
    ],
    [
      'negative receipt window',
      updatedAt,
      new Date('2026-09-09T11:59:59.000Z'),
      10_000,
      10_000,
    ],
  ])(
    'holds unsafe provider-entry arithmetic as ambiguous: %s',
    async (_name, receiptUpdatedAt, receiptUnknownAfter, anchor, entry) => {
      const harness = createHarness();
      harness.attemptService.beginSubmission.mockResolvedValueOnce({
        receipt: {
          ...receipt(),
          unknownAfter: receiptUnknownAfter,
          updatedAt: receiptUpdatedAt,
        },
        status: 'PROCESSING_ACQUIRED',
      });
      (harness.clock.now as jest.Mock)
        .mockReset()
        .mockReturnValueOnce(anchor)
        .mockReturnValueOnce(entry);

      await expect(
        harness.service.dispatch(dispatchInput()),
      ).resolves.toMatchObject({
        status: 'UNKNOWN_PENDING_DEADLINE',
      });
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
      expect(
        harness.attemptService.recordDefinitelyUnaccepted,
      ).not.toHaveBeenCalled();
      expect(
        harness.attemptService.markUnknownAfterDeadline,
      ).not.toHaveBeenCalled();
    },
  );

  it('does not submit when winner transaction commit fails', async () => {
    const harness = createHarness();
    harness.transactionPort.runInTransaction = jest.fn(async (work) => {
      await work(harness.managers[0]);
      throw new Error('commit-secret');
    });

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('returns recovery without resending when outcome commit fails', async () => {
    const harness = createHarness();
    let transaction = 0;
    harness.transactionPort.runInTransaction = jest.fn(async (work) => {
      transaction += 1;
      const value = await work(harness.managers[Math.min(transaction - 1, 1)]);
      if (transaction === 2) throw new Error('outcome-commit-secret');
      return value;
    });

    const result = await harness.service.dispatch(dispatchInput());

    expect(result).toMatchObject({
      evidence: { kind: 'ACCEPTED_EVIDENCE' },
      status: 'OUTCOME_RECOVERY_REQUIRED',
    });
    expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['accepted', 'definite'] as const)(
    'treats %s EXACT_REPLAY recovery as idempotent success',
    async (kind) => {
      const harness = createHarness();
      const replay = {
        receipt: receipt(
          kind === 'accepted' ? 'ACCEPTED' : 'DEFINITELY_UNACCEPTED',
        ),
        status: 'EXACT_REPLAY' as const,
      };
      if (kind === 'accepted') {
        harness.attemptService.recordAccepted.mockResolvedValueOnce(replay);
        await expect(
          harness.service.recover({
            kind: 'ACCEPTED_EVIDENCE',
            projectedMessageId: ids.message,
            providerMessageId: 'provider-123',
            submission: sequenceSubmission(),
          }),
        ).resolves.toMatchObject({ status: 'ACCEPTED_RECORDED' });
      } else {
        harness.attemptService.recordDefinitelyUnaccepted.mockResolvedValueOnce(
          replay,
        );
        await expect(
          harness.service.recover({
            kind: 'DEFINITELY_UNACCEPTED_EVIDENCE',
            safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
            submission: sequenceSubmission(),
          }),
        ).resolves.toMatchObject({ status: 'DEFINITELY_UNACCEPTED_RECORDED' });
      }
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      { headerMessageId: '<header@example.com>', messageExternalId: 42 },
      'ACCEPTED_RECORDED',
    ],
    [
      { headerMessageId: 42, messageExternalId: null },
      'OUTCOME_RECOVERY_REQUIRED',
    ],
    [null, 'OUTCOME_RECOVERY_REQUIRED'],
    [42, 'OUTCOME_RECOVERY_REQUIRED'],
  ])(
    'keeps malformed fulfilled output accepted: %#',
    async (providerResult, status) => {
      const harness = createHarness();
      harness.outboundService.sendMessage.mockResolvedValueOnce(
        providerResult as never,
      );

      const result = await harness.service.dispatch(dispatchInput());

      expect(result.status).toBe(status);
      expect(result.status).not.toBe('UNKNOWN_PENDING_DEADLINE');
      expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
    },
  );

  it('treats fulfilled identity getter failure as accepted-but-unpersistable', async () => {
    const harness = createHarness();
    const output = {};
    Object.defineProperty(output, 'messageExternalId', {
      get: () => {
        throw new Error('getter-secret');
      },
    });
    harness.outboundService.sendMessage.mockResolvedValueOnce(output as never);

    const result = await harness.service.dispatch(dispatchInput());

    expect(result).toMatchObject({
      evidence: { kind: 'UNPERSISTABLE_ACCEPTANCE_EVIDENCE' },
      status: 'OUTCOME_RECOVERY_REQUIRED',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it.each([
    Object.assign(new Error('abort-secret'), { name: 'AbortError' }),
    Object.defineProperty({}, 'responseCode', {
      get: () => {
        throw new Error('classifier-secret');
      },
    }),
    new Proxy(
      {},
      {
        has: () => {
          throw new Error('proxy-secret');
        },
      },
    ),
  ])('sanitizes abort/classifier failures as ambiguous', async (error) => {
    const harness = createHarness();
    harness.outboundService.sendMessage.mockRejectedValueOnce(error);

    const result = await harness.service.dispatch(dispatchInput());

    expect(result).toMatchObject({
      evidence: { kind: 'AMBIGUOUS_EVIDENCE' },
      status: 'UNKNOWN_PENDING_DEADLINE',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(
      harness.attemptService.recordDefinitelyUnaccepted,
    ).not.toHaveBeenCalled();
  });

  it('snapshots trusted recovery evidence before awaiting persistence', async () => {
    const harness = createHarness();
    let releasePersistence: (() => void) | undefined;
    const paused = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    harness.attemptService.markUnknownAfterDeadline.mockImplementationOnce(
      async (submission) => {
        await paused;
        expect(submission.finalEvidenceDigest).toBe(finalDigest);
        return { receipt: receipt(), status: 'NOT_DUE' };
      },
    );
    const evidence = {
      kind: 'AMBIGUOUS_EVIDENCE' as const,
      submission: sequenceSubmission(),
    };
    const pending = harness.service.recover(evidence);
    evidence.submission.finalEvidenceDigest = 'f'.repeat(64);
    releasePersistence?.();
    const result = await pending;

    expect(result.status).toBe('UNKNOWN_PENDING_DEADLINE');
    if (result.status !== 'UNKNOWN_PENDING_DEADLINE') return;
    expect(result.evidence.submission.finalEvidenceDigest).toBe(finalDigest);
    expect(result.evidence).not.toBe(evidence);
    expect(Object.isFrozen(result.evidence.submission)).toBe(true);
  });

  it('rejects non-plain nested objects before transaction entry', async () => {
    const harness = createHarness();
    const input = dispatchInput() as any;
    input.submission.submissionCapability = Object.assign(
      Object.create(new (class UnsafePrototype {})()),
      input.submission.submissionCapability,
    );

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it('forwards an independent exact IMAP/SMTP parameter clone to transport', async () => {
    const harness = createHarness();
    const input = imapDispatchInput();
    const originalParameters =
      input.material.connectedAccount.connectionParameters;

    await expect(harness.service.dispatch(input)).resolves.toMatchObject({
      status: 'ACCEPTED_RECORDED',
    });

    const transportedAccount =
      harness.outboundService.sendMessage.mock.calls[0][1];
    expect(transportedAccount).toEqual({
      connectionParameters: validConnectionParameters(),
      handle: 'sender@example.com',
      id: ids.account,
      provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
    });
    expect(transportedAccount.connectionParameters).not.toBe(
      originalParameters,
    );
    expect(transportedAccount.connectionParameters?.IMAP).not.toBe(
      originalParameters?.IMAP,
    );
    expect(transportedAccount.connectionParameters?.SMTP).not.toBe(
      originalParameters?.SMTP,
    );
  });

  it.each([
    [
      'missing parameters',
      (account: any) => delete account.connectionParameters,
    ],
    [
      'missing IMAP',
      (account: any) => delete account.connectionParameters.IMAP,
    ],
    [
      'missing SMTP',
      (account: any) => delete account.connectionParameters.SMTP,
    ],
    [
      'invalid port',
      (account: any) => (account.connectionParameters.SMTP.port = 0),
    ],
    [
      'extra nested key',
      (account: any) => (account.connectionParameters.IMAP.token = 'secret'),
    ],
    [
      'password accessor',
      (account: any) =>
        Object.defineProperty(account.connectionParameters.SMTP, 'password', {
          enumerable: true,
          get: () => 'secret',
        }),
    ],
    [
      'parameter proxy',
      (account: any) =>
        (account.connectionParameters.IMAP = new Proxy(
          account.connectionParameters.IMAP,
          {
            ownKeys: () => {
              throw new Error('proxy-secret');
            },
          },
        )),
    ],
    [
      'parameter cycle',
      (account: any) =>
        (account.connectionParameters.IMAP.host = account.connectionParameters),
    ],
    [
      'nonplain parameters',
      (account: any) =>
        (account.connectionParameters.SMTP = Object.assign(
          Object.create(new (class UnsafeParameters {})()),
          account.connectionParameters.SMTP,
        )),
    ],
  ])(
    'blocks malformed IMAP material before authority/CAS/provider: %s',
    async (_name, mutate) => {
      const harness = createHarness();
      const input = imapDispatchInput();
      mutate(input.material.connectedAccount);

      const result = await harness.service.dispatch(input);

      expect(result).toEqual({
        reason: 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL',
        status: 'BLOCKED',
      });
      expect(JSON.stringify(result)).not.toContain('secret');
      expect(harness.revalidator.revalidate).not.toHaveBeenCalled();
      expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
      expect(
        harness.outboundService.getProviderRequestTimeoutMs,
      ).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('isolates IMAP passwords from caller mutation across authority and provider awaits', async () => {
    const harness = createHarness();
    let releaseAuthority: (() => void) | undefined;
    const authorityPaused = new Promise<void>((resolve) => {
      releaseAuthority = resolve;
    });
    harness.revalidator.revalidate = jest.fn(async ({ submission }) => {
      await authorityPaused;
      return {
        projectedMessageId: ids.message,
        status: 'AUTHORIZED' as const,
        submission,
      };
    });
    let releaseProvider: (() => void) | undefined;
    const providerPaused = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    let transportedAccount: ConnectedAccountEntity | undefined;
    let providerEntered: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      providerEntered = resolve;
    });
    harness.outboundService.sendMessage.mockImplementationOnce(
      async (_message, connectedAccount) => {
        transportedAccount = connectedAccount;
        providerEntered?.();
        await providerPaused;
        return { headerMessageId: '<accepted@example.com>' };
      },
    );
    const input = imapDispatchInput();
    const pending = harness.service.dispatch(input);
    if (input.material.connectedAccount.connectionParameters?.IMAP) {
      input.material.connectedAccount.connectionParameters.IMAP.password =
        'mutated-before-provider' as never;
    }
    releaseAuthority?.();
    await entered;
    if (input.material.connectedAccount.connectionParameters?.SMTP) {
      input.material.connectedAccount.connectionParameters.SMTP.password =
        'mutated-during-provider' as never;
    }
    releaseProvider?.();
    await pending;

    expect(transportedAccount?.connectionParameters).toEqual(
      validConnectionParameters(),
    );
    expect(transportedAccount?.connectionParameters).not.toBe(
      input.material.connectedAccount.connectionParameters,
    );
  });

  it.each([
    [
      ConnectedAccountProvider.GOOGLE,
      { id: ids.account, provider: ConnectedAccountProvider.GOOGLE },
    ],
    [
      ConnectedAccountProvider.MICROSOFT,
      { id: ids.account, provider: ConnectedAccountProvider.MICROSOFT },
    ],
    [
      ConnectedAccountProvider.EMAIL_GROUP,
      {
        handle: 'sender@example.com',
        provider: ConnectedAccountProvider.EMAIL_GROUP,
        workspaceId: ids.workspace,
      },
    ],
  ])(
    'projects only concrete %s transport account fields',
    async (provider, expected) => {
      const harness = createHarness();
      const input = dispatchInput();
      input.material.connectedAccount.provider = provider;
      input.submission.provider = provider;
      if (input.submission.source === 'CAMPAIGN_SEQUENCE') {
        input.submission.submissionCapability.renderContext.provider = provider;
      }
      (input.material.connectedAccount as any).accessToken = 'access-secret';
      (input.material.connectedAccount as any).refreshToken = 'refresh-secret';
      (input.material.connectedAccount as any).connectionParameters = {
        private: 'irrelevant-secret',
      };

      await harness.service.dispatch(input);

      const transportedAccount =
        harness.outboundService.sendMessage.mock.calls[0][1];
      expect(transportedAccount).toEqual(expected);
      expect(JSON.stringify(transportedAccount)).not.toContain('secret');
    },
  );

  it('keeps IMAP connection parameters out of authority, attempt and outcome ports', async () => {
    const harness = createHarness();

    await harness.service.dispatch(imapDispatchInput());

    for (const portCall of [
      harness.outboundService.getProviderRequestTimeoutMs.mock.calls[0][0],
      (harness.revalidator.revalidate as jest.Mock).mock.calls[0][0],
      harness.attemptService.beginSubmission.mock.calls[0][0],
      (harness.attemptService.recordAccepted as jest.Mock).mock.calls[0][0],
    ]) {
      const serialized = JSON.stringify(portCall);
      expect(serialized).not.toContain('connectionParameters');
      expect(serialized).not.toContain('imap-secret');
      expect(serialized).not.toContain('smtp-secret');
    }
  });

  it.each(['accepted', 'ambiguous', 'recovery'] as const)(
    'never serializes IMAP connection parameters in %s results',
    async (outcome) => {
      const harness = createHarness();
      const input = imapDispatchInput();
      let result;
      if (outcome === 'ambiguous') {
        harness.outboundService.sendMessage.mockRejectedValueOnce(
          new Error('provider-secret'),
        );
        result = await harness.service.dispatch(input);
      } else if (outcome === 'recovery') {
        harness.attemptService.recordAccepted.mockRejectedValueOnce(
          new Error('database-secret'),
        );
        result = await harness.service.dispatch(input);
      } else {
        result = await harness.service.dispatch(input);
      }

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('connectionParameters');
      expect(serialized).not.toContain('imap-secret');
      expect(serialized).not.toContain('smtp-secret');
    },
  );

  it.each([
    ['IMAP', 0, false],
    ['IMAP', 1, true],
    ['IMAP', 65_535, true],
    ['IMAP', 65_536, false],
    ['SMTP', 0, false],
    ['SMTP', 1, true],
    ['SMTP', 65_535, true],
    ['SMTP', 65_536, false],
  ] as const)(
    'validates %s TCP port %i before injected calls (accepted=%s)',
    async (protocol, port, accepted) => {
      const harness = createHarness();
      const input = imapDispatchInput();
      input.material.connectedAccount.connectionParameters![protocol]!.port =
        port;

      const result = await harness.service.dispatch(input);

      if (accepted) {
        expect(result).toMatchObject({ status: 'ACCEPTED_RECORDED' });
        expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
      } else {
        expect(result).toEqual({
          reason: 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL',
          status: 'BLOCKED',
        });
        expect(
          harness.outboundService.getProviderRequestTimeoutMs,
        ).not.toHaveBeenCalled();
        expect(harness.revalidator.revalidate).not.toHaveBeenCalled();
        expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
        expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
        expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    'cc',
    'bcc',
    'attachments',
    'inReplyTo',
    'threadExternalId',
    'references',
  ] as const)(
    'treats declared optional send field %s set to undefined as absent',
    async (field) => {
      const harness = createHarness();
      const input = dispatchInput();
      input.material.sendMessageInput[field] = undefined;

      await expect(harness.service.dispatch(input)).resolves.toMatchObject({
        status: 'ACCEPTED_RECORDED',
      });
      expect(
        harness.outboundService.sendMessage.mock.calls[0][0],
      ).not.toHaveProperty(field);
    },
  );

  it('rejects a nonthrowing submission proxy without executing its hooks', async () => {
    const harness = createHarness();
    const input = dispatchInput() as any;
    const hook = jest.fn();
    const target = input.submission;
    input.submission = new Proxy(target, {
      getOwnPropertyDescriptor: (_target, key) => {
        hook();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      getPrototypeOf: () => {
        hook();
        return Object.getPrototypeOf(target);
      },
      ownKeys: () => {
        hook();
        return Reflect.ownKeys(target);
      },
    });

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a nonthrowing authority-result proxy without executing its hooks', async () => {
    const harness = createHarness();
    const hook = jest.fn();
    harness.revalidator.revalidate = jest.fn(async ({ submission }) => {
      const target = {
        projectedMessageId: ids.message,
        status: 'AUTHORIZED' as const,
        submission,
      };
      return new Proxy(target, {
        getOwnPropertyDescriptor: (_target, key) => {
          hook();
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
        getPrototypeOf: () => {
          hook();
          return Object.getPrototypeOf(target);
        },
        ownKeys: () => {
          hook();
          return Reflect.ownKeys(target);
        },
      });
    });

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('blocks an IMAP parameter proxy without executing its hooks', async () => {
    const harness = createHarness();
    const hook = jest.fn();
    const input = imapDispatchInput();
    const target = input.material.connectedAccount.connectionParameters!.IMAP!;
    input.material.connectedAccount.connectionParameters!.IMAP = new Proxy(
      target,
      {
        getOwnPropertyDescriptor: (_target, key) => {
          hook();
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
        getPrototypeOf: () => {
          hook();
          return Object.getPrototypeOf(target);
        },
        ownKeys: () => {
          hook();
          return Reflect.ownKeys(target);
        },
      },
    );

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      reason: 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL',
      status: 'BLOCKED',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects a connected-account proxy without executing its hooks', async () => {
    const harness = createHarness();
    const input = dispatchInput();
    const hook = jest.fn(() => {
      throw new Error('account-proxy-hook');
    });
    input.material.connectedAccount = new Proxy(
      input.material.connectedAccount,
      {
        getPrototypeOf: hook,
        ownKeys: hook,
      },
    );

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a recovery-evidence proxy without executing its hooks', async () => {
    const harness = createHarness();
    const hook = jest.fn(() => {
      throw new Error('recovery-proxy-hook');
    });
    const evidence = new Proxy(
      {
        kind: 'AMBIGUOUS_EVIDENCE' as const,
        submission: sequenceSubmission(),
      },
      {
        getPrototypeOf: hook,
        ownKeys: hook,
      },
    );

    await expect(harness.service.recover(evidence)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a Date subclass without invoking its overridden getTime', async () => {
    const harness = createHarness();
    const hook = jest.fn(() => Date.parse('2026-09-09T12:00:00.000Z'));
    class UnsafeDate extends Date {
      override getTime(): number {
        return hook();
      }
    }
    const input = dispatchInput();
    const unsafeDate = new Date('2026-09-09T12:00:00.000Z');
    Object.setPrototypeOf(unsafeDate, UnsafeDate.prototype);
    expect(Object.getPrototypeOf(unsafeDate)).toBe(UnsafeDate.prototype);
    if (input.submission.source === 'CAMPAIGN_SEQUENCE') {
      input.submission.submissionCapability.reservationBinding.claimedAt =
        unsafeDate;
    }

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'subclass',
      () =>
        new (class UnsafeArray<T> extends Array<T> {})('recipient@example.com'),
    ],
    [
      'custom prototype',
      () => Object.setPrototypeOf(['recipient@example.com'], {}),
    ],
  ])('rejects a send-address array with %s', async (_name, createArray) => {
    const harness = createHarness();
    const input = dispatchInput();
    input.material.sendMessageInput.to = createArray();

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a Buffer with an own valueOf without invoking byte substitution', async () => {
    const harness = createHarness();
    const input = dispatchInput();
    const content = Buffer.from('original');
    const hook = jest.fn(() => Buffer.from('substituted'));
    Object.defineProperty(content, 'valueOf', {
      configurable: true,
      value: hook,
    });
    input.material.sendMessageInput.attachments = [
      { content, contentType: 'text/plain', filename: 'proof.txt' },
    ];

    await expect(harness.service.dispatch(input)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(content.toString()).toBe('original');
    expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'toJSON',
      (content: Buffer, hook: jest.Mock) =>
        Object.defineProperty(content, 'toJSON', {
          configurable: true,
          value: hook,
        }),
    ],
    [
      'accessor',
      (content: Buffer, hook: jest.Mock) =>
        Object.defineProperty(content, 'secret', {
          configurable: true,
          get: hook,
        }),
    ],
    [
      'symbol',
      (content: Buffer, hook: jest.Mock) =>
        Object.defineProperty(content, Symbol('secret'), {
          configurable: true,
          value: hook,
        }),
    ],
  ])(
    'rejects a Buffer with an own %s extra without executing it',
    async (_name, decorate) => {
      const harness = createHarness();
      const input = dispatchInput();
      const content = Buffer.from('original');
      const hook = jest.fn();
      decorate(content, hook);
      input.material.sendMessageInput.attachments = [
        { content, contentType: 'text/plain', filename: 'proof.txt' },
      ];

      await expect(harness.service.dispatch(input)).resolves.toEqual({
        status: 'CONTRACT_CONFLICT',
      });
      expect(hook).not.toHaveBeenCalled();
      expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
    },
  );

  it('rejects Buffer subclasses and proxies before transport', async () => {
    class UnsafeBuffer extends Buffer {}
    const subclassBuffer = Buffer.from('original');
    Object.setPrototypeOf(subclassBuffer, UnsafeBuffer.prototype);
    const proxyHook = jest.fn(() => {
      throw new Error('buffer-proxy-hook');
    });
    const variants = [
      subclassBuffer,
      new Proxy(Buffer.from('original'), {
        get: proxyHook,
        getPrototypeOf: proxyHook,
        ownKeys: proxyHook,
      }),
    ];

    for (const content of variants) {
      const harness = createHarness();
      const input = dispatchInput();
      input.material.sendMessageInput.attachments = [
        { content, contentType: 'text/plain', filename: 'proof.txt' },
      ];
      await expect(harness.service.dispatch(input)).resolves.toEqual({
        status: 'CONTRACT_CONFLICT',
      });
      expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    }
    expect(proxyHook).not.toHaveBeenCalled();
  });

  it('finishes attachment copies before the final entry sample', async () => {
    const harness = createHarness();
    const input = dispatchInput();
    const original = Buffer.from('original');
    input.material.sendMessageInput.attachments = [
      { content: original, contentType: 'text/plain', filename: 'proof.txt' },
    ];
    harness.clock.now = jest
      .fn()
      .mockReturnValueOnce(10_000)
      .mockImplementationOnce(() => {
        original.fill(0);
        harness.events.push('finalClockSample');
        return 10_000;
      });

    await harness.service.dispatch(input);

    expect(harness.events).toEqual([
      'transaction:0:start',
      'revalidate',
      'beginSubmission',
      'transaction:0:commit',
      'finalClockSample',
      'sendMessage',
      'transaction:1:start',
      'recordAccepted',
      'transaction:1:commit',
    ]);
    expect(
      harness.outboundService.sendMessage.mock.calls[0][0].attachments![0]
        .content,
    ).toEqual(Buffer.from('original'));
  });

  it('consumes preparation/suspension delay before entry and prevents provider call', async () => {
    const harness = createHarness();
    const input = dispatchInput();
    input.material.sendMessageInput.attachments = [
      {
        content: Buffer.alloc(32, 7),
        contentType: 'application/octet-stream',
        filename: 'proof.bin',
      },
    ];
    harness.clock.now = jest
      .fn()
      .mockReturnValueOnce(10_000)
      .mockImplementationOnce(() => {
        harness.events.push('finalClockSampleAfterDelay');
        return 40_001;
      });

    await expect(harness.service.dispatch(input)).resolves.toMatchObject({
      status: 'DEFINITELY_UNACCEPTED_RECORDED',
    });
    expect(harness.events).toEqual([
      'transaction:0:start',
      'revalidate',
      'beginSubmission',
      'transaction:0:commit',
      'finalClockSampleAfterDelay',
      'transaction:1:start',
      'recordDefinitelyUnaccepted',
      'transaction:1:commit',
    ]);
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it.each(['proxy date', 'receipt accessor'] as const)(
    'holds malformed committed receipt as ambiguous without executing %s hooks',
    async (kind) => {
      const harness = createHarness();
      const hook = jest.fn(() => {
        throw new Error('receipt-hook');
      });
      const malformedReceipt = receipt() as any;
      if (kind === 'proxy date') {
        malformedReceipt.unknownAfter = new Proxy(
          malformedReceipt.unknownAfter,
          {
            get: hook,
            getPrototypeOf: hook,
            ownKeys: hook,
          },
        );
      } else {
        Object.defineProperty(malformedReceipt, 'unknownAfter', {
          enumerable: true,
          get: hook,
        });
      }
      harness.attemptService.beginSubmission.mockResolvedValueOnce({
        receipt: malformedReceipt,
        status: 'PROCESSING_ACQUIRED',
      });

      const result = await harness.service.dispatch(dispatchInput());

      expect(result).toMatchObject({ status: 'UNKNOWN_PENDING_DEADLINE' });
      expect(hook).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
      expect(
        harness.attemptService.recordDefinitelyUnaccepted,
      ).not.toHaveBeenCalled();
      expect(
        harness.attemptService.markUnknownAfterDeadline,
      ).not.toHaveBeenCalled();
    },
  );

  const reservationScalarCases = [
    {
      name: 'sequence attemptNumber',
      numeric: true,
      set: (submission: any, value: unknown) => {
        submission.submissionCapability.reservationBinding.attemptNumber =
          value;
      },
      submission: () => sequenceSubmission(),
    },
    {
      name: 'sequence senderPoolFingerprint',
      numeric: false,
      set: (submission: any, value: unknown) => {
        submission.submissionCapability.reservationBinding.senderPoolFingerprint =
          value;
      },
      submission: () => sequenceSubmission(),
    },
    {
      name: 'test senderPoolFingerprint',
      numeric: false,
      set: (submission: any, value: unknown) => {
        submission.submissionCapability.reservationBinding.senderPoolFingerprint =
          value;
      },
      submission: () => testSubmission(),
    },
    {
      name: 'direct reservation capability',
      numeric: false,
      set: (submission: any, value: unknown) => {
        submission.submissionCapability.reservationBinding.directReservationCapabilityId =
          value;
      },
      submission: () => directSubmission('INBOX'),
    },
  ];
  const unsafeScalarKinds = ['proxy', 'accessor object', 'boxed'] as const;

  it.each(
    reservationScalarCases.flatMap((scalarCase) =>
      unsafeScalarKinds.map((kind) => [scalarCase, kind] as const),
    ),
  )(
    'rejects %s %s without hooks, caller freezing, or unauthorized calls',
    async (scalarCase, kind) => {
      const createUnsafeValue = () => {
        const hook = jest.fn(() => {
          throw new Error('reservation-scalar-hook');
        });
        const target: Record<string, unknown> = {};
        if (kind === 'accessor object') {
          Object.defineProperty(target, 'secret', {
            enumerable: true,
            get: hook,
          });
          return { hook, target, value: target };
        }
        if (kind === 'boxed') {
          const boxed = scalarCase.numeric
            ? new Number(1)
            : new String('a'.repeat(64));
          return { hook, target: boxed, value: boxed };
        }
        return {
          hook,
          target,
          value: new Proxy(target, {
            get: hook,
            getOwnPropertyDescriptor: hook,
            getPrototypeOf: hook,
            ownKeys: hook,
            preventExtensions: hook,
          }),
        };
      };

      const initial = createUnsafeValue();
      const initialSubmission = scalarCase.submission();
      scalarCase.set(initialSubmission, initial.value);
      const initialHarness = createHarness();
      await expect(
        initialHarness.service.dispatch(dispatchInput(initialSubmission)),
      ).resolves.toEqual({
        reason: 'INVALID_RESERVATION_BINDING',
        status: 'BLOCKED',
      });
      expect(initial.hook).not.toHaveBeenCalled();
      expect(Object.isFrozen(initial.target)).toBe(false);
      expect(
        initialHarness.outboundService.getProviderRequestTimeoutMs,
      ).not.toHaveBeenCalled();
      expect(initialHarness.revalidator.revalidate).not.toHaveBeenCalled();
      expect(
        initialHarness.transactionPort.runInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        initialHarness.attemptService.beginSubmission,
      ).not.toHaveBeenCalled();
      expect(initialHarness.outboundService.sendMessage).not.toHaveBeenCalled();

      const authority = createUnsafeValue();
      const authorityHarness = createHarness();
      authorityHarness.revalidator.revalidate = jest.fn(async () => {
        const invalidSubmission = scalarCase.submission();
        scalarCase.set(invalidSubmission, authority.value);
        return {
          projectedMessageId: ids.message,
          status: 'AUTHORIZED' as const,
          submission: invalidSubmission,
        };
      });
      await expect(
        authorityHarness.service.dispatch(
          dispatchInput(scalarCase.submission()),
        ),
      ).resolves.toEqual({ status: 'CONTRACT_CONFLICT' });
      expect(authority.hook).not.toHaveBeenCalled();
      expect(Object.isFrozen(authority.target)).toBe(false);
      expect(authorityHarness.events).toEqual(['transaction:0:start']);
      expect(
        authorityHarness.attemptService.beginSubmission,
      ).not.toHaveBeenCalled();
      expect(
        authorityHarness.outboundService.sendMessage,
      ).not.toHaveBeenCalled();

      const recovery = createUnsafeValue();
      const recoverySubmission = scalarCase.submission();
      scalarCase.set(recoverySubmission, recovery.value);
      const recoveryHarness = createHarness();
      await expect(
        recoveryHarness.service.recover({
          kind: 'AMBIGUOUS_EVIDENCE',
          submission: recoverySubmission,
        }),
      ).resolves.toEqual({ status: 'CONTRACT_CONFLICT' });
      expect(recovery.hook).not.toHaveBeenCalled();
      expect(Object.isFrozen(recovery.target)).toBe(false);
      expect(
        recoveryHarness.transactionPort.runInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        recoveryHarness.outboundService.sendMessage,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    'first@example.com,second@example.com',
    'first@example.com;second@example.com',
    'first@example.com\r\nBcc:second@example.com',
    'display name <first@example.com>',
    '<first@example.com>',
    'friends:first@example.com;',
  ])(
    'rejects non-single-bare recipient syntax before PROCESSING: %s',
    async (recipient) => {
      const harness = createHarness();
      const input = dispatchInput();
      input.submission.normalizedRecipient = recipient;
      if (input.submission.source === 'CAMPAIGN_SEQUENCE') {
        input.submission.submissionCapability.renderContext.normalizedRecipient =
          recipient;
      }
      input.material.sendMessageInput.to = recipient;

      await expect(harness.service.dispatch(input)).resolves.toEqual({
        status: 'CONTRACT_CONFLICT',
      });
      expect(
        harness.outboundService.getProviderRequestTimeoutMs,
      ).not.toHaveBeenCalled();
      expect(harness.revalidator.revalidate).not.toHaveBeenCalled();
      expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
      expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    'ordinary@example.com',
    'ordinary+tag@example.com',
    'ordinary@bücher.de',
  ])('accepts one canonical bare recipient mailbox: %s', async (recipient) => {
    const harness = createHarness();
    const input = dispatchInput();
    input.submission.normalizedRecipient = recipient;
    if (input.submission.source === 'CAMPAIGN_SEQUENCE') {
      input.submission.submissionCapability.renderContext.normalizedRecipient =
        recipient;
    }
    input.material.sendMessageInput.to = recipient;

    await expect(harness.service.dispatch(input)).resolves.toMatchObject({
      status: 'ACCEPTED_RECORDED',
    });
    expect(harness.outboundService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['bigint', BigInt(10_000), undefined],
    ['symbol', Symbol('clock'), undefined],
    ['boxed number', new Number(10_000), undefined],
    ['NaN', Number.NaN, undefined],
    ['infinity', Number.POSITIVE_INFINITY, undefined],
    ['backwards', 9_999, undefined],
    [
      'throwing coercion object',
      {
        valueOf: jest.fn(() => {
          throw new Error('clock-coercion-hook');
        }),
      },
      'valueOf',
    ],
  ])(
    'holds committed PROCESSING as ambiguous for malformed entry clock: %s',
    async (_name, entrySample, hookKey) => {
      const harness = createHarness();
      (harness.clock.now as jest.Mock)
        .mockReset()
        .mockReturnValueOnce(10_000)
        .mockReturnValueOnce(entrySample);

      await expect(
        harness.service.dispatch(dispatchInput()),
      ).resolves.toMatchObject({ status: 'UNKNOWN_PENDING_DEADLINE' });
      if (hookKey !== undefined) {
        expect((entrySample as any)[hookKey]).not.toHaveBeenCalled();
      }
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
      expect(
        harness.attemptService.recordDefinitelyUnaccepted,
      ).not.toHaveBeenCalled();
      expect(
        harness.attemptService.markUnknownAfterDeadline,
      ).not.toHaveBeenCalled();
    },
  );

  it('holds committed PROCESSING as ambiguous when the final clock throws', async () => {
    const harness = createHarness();
    (harness.clock.now as jest.Mock)
      .mockReset()
      .mockReturnValueOnce(10_000)
      .mockImplementationOnce(() => {
        throw new Error('clock-secret');
      });

    await expect(
      harness.service.dispatch(dispatchInput()),
    ).resolves.toMatchObject({ status: 'UNKNOWN_PENDING_DEADLINE' });
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    expect(
      harness.attemptService.recordDefinitelyUnaccepted,
    ).not.toHaveBeenCalled();
    expect(
      harness.attemptService.markUnknownAfterDeadline,
    ).not.toHaveBeenCalled();
  });

  const withProxyPrototype = <Value extends object>(
    value: Value,
    hook: jest.Mock,
  ): Value => {
    const directPrototype = Object.getPrototypeOf(value);
    Object.setPrototypeOf(
      value,
      new Proxy(directPrototype, {
        getPrototypeOf: hook,
        has: hook,
      }),
    );
    return value;
  };

  it.each([
    {
      expected: { status: 'CONTRACT_CONFLICT' },
      mutate: (input: any, hook: jest.Mock) => {
        input.material.sendMessageInput.attachments = [
          {
            content: withProxyPrototype(Buffer.from('original'), hook),
            contentType: 'text/plain',
            filename: 'proof.txt',
          },
        ];
      },
      name: 'attachment Buffer',
    },
    {
      expected: { status: 'CONTRACT_CONFLICT' },
      mutate: (input: any, hook: jest.Mock) => {
        input.submission.submissionCapability.reservationBinding.claimedAt =
          withProxyPrototype(new Date('2026-09-09T12:00:00.000Z'), hook);
      },
      name: 'schema Date',
    },
    {
      expected: { status: 'CONTRACT_CONFLICT' },
      mutate: (input: any, hook: jest.Mock) => {
        input.material.sendMessageInput.to = withProxyPrototype(
          ['recipient@example.com'],
          hook,
        );
      },
      name: 'schema array',
    },
    {
      expected: { status: 'CONTRACT_CONFLICT' },
      mutate: (input: any, hook: jest.Mock) => {
        input.submission = withProxyPrototype(input.submission, hook);
      },
      name: 'plain submission record',
    },
    {
      expected: { status: 'CONTRACT_CONFLICT' },
      mutate: (input: any, hook: jest.Mock) => {
        input.material.connectedAccount.unused = withProxyPrototype({}, hook);
      },
      name: 'connected-account stripped extra',
    },
    {
      expected: {
        reason: 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL',
        status: 'BLOCKED',
      },
      mutate: (input: any, hook: jest.Mock) => {
        const parameters = validConnectionParameters() as any;
        parameters.CALDAV = withProxyPrototype({}, hook);
        input.material.connectedAccount.provider =
          ConnectedAccountProvider.IMAP_SMTP_CALDAV;
        input.material.connectedAccount.connectionParameters = parameters;
        input.submission.provider = ConnectedAccountProvider.IMAP_SMTP_CALDAV;
        input.submission.submissionCapability.renderContext.provider =
          ConnectedAccountProvider.IMAP_SMTP_CALDAV;
      },
      name: 'CALDAV stripped value',
    },
  ])(
    'rejects a non-Proxy %s with Proxy direct prototype without hooks',
    async ({ expected, mutate }) => {
      const harness = createHarness();
      const input = dispatchInput() as any;
      const hook = jest.fn(() => {
        throw new Error('prototype-trap');
      });
      mutate(input, hook);

      await expect(harness.service.dispatch(input)).resolves.toEqual(expected);
      expect(hook).not.toHaveBeenCalled();
      expect(
        harness.outboundService.getProviderRequestTimeoutMs,
      ).not.toHaveBeenCalled();
      expect(harness.revalidator.revalidate).not.toHaveBeenCalled();
      expect(harness.transactionPort.runInTransaction).not.toHaveBeenCalled();
      expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
      expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('rejects authority and recovery results with Proxy direct prototypes without hooks', async () => {
    const authorityHarness = createHarness();
    const authorityHook = jest.fn(() => {
      throw new Error('authority-prototype-trap');
    });
    authorityHarness.revalidator.revalidate = jest.fn(async ({ submission }) =>
      withProxyPrototype(
        {
          projectedMessageId: ids.message,
          status: 'AUTHORIZED' as const,
          submission,
        },
        authorityHook,
      ),
    );

    await expect(
      authorityHarness.service.dispatch(dispatchInput()),
    ).resolves.toEqual({ status: 'CONTRACT_CONFLICT' });
    expect(authorityHook).not.toHaveBeenCalled();
    expect(
      authorityHarness.attemptService.beginSubmission,
    ).not.toHaveBeenCalled();
    expect(authorityHarness.outboundService.sendMessage).not.toHaveBeenCalled();

    const recoveryHarness = createHarness();
    const recoveryHook = jest.fn(() => {
      throw new Error('recovery-prototype-trap');
    });
    const recovery = withProxyPrototype(
      {
        kind: 'AMBIGUOUS_EVIDENCE' as const,
        submission: sequenceSubmission(),
      },
      recoveryHook,
    );
    await expect(recoveryHarness.service.recover(recovery)).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(recoveryHook).not.toHaveBeenCalled();
    expect(
      recoveryHarness.transactionPort.runInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('sanitizes a caught transaction error with Proxy direct prototype without hooks', async () => {
    const harness = createHarness();
    const hook = jest.fn(() => {
      throw new Error('transaction-prototype-trap');
    });
    harness.transactionPort.runInTransaction = jest.fn(async () => {
      throw withProxyPrototype({}, hook);
    });

    await expect(harness.service.dispatch(dispatchInput())).resolves.toEqual({
      status: 'CONTRACT_CONFLICT',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.attemptService.beginSubmission).not.toHaveBeenCalled();
    expect(harness.outboundService.sendMessage).not.toHaveBeenCalled();
  });

  it('sanitizes a provider error with Proxy direct prototype without hooks', async () => {
    const harness = createHarness();
    const hook = jest.fn(() => {
      throw new Error('provider-prototype-trap');
    });
    const providerError = withProxyPrototype({}, hook);
    harness.outboundService.sendMessage.mockRejectedValueOnce(providerError);

    await expect(
      harness.service.dispatch(dispatchInput()),
    ).resolves.toMatchObject({ status: 'UNKNOWN_PENDING_DEADLINE' });
    expect(hook).not.toHaveBeenCalled();
    expect(
      harness.attemptService.recordDefinitelyUnaccepted,
    ).not.toHaveBeenCalled();
  });

  it('rejects fulfilled provider output with Proxy direct prototype without hooks', async () => {
    const harness = createHarness();
    const hook = jest.fn(() => {
      throw new Error('fulfilled-prototype-trap');
    });
    harness.outboundService.sendMessage.mockResolvedValueOnce(
      withProxyPrototype(
        {
          headerMessageId: '<header@example.com>',
          messageExternalId: 'provider-123',
        },
        hook,
      ),
    );

    await expect(
      harness.service.dispatch(dispatchInput()),
    ).resolves.toMatchObject({
      evidence: { kind: 'UNPERSISTABLE_ACCEPTANCE_EVIDENCE' },
      status: 'OUTCOME_RECOVERY_REQUIRED',
    });
    expect(hook).not.toHaveBeenCalled();
    expect(harness.attemptService.recordAccepted).not.toHaveBeenCalled();
  });
});

if (process.env.NODE_ENV === '__compile_only__') {
  const sequence = sequenceSubmission();
  // @ts-expect-error Cross-source final kind is not a valid trusted input.
  const wrongKind: DispatchTrustedOutboundEmailInput = {
    kind: 'CAMPAIGN_TEST_FINAL',
    material: dispatchInput().material,
    submission: sequence,
  };
  void wrongKind;

  // @ts-expect-error Public/client-shaped authority without trusted material is forbidden.
  const publicAuthority: DispatchTrustedOutboundEmailInput = {
    submission: sequence,
  };
  void publicAuthority;

  const rawRecovery: RecoverOutboundEmailOutcomeInput = {
    kind: 'AMBIGUOUS_EVIDENCE',
    // @ts-expect-error Recovery evidence cannot carry undeclared raw transport data.
    rawError: 'secret',
    submission: sequence,
  };
  void rawRecovery;
}
