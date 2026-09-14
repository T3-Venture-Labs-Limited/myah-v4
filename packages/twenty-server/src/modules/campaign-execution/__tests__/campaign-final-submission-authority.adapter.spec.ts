import { CampaignFinalSubmissionAuthorityAdapter } from 'src/modules/campaign-execution/adapters/campaign-final-submission-authority.adapter';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

const id = {
  workspace: '11111111-1111-4111-8111-111111111111',
  campaign: '22222222-2222-4222-8222-222222222222',
  execution: '33333333-3333-4333-8333-333333333333',
  authorization: '44444444-4444-4444-8444-444444444444',
  activation: '55555555-5555-4555-8555-555555555555',
  version: '66666666-6666-4666-8666-666666666666',
  enrollment: '77777777-7777-4777-8777-777777777777',
  occurrence: '88888888-8888-4888-8888-888888888888',
  account: '99999999-9999-4999-8999-999999999999',
  channel: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  attempt: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  message: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  campaignCreator: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  creator: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
} as const;
const digest = 'a'.repeat(64);
const poolDigest = 'b'.repeat(64);
const projectedMessageId = computeCampaignProjectedMessageId(id.attempt);
const binding = {
  campaignExecutionId: id.execution,
  authorizationId: id.authorization,
  generation: 1,
  workflowVersionId: id.version,
  request: {
    reviewedWindow: {
      timeZone: 'UTC',
      startLocalTime: '00:00',
      endLocalTime: '23:59',
    },
    preparedProof: {
      preparedFingerprint: digest,
      orderedMessageIds: [id.message],
      fixedMaterialProofs: [
        { messageId: id.message, orderedAttachmentProofs: [] },
      ],
      senderPoolFingerprint: poolDigest,
      senderPoolSerializationRevision: 'campaign-sender-pool/v1',
      senderPoolRotationPolicyId: 'campaign-email-rotation/v1',
      signatureDigest: null,
    },
  },
};
const submission = () => ({
  activationId: id.activation,
  attemptId: id.attempt,
  authorizationGeneration: 1,
  authorizationId: id.authorization,
  campaignExecutionId: id.execution,
  campaignId: id.campaign,
  connectedAccountId: id.account,
  enrollmentId: id.enrollment,
  finalEvidenceDigest: digest,
  messageChannelId: id.channel,
  messageId: id.message,
  normalizedRecipient: 'recipient@example.com',
  normalizedSenderHandle: 'sender@example.com',
  occurrenceId: id.occurrence,
  provider: 'google',
  renderDigest: digest,
  source: 'CAMPAIGN_SEQUENCE' as const,
  submissionCapability: {
    activationId: id.activation,
    attemptId: id.attempt,
    authorizationGeneration: 1,
    campaignExecutionId: id.execution,
    kind: 'CAMPAIGN_SEQUENCE_SUBMISSION' as const,
    renderDigest: digest,
    reservationBinding: {
      attemptNumber: 1,
      claimedAt: new Date('2026-09-11T12:00:00Z'),
      localDate: '2026-09-11',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'ROTATE' as const,
      senderPoolFingerprint: poolDigest,
      slotAt: new Date('2026-09-11T12:00:00Z'),
      unknownAfter: new Date('2026-09-11T12:01:00Z'),
    },
    renderContext: {
      activationId: id.activation,
      authorizationGeneration: 1,
      authorizationId: id.authorization,
      campaignExecutionId: id.execution,
      campaignId: id.campaign,
      connectedAccountId: id.account,
      enrollmentId: id.enrollment,
      messageChannelId: id.channel,
      messageId: id.message,
      normalizedRecipient: 'recipient@example.com',
      normalizedSenderHandle: 'sender@example.com',
      occurrenceId: id.occurrence,
      provider: 'google',
      workflowVersionId: id.version,
      workspaceId: id.workspace,
    },
  },
  workflowVersionId: id.version,
  workspaceId: id.workspace,
});

type SetupOptions = {
  workspace?: Record<string, unknown>;
  campaign?: Record<string, unknown>;
  authorization?: Record<string, unknown>;
  activation?: Record<string, unknown> | null;
  enrollment?: Record<string, unknown>;
  occurrence?: Record<string, unknown>;
  account?: Record<string, unknown> | null;
  attempt?: Record<string, unknown>;
  window?: Record<string, unknown> | null;
  render?: Record<string, unknown> | null;
  excludedReasons?: string[];
  eligible?: Record<string, unknown>[];
  pool?: Record<string, unknown>;
  plan?: Record<string, unknown>;
};

const setup = (options: SetupOptions = {}) => {
  const calls: string[] = [];
  const query = jest.fn(async (sql: string, parameters: unknown[]) => {
    calls.push(`${sql.replace(/\s+/g, ' ')} ${parameters.join(' ')}`);
    if (sql.includes('FROM core.workspace'))
      return [
        {
          activationStatus: 'ACTIVE',
          suspendedAt: null,
          deletedAt: null,
          ...options.workspace,
        },
      ];
    if (sql.includes('.campaign WHERE'))
      return [
        {
          id: id.campaign,
          lifecycleStatus: 'ACTIVE',
          sequenceAuthorization: {
            authorizationId: id.authorization,
            generation: 1,
            workflowVersionId: id.version,
            state: 'ACTIVE',
            preparedFingerprint: digest,
          },
          ...options.campaign,
        },
      ];
    if (sql.includes('campaignSequenceAuthorization'))
      return [
        {
          state: 'ACTIVE',
          preparedFingerprint: digest,
          binding,
          ...options.authorization,
        },
      ];
    if (sql.includes('campaignActivation'))
      return options.activation === null
        ? []
        : [{ id: id.activation, ...options.activation }];
    if (sql.includes('campaignEnrollment'))
      return [
        {
          id: id.enrollment,
          state: 'ACTIVE',
          nextAuthoredMessageIndex: 0,
          campaignCreatorId: id.campaignCreator,
          creatorId: id.creator,
          ...options.enrollment,
        },
      ];
    if (sql.includes('campaignOccurrence'))
      return [
        {
          id: id.occurrence,
          state: 'IN_FLIGHT',
          authoredMessageIndex: 0,
          ...options.occurrence,
        },
      ];
    if (sql.includes('connectedAccount'))
      return options.account === null
        ? []
        : [
            {
              id: id.account,
              provider: 'google',
              handle: 'sender@example.com',
              channelId: id.channel,
              ...options.account,
            },
          ];
    if (sql.includes('outboundEmailAttempt'))
      return [
        {
          attemptId: id.attempt,
          source: 'CAMPAIGN_SEQUENCE',
          attemptState: 'RESERVED',
          capacityState: 'RESERVED',
          campaignId: id.campaign,
          enrollmentId: id.enrollment,
          authorizationId: id.authorization,
          workflowVersionId: id.version,
          messageId: id.message,
          connectedAccountId: id.account,
          messageChannelId: id.channel,
          provider: 'google',
          normalizedSenderHandle: 'sender@example.com',
          normalizedRecipient: 'recipient@example.com',
          renderDigest: digest,
          senderPoolFingerprint: poolDigest,
          selectionConstraintKind: 'ROTATE',
          priorAcceptedEvidenceId: null,
          ...options.attempt,
        },
      ];
    if (sql.includes('campaignExecution'))
      return options.window === null
        ? []
        : [{ insideWindow: true, ...options.window }];
    if (sql.includes('campaignOutboundRender'))
      return options.render === null
        ? []
        : [
            {
              subject: 'Subject',
              html: '<p>Body</p>',
              text: 'Body',
              toRecipient: 'recipient@example.com',
              inReplyTo: null,
              threadExternalId: null,
              references: [],
              signatureDigest: null,
              ...options.render,
            },
          ];
    return [];
  });
  const manager = { queryRunner: undefined as unknown };
  const runner = {
    isTransactionActive: true,
    isReleased: false,
    manager,
    query,
  };
  manager.queryRunner = runner;
  const audience = {
    reviewInTransaction: jest.fn(async () =>
      options.excludedReasons
        ? {
            eligible: [],
            excluded: [
              {
                campaignCreatorId: id.campaignCreator,
                reasons: options.excludedReasons,
              },
            ],
          }
        : {
            eligible: options.eligible ?? [
              {
                campaignCreatorId: id.campaignCreator,
                creatorId: id.creator,
                normalizedEmail: 'recipient@example.com',
              },
            ],
            excluded: [],
          },
    ),
  };
  const sender = {
    getCampaignEmailSenderPoolInTransaction: jest.fn(async () => ({
      senderPoolFingerprint: poolDigest,
      serializationRevision: 'campaign-sender-pool/v1',
      rotationPolicyId: 'campaign-email-rotation/v1',
      mailboxes: [
        {
          status: 'READY',
          connectedAccountId: id.account,
          messageChannelId: id.channel,
          provider: 'google',
          senderHandle: 'sender@example.com',
        },
      ],
      ...options.pool,
    })),
  };
  const sequence = {
    loadExecutionPlanInTransaction: jest.fn(async () => ({
      kind: 'READY',
      nodes: [
        { messageId: id.message, channel: 'EMAIL', replyToThread: false },
      ],
      delaysSeconds: [],
      ...options.plan,
    })),
  };
  return {
    adapter: new CampaignFinalSubmissionAuthorityAdapter(
      audience as never,
      sender as never,
      sequence as never,
    ),
    manager,
    calls,
    audience,
  };
};

const request = () => ({
  kind: 'CAMPAIGN_SEQUENCE_FINAL' as const,
  submission: submission(),
  materialEvidence: {
    projectedMessageId,
    sendMessageInput: {
      subject: 'Subject',
      html: '<p>Body</p>',
      body: 'Body',
      to: 'recipient@example.com',
      references: [],
    },
  },
});

describe('CampaignFinalSubmissionAuthorityAdapter', () => {
  it('locks and exact-validates the full system-authority graph without actor access', async () => {
    const { adapter, manager, calls } = setup();
    await expect(
      adapter.revalidate(request(), manager as never),
    ).resolves.toEqual({
      status: 'AUTHORIZED',
      submission: submission(),
      projectedMessageId,
    });
    const index = (text: string) =>
      calls.findIndex((entry) => entry.includes(text));
    expect(index('FROM core.workspace')).toBeLessThan(
      index('pg_advisory_xact_lock(hashtext'),
    );
    expect(index('campaignSequenceAuthorization')).toBeLessThan(
      index('campaignActivation'),
    );
    expect(index('campaignActivation')).toBeLessThan(
      index('campaignEnrollment'),
    );
    expect(index('campaignEnrollment')).toBeLessThan(
      index('campaignOccurrence'),
    );
    expect(index('campaignOccurrence')).toBeLessThan(
      index('campaign-mailbox:account'),
    );
    expect(index('campaign-mailbox:channel')).toBeLessThan(
      index('connectedAccount'),
    );
    expect(index('connectedAccount')).toBeLessThan(
      index('outboundEmailAttempt'),
    );
    expect(index('outboundEmailAttempt')).toBeLessThan(
      index('FROM core."campaignExecution"'),
    );
  });

  it('denies inactive workspace before mailbox or attempt work', async () => {
    const { adapter, manager, calls } = setup({
      workspace: { activationStatus: 'INACTIVE' },
    });
    await expect(
      adapter.revalidate(request(), manager as never),
    ).resolves.toEqual({ status: 'REJECTED', reason: 'WORKSPACE_NOT_ACTIVE' });
    expect(calls.some((entry) => entry.includes('outboundEmailAttempt'))).toBe(
      false,
    );
  });

  it('returns granular suppression denial', async () => {
    const { adapter, manager } = setup({
      excludedReasons: ['SUPPRESSED_EMAIL'],
    });
    await expect(
      adapter.revalidate(request(), manager as never),
    ).resolves.toEqual({ status: 'REJECTED', reason: 'RECIPIENT_SUPPRESSED' });
  });

  it('rejects non-Campaign sources without opening the graph', async () => {
    const { adapter, manager, calls } = setup();
    const invalid = { ...request(), kind: 'DIRECT_FINAL' as const };
    await expect(
      adapter.revalidate(invalid, manager as never),
    ).resolves.toEqual({
      status: 'REJECTED',
      reason: 'DISPATCH_CONTRACT_CONFLICT',
    });
    expect(calls).toEqual([]);
  });

  it.each([
    'workspaceId',
    'campaignId',
    'campaignExecutionId',
    'authorizationId',
    'activationId',
    'workflowVersionId',
    'enrollmentId',
    'occurrenceId',
    'connectedAccountId',
    'messageChannelId',
    'attemptId',
    'messageId',
  ] as const)(
    'rejects invalid routing coordinate %s without SQL',
    async (field) => {
      const { adapter, manager, calls } = setup();
      const value = request();
      (value.submission as unknown as Record<string, unknown>)[field] =
        'invalid';

      await expect(
        adapter.revalidate(value, manager as never),
      ).resolves.toEqual({
        status: 'REJECTED',
        reason: 'DISPATCH_CONTRACT_CONFLICT',
      });
      expect(calls).toEqual([]);
    },
  );

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid authorization generation %s without SQL',
    async (generation) => {
      const { adapter, manager, calls } = setup();
      const value = request();
      value.submission.authorizationGeneration = generation;
      await expect(
        adapter.revalidate(value, manager as never),
      ).resolves.toEqual({
        status: 'REJECTED',
        reason: 'DISPATCH_CONTRACT_CONFLICT',
      });
      expect(calls).toEqual([]);
    },
  );

  it.each([
    [{ activationStatus: 'INACTIVE' }, 'inactive'],
    [{ suspendedAt: new Date() }, 'suspended'],
    [{ deletedAt: new Date() }, 'deleted'],
  ] as const)('denies workspace when %s', async (workspace, _label) => {
    const { adapter, manager, calls } = setup({ workspace });
    await expect(
      adapter.revalidate(request(), manager as never),
    ).resolves.toEqual({
      status: 'REJECTED',
      reason: 'WORKSPACE_NOT_ACTIVE',
    });
    expect(
      calls.some((entry) => entry.includes('campaignSequenceAuthorization')),
    ).toBe(false);
  });

  it.each([
    ['PAUSED', 'CAMPAIGN_PAUSED'],
    ['COMPLETED', 'CAMPAIGN_STOPPED'],
    ['STOPPED', 'CAMPAIGN_STOPPED'],
  ] as const)(
    'maps Campaign lifecycle %s to %s',
    async (lifecycleStatus, reason) => {
      const { adapter, manager } = setup({ campaign: { lifecycleStatus } });
      await expect(
        adapter.revalidate(request(), manager as never),
      ).resolves.toEqual({ status: 'REJECTED', reason });
    },
  );

  it.each([
    [{ authorization: { state: 'REVOKED' } }, 'AUTHORIZATION_STALE'],
    [{ activation: null }, 'AUTHORIZATION_STALE'],
    [{ enrollment: { state: 'REPLIED' } }, 'ENROLLMENT_REPLIED'],
    [{ enrollment: { state: 'FINISHED' } }, 'OCCURRENCE_CANCELLED'],
    [{ enrollment: { nextAuthoredMessageIndex: 1 } }, 'AUTHORIZATION_STALE'],
    [{ occurrence: { state: 'CANCELLED' } }, 'OCCURRENCE_CANCELLED'],
    [{ account: null }, 'SENDER_NOT_READY'],
    [{ attempt: { renderDigest: 'changed' } }, 'DISPATCH_CONTRACT_CONFLICT'],
    [{ plan: { kind: 'BLOCKED' } }, 'MATERIAL_STALE'],
    [{ pool: { senderPoolFingerprint: 'changed' } }, 'SENDER_NOT_READY'],
    [{ pool: { serializationRevision: 'changed' } }, 'SENDER_NOT_READY'],
    [{ pool: { rotationPolicyId: 'changed' } }, 'SENDER_NOT_READY'],
    [{ excludedReasons: ['SUPPRESSED_EMAIL'] }, 'RECIPIENT_SUPPRESSED'],
    [{ excludedReasons: ['DUPLICATE_CREATOR_EMAIL'] }, 'AUDIENCE_DUPLICATE'],
    [{ excludedReasons: ['INVALID_STAGE'] }, 'AUDIENCE_STAGE_INVALID'],
    [{ excludedReasons: ['INVALID_EMAIL'] }, 'AUDIENCE_CONTACT_INVALID'],
    [
      {
        eligible: [
          {
            campaignCreatorId: id.campaignCreator,
            creatorId: 'changed',
            normalizedEmail: 'recipient@example.com',
          },
        ],
      },
      'AUDIENCE_CONTACT_INVALID',
    ],
    [{ window: { insideWindow: false } }, 'AUTHORIZATION_STALE'],
    [{ window: null }, 'AUTHORIZATION_STALE'],
    [{ render: null }, 'MATERIAL_STALE'],
    [{ render: { signatureDigest: 'changed' } }, 'MATERIAL_STALE'],
    [{ render: { inReplyTo: 'unexpected' } }, 'MATERIAL_STALE'],
  ] as const)(
    'returns granular denial for case %#',
    async (options, reason) => {
      const { adapter, manager } = setup(options as SetupOptions);
      await expect(
        adapter.revalidate(request(), manager as never),
      ).resolves.toEqual({ status: 'REJECTED', reason });
    },
  );

  it.each([
    {
      campaign: {
        sequenceAuthorization: {
          authorizationId: id.authorization,
          generation: 2,
          workflowVersionId: id.version,
          state: 'ACTIVE',
          preparedFingerprint: digest,
        },
      },
    },
    { authorization: { preparedFingerprint: 'changed' } },
    {
      authorization: {
        binding: { ...binding, campaignExecutionId: id.campaign },
      },
    },
    { authorization: { binding: { ...binding, generation: 2 } } },
    {
      authorization: {
        binding: { ...binding, workflowVersionId: id.campaign },
      },
    },
    {
      authorization: {
        binding: {
          ...binding,
          request: {
            ...binding.request,
            preparedProof: {
              ...binding.request.preparedProof,
              preparedFingerprint: 'changed',
            },
          },
        },
      },
    },
  ] as const)(
    'rejects stale execution/generation/version/prepared authority %#',
    async (options) => {
      const { adapter, manager } = setup(options as SetupOptions);
      await expect(
        adapter.revalidate(request(), manager as never),
      ).resolves.toEqual({ status: 'REJECTED', reason: 'AUTHORIZATION_STALE' });
    },
  );

  it.each([
    ['to', 'other@example.com'],
    ['subject', 'Changed'],
    ['body', 'Changed'],
    ['html', '<p>Changed</p>'],
    ['references', ['changed']],
  ] as const)('rejects material drift in %s', async (field, changed) => {
    const { adapter, manager } = setup();
    const value = request();
    (
      value.materialEvidence.sendMessageInput as unknown as Record<
        string,
        unknown
      >
    )[field] = changed;
    await expect(adapter.revalidate(value, manager as never)).resolves.toEqual({
      status: 'REJECTED',
      reason: field === 'to' ? 'AUDIENCE_CONTACT_INVALID' : 'MATERIAL_STALE',
    });
  });

  it('rejects selected sender account/channel that is absent from the READY pool', async () => {
    const { adapter, manager } = setup({ pool: { mailboxes: [] } });
    await expect(
      adapter.revalidate(request(), manager as never),
    ).resolves.toEqual({ status: 'REJECTED', reason: 'SENDER_NOT_READY' });
  });

  it('requires the supplied active manager and never falls back to ambient reads', async () => {
    const { adapter, audience } = setup();
    await expect(
      adapter.revalidate(request(), {
        queryRunner: { isTransactionActive: false },
      } as never),
    ).rejects.toThrow('supplied active manager');
    expect(audience.reviewInTransaction).not.toHaveBeenCalled();
  });

  it('authorizes exact durable authority without consulting current initiator permissions', async () => {
    const { adapter, manager, audience } = setup();
    await expect(
      adapter.revalidate(request(), manager as never),
    ).resolves.toEqual({
      status: 'AUTHORIZED',
      submission: submission(),
      projectedMessageId,
    });
    expect(audience.reviewInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
      }),
    );
  });
});
