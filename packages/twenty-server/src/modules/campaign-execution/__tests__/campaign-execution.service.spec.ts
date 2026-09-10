import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { CampaignExecutionService } from 'src/modules/campaign-execution/services/campaign-execution.service';
import { type CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import { type LockedCampaignLifecycleContext } from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';
import {
  type CampaignActivationRecord,
  type CampaignCapacityTimeZoneReaderPort,
  type CampaignExecutionHistoryPort,
  type CampaignExecutionIdentityPort,
  type CampaignExecutionPersistencePort,
  type CampaignExecutionPlanReaderPort,
  type CampaignInitialDueTimePort,
  type CampaignNewActivationReviewPort,
  type CampaignSendingWindow,
  type CampaignSequenceAuthorizationRecord,
  type CampaignSequenceAuthorizationRequest,
  type CampaignSequenceAuthorityPort,
  type StartCampaignInput,
} from 'src/modules/campaign-execution/types/campaign-execution.type';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const campaignExecutionId = '33333333-3333-4333-8333-333333333333';
const activationId = '44444444-4444-4444-8444-444444444444';
const authorizationId = '55555555-5555-4555-8555-555555555555';
const creatorId = '66666666-6666-4666-8666-666666666666';
const campaignCreatorId = '77777777-7777-4777-8777-777777777777';
const enrollmentId = '88888888-8888-4888-8888-888888888888';
const occurrenceId = '99999999-9999-4999-8999-999999999999';
const workflowId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workflowVersionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const firstMessageId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const secondMessageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const acceptedAttemptId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const previousEnrollmentId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const previousOccurrenceId = '12121212-1212-4212-8212-121212121212';
const acceptedAt = '2026-09-10T12:00:00.000Z';
const authorizedAt = '2026-09-11T09:00:00.000Z';
const dueAt = '2026-09-11T13:00:00.000Z';
const startIdempotencyKey = '19191919-1919-4919-8919-191919191919';

const window: CampaignSendingWindow = Object.freeze({
  timeZone: 'Europe/Paris',
  startLocalTime: '09:00:00',
  endLocalTime: '17:00:00',
});

const authContext = {
  type: 'system',
  workspace: { id: workspaceId },
} as unknown as WorkspaceAuthContext;

const request: CampaignSequenceAuthorizationRequest = Object.freeze({
  preparedProof: Object.freeze({
    kind: 'PREPARED',
    workspaceId,
    campaignId,
    workflowId,
    workflowVersionId,
    initiatingUserWorkspaceId: '13131313-1313-4313-8313-131313131313',
    initiatingUserId: '14141414-1414-4414-8414-141414141414',
    initiatingWorkspaceMemberId: '15151515-1515-4515-8515-151515151515',
    orderedMessageIds: Object.freeze([firstMessageId, secondMessageId]),
    usedChannels: Object.freeze(['EMAIL'] as const),
    sequenceDigest: 'a'.repeat(64),
    fixedMaterialDigest: 'b'.repeat(64),
    senderAuthorityDigest: 'c'.repeat(64),
    preparedFingerprint: 'd'.repeat(64),
    signatureDigest: null,
    fixedMaterialProofs: Object.freeze([]),
    senderPoolFingerprint: 'e'.repeat(64),
    senderPoolSerializationRevision: 'CAMPAIGN_SENDER_POOL_V2',
    senderPoolRotationPolicyId:
      'EARLIEST_ELIGIBLE_LOWEST_DAILY_USAGE_STABLE_ACCOUNT_V1',
  }),
  reviewedWindow: window,
  campaignCapacityTimeZone: 'America/New_York',
});

const startInput = (): StartCampaignInput => ({
  workspaceId,
  campaignId,
  authContext,
  startIdempotencyKey,
  request,
});

const authorityRecord = (
  overrides: Partial<CampaignSequenceAuthorizationRecord> = {},
): CampaignSequenceAuthorizationRecord => ({
  authorizationId,
  workspaceId,
  campaignId,
  campaignExecutionId,
  generation: 1,
  startIdempotencyKey,
  preparedFingerprint: request.preparedProof.preparedFingerprint,
  workflowId,
  workflowVersionId,
  initiatingUserWorkspaceId: request.preparedProof.initiatingUserWorkspaceId,
  state: 'ACTIVE',
  authorizedAt,
  revokedAt: null,
  revocationReason: null,
  binding: {
    schemaVersion: 1,
    authorizationId,
    generation: 1,
    startIdempotencyKey,
    workspaceId,
    campaignId,
    campaignExecutionId,
    workflowVersionId,
    request,
    futureEligibleCampaignCreatorsAuthorized: true,
    authorizedAt,
  },
  createdAt: authorizedAt,
  updatedAt: authorizedAt,
  ...overrides,
});

const activationRecord = (
  overrides: Partial<CampaignActivationRecord> = {},
): CampaignActivationRecord => ({
  workspaceId,
  campaignId,
  campaignExecutionId,
  activationId,
  authorizationId,
  authorizationGeneration: 1,
  workflowVersionId,
  activatedAt: authorizedAt,
  createdEnrollmentCount: 1,
  createdOccurrenceCount: 1,
  ...overrides,
});

const acceptedHistoryEntry = (overrides?: Record<string, unknown>) => ({
  kind: 'ACCEPTED',
  workspaceId,
  campaignId,
  authorizationId: '16161616-1616-4616-8616-161616161616',
  enrollmentId: previousEnrollmentId,
  occurrenceId: previousOccurrenceId,
  attemptId: acceptedAttemptId,
  acceptedEvidenceId: acceptedAttemptId,
  workflowVersionId,
  messageId: firstMessageId,
  authoredMessageIndex: 0,
  connectedAccountId: '17171717-1717-4717-8717-171717171717',
  messageChannelId: '18181818-1818-4818-8818-181818181818',
  provider: 'google',
  normalizedSenderHandle: 'sender@example.com',
  normalizedRecipient: 'creator@example.com',
  providerMessageId: 'provider-1',
  providerAcceptedAt: acceptedAt,
  ...overrides,
});

const createHarness = (overrides?: {
  lifecycleStatus?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  capacityResult?: unknown;
  execution?: unknown;
  activation?: unknown;
  structure?: unknown;
  lookup?: unknown;
  createdAuthority?: unknown;
  plan?: unknown;
  review?: unknown;
  history?: unknown;
  persistedGraph?: unknown;
  writeWindow?: unknown;
  revoke?: unknown;
  inFlightCount?: unknown;
}) => {
  const order: string[] = [];
  const manager = {
    queryRunner: {
      isTransactionActive: true,
      isReleased: false,
    },
  } as unknown as WorkspaceEntityManager;
  Object.assign(manager.queryRunner!, { manager });
  const lifecycleStatus = overrides?.lifecycleStatus ?? 'DRAFT';
  const context: LockedCampaignLifecycleContext = Object.freeze({
    manager,
    workspaceId,
    campaignId,
    schemaName: 'workspace_example',
    workspace: Object.freeze({
      id: workspaceId,
      campaignCapacityTimeZone: 'America/New_York',
    }),
    campaign: Object.freeze({
      id: campaignId,
      lifecycleStatus,
      sequenceAuthorization: null,
    }),
    actorPermissionContext: Object.freeze({
      authContext,
      rolePermissionConfig: Object.freeze({
        roleId: 'system',
        objectsPermissions: Object.freeze({}),
        shouldBypassPermissionChecks: true,
      }),
    }),
  });

  const transaction = {
    run: jest.fn(async (_input, operation) => {
      order.push('transaction');
      return operation(context);
    }),
  } as unknown as CampaignLifecycleTransactionService;

  const capacity: CampaignCapacityTimeZoneReaderPort = {
    readCampaignCapacityTimeZoneInTransaction: jest.fn(
      async (_input, usedManager) => {
        order.push('capacity');
        expect(usedManager).toBe(manager);
        return (
          overrides && 'capacityResult' in overrides
            ? overrides.capacityResult
            : {
                status: 'CONFIGURED',
                campaignCapacityTimeZone: 'America/New_York',
              }
        ) as never;
      },
    ),
  };

  const persistence: CampaignExecutionPersistencePort = {
    loadExecutionInTransaction: jest.fn(async (usedContext) => {
      order.push('load-execution');
      expect(usedContext.manager).toBe(manager);
      return (
        overrides && 'execution' in overrides
          ? overrides.execution
          : {
              campaignExecutionId,
              workspaceId,
              campaignId,
              window,
              campaignCapacityTimeZone: 'America/New_York',
            }
      ) as never;
    }),
    loadActivationByAuthorizationInTransaction: jest.fn(async () => {
      order.push('load-activation');
      return (
        overrides && 'activation' in overrides
          ? overrides.activation
          : activationRecord()
      ) as never;
    }),
    writeSendingWindowInTransaction: jest.fn(async () => {
      order.push('write-window');
      return (
        overrides && 'writeWindow' in overrides
          ? overrides.writeWindow
          : {
              status: 'UPDATED',
              createdExecution: true,
              execution: {
                campaignExecutionId,
                workspaceId,
                campaignId,
                window,
                campaignCapacityTimeZone: 'America/New_York',
              },
            }
      ) as never;
    }),
    createActivationGraphInTransaction: jest.fn(async (_context, graph) => {
      order.push('create-graph');
      return (
        overrides && 'persistedGraph' in overrides
          ? overrides.persistedGraph
          : graph
      ) as never;
    }),
    transitionLifecycleInTransaction: jest.fn(async (_context, transition) => {
      order.push(`transition:${transition.from}->${transition.to}`);
    }),
    countInFlightAttemptsInTransaction: jest.fn(async () => {
      order.push('count-in-flight');
      return (
        overrides && 'inFlightCount' in overrides ? overrides.inFlightCount : 2
      ) as never;
    }),
  };

  const authority: CampaignSequenceAuthorityPort = {
    inspectCurrentAuthorityInTransaction: jest.fn(async (authorityContext) => {
      order.push('inspect-authority');
      expect(authorityContext.manager).toBe(manager);
      return (
        overrides && 'structure' in overrides
          ? overrides.structure
          : lifecycleStatus === 'ACTIVE'
            ? { kind: 'CURRENT_ACTIVE', authorization: authorityRecord() }
            : lifecycleStatus === 'PAUSED' || lifecycleStatus === 'COMPLETED'
              ? {
                  kind: 'CURRENT_REVOKED',
                  authorization: authorityRecord({
                    state: 'REVOKED',
                    revokedAt: authorizedAt,
                    revocationReason:
                      lifecycleStatus === 'COMPLETED'
                        ? 'CAMPAIGN_COMPLETED'
                        : 'CAMPAIGN_PAUSED',
                  }),
                }
              : { kind: 'NO_CURRENT_AUTHORITY' }
      ) as never;
    }),
    lookupStartRequestInTransaction: jest.fn(async () => {
      order.push('lookup-start');
      return (
        overrides && 'lookup' in overrides
          ? overrides.lookup
          : { kind: 'NOT_FOUND' }
      ) as never;
    }),
    createNewAuthorizationInTransaction: jest.fn(async () => {
      order.push('create-authority');
      return (
        overrides && 'createdAuthority' in overrides
          ? overrides.createdAuthority
          : { kind: 'CREATED', authorization: authorityRecord() }
      ) as never;
    }),
    revokeCurrentAuthorizationInTransaction: jest.fn(
      async (_context, input) => {
        order.push(`revoke:${input.reason}`);
        return (
          overrides && 'revoke' in overrides
            ? overrides.revoke
            : {
                kind: 'REVOKED',
                authorization: authorityRecord({
                  state: 'REVOKED',
                  revokedAt: authorizedAt,
                  revocationReason: input.reason,
                }),
              }
        ) as never;
      },
    ),
  };

  const planReader: CampaignExecutionPlanReaderPort = {
    loadExecutionPlanInTransaction: jest.fn(async (_input, usedManager) => {
      order.push('load-plan');
      expect(usedManager).toBe(manager);
      return (
        overrides && 'plan' in overrides
          ? overrides.plan
          : {
              kind: 'READY',
              workspaceId,
              campaignId,
              workflowId,
              workflowVersionId,
              nodes: [
                {
                  messageId: firstMessageId,
                  channel: 'EMAIL',
                  replyToThread: false,
                },
                { messageId: secondMessageId, channel: 'INSTAGRAM' },
              ],
              delaysSeconds: [3600],
            }
      ) as never;
    }),
  };

  const review: CampaignNewActivationReviewPort = {
    revalidateNewActivationInTransaction: jest.fn(async () => {
      order.push('revalidate');
      return (
        overrides && 'review' in overrides
          ? overrides.review
          : {
              status: 'READY',
              eligibleCreators: [
                {
                  campaignCreatorId,
                  creatorId,
                  usableMessageIds: [firstMessageId, secondMessageId],
                },
              ],
            }
      ) as never;
    }),
  };

  const history: CampaignExecutionHistoryPort = {
    readSameWorkflowVersionHistoryInTransaction: jest.fn(
      async (_input, usedManager) => {
        order.push('history');
        expect(usedManager).toBe(manager);
        return (
          overrides && 'history' in overrides
            ? overrides.history
            : {
                status: 'COMPLETE',
                entries: [],
                lastProviderAcceptedAt: null,
              }
        ) as never;
      },
    ),
  };

  const dueTime: CampaignInitialDueTimePort = {
    adjustInitialDueAt: jest.fn((input) => {
      order.push(`due:${input.anchorAt}:${input.delaySeconds}`);
      return dueAt;
    }),
  };
  const identity: CampaignExecutionIdentityPort = {
    generateActivationId: jest.fn(() => activationId),
    generateEnrollmentId: jest.fn(() => enrollmentId),
    generateOccurrenceId: jest.fn(() => occurrenceId),
  };

  const service = new CampaignExecutionService(
    transaction,
    authority,
    persistence,
    capacity,
    planReader,
    review,
    history,
    dueTime,
    identity,
  );

  return {
    authority,
    capacity,
    context,
    dueTime,
    history,
    identity,
    manager,
    order,
    persistence,
    planReader,
    review,
    service,
    transaction,
  };
};

describe('CampaignExecutionService', () => {
  it('creates a reviewed immutable activation graph in canonical order', async () => {
    const harness = createHarness();

    await expect(harness.service.startCampaign(startInput())).resolves.toEqual({
      status: 'ACTIVATED',
      mayActivate: true,
      activation: {
        campaignExecutionId,
        activationId,
        authorizationId,
        authorizationGeneration: 1,
        workflowVersionId,
        activatedAt: authorizedAt,
        lifecycleStatus: 'ACTIVE',
        createdEnrollmentCount: 1,
        createdOccurrenceCount: 1,
      },
    });

    expect(harness.order).toEqual([
      'transaction',
      'inspect-authority',
      'lookup-start',
      'load-execution',
      'capacity',
      'load-plan',
      'revalidate',
      'history',
      'create-authority',
      `due:${authorizedAt}:0`,
      'create-graph',
    ]);
    const graph = jest.mocked(
      harness.persistence.createActivationGraphInTransaction,
    ).mock.calls[0][1];
    expect(graph.activation.createdEnrollmentCount).toBe(1);
    expect(graph.activation.createdOccurrenceCount).toBe(1);
    expect(graph.enrollments[0]).toMatchObject({
      enrollmentId,
      campaignCreatorId,
      creatorId,
      nextAuthoredMessageIndex: 0,
      state: 'ACTIVE',
      terminalReason: null,
      occurrence: {
        occurrenceId,
        messageId: firstMessageId,
        authoredMessageIndex: 0,
        dueAt,
      },
    });
  });

  it('durably skips leading unavailable steps without placeholder occurrences', async () => {
    const harness = createHarness({
      review: {
        status: 'READY',
        eligibleCreators: [
          {
            campaignCreatorId,
            creatorId,
            usableMessageIds: [secondMessageId],
          },
        ],
      },
    });

    await harness.service.startCampaign(startInput());

    const graph = jest.mocked(
      harness.persistence.createActivationGraphInTransaction,
    ).mock.calls[0][1];
    expect(graph.enrollments).toHaveLength(1);
    expect(graph.enrollments[0].nextAuthoredMessageIndex).toBe(1);
    expect(graph.enrollments[0].occurrence).toMatchObject({
      messageId: secondMessageId,
      authoredMessageIndex: 1,
    });
    expect(harness.dueTime.adjustInitialDueAt).toHaveBeenCalledWith({
      anchorAt: authorizedAt,
      delaySeconds: 0,
      window,
    });
  });

  it('finishes with the frozen reason when COMPLETE history proves no usable unsuppressed node', async () => {
    const harness = createHarness({
      review: {
        status: 'READY',
        eligibleCreators: [
          { campaignCreatorId, creatorId, usableMessageIds: [] },
        ],
      },
    });

    await harness.service.startCampaign(startInput());

    const graph = jest.mocked(
      harness.persistence.createActivationGraphInTransaction,
    ).mock.calls[0][1];
    expect(graph.activation.createdEnrollmentCount).toBe(1);
    expect(graph.activation.createdOccurrenceCount).toBe(0);
    expect(graph.enrollments[0]).toMatchObject({
      nextAuthoredMessageIndex: 2,
      state: 'FINISHED',
      terminalReason: 'NO_USABLE_AUTHORED_MESSAGE',
      terminalAt: authorizedAt,
      occurrence: null,
    });
    expect(harness.dueTime.adjustInitialDueAt).not.toHaveBeenCalled();
  });

  it('accepts the preserved nonblank provider message ID and anchors delay only to provider acceptance', async () => {
    const harness = createHarness({
      history: {
        status: 'COMPLETE',
        entries: [
          {
            kind: 'ACCEPTED',
            workspaceId,
            campaignId,
            authorizationId: '16161616-1616-4616-8616-161616161616',
            enrollmentId: previousEnrollmentId,
            occurrenceId: previousOccurrenceId,
            attemptId: acceptedAttemptId,
            acceptedEvidenceId: acceptedAttemptId,
            workflowVersionId,
            messageId: firstMessageId,
            authoredMessageIndex: 0,
            connectedAccountId: '17171717-1717-4717-8717-171717171717',
            messageChannelId: '18181818-1818-4818-8818-181818181818',
            provider: 'google',
            normalizedSenderHandle: 'sender@example.com',
            normalizedRecipient: 'creator@example.com',
            providerMessageId: ' provider-1 ',
            providerAcceptedAt: acceptedAt,
          },
        ],
        lastProviderAcceptedAt: acceptedAt,
      },
    });

    await harness.service.startCampaign(startInput());

    expect(harness.dueTime.adjustInitialDueAt).toHaveBeenCalledWith({
      anchorAt: acceptedAt,
      delaySeconds: 3600,
      window,
    });
    const graph = jest.mocked(
      harness.persistence.createActivationGraphInTransaction,
    ).mock.calls[0][1];
    expect(graph.enrollments[0].nextAuthoredMessageIndex).toBe(1);
    expect(graph.enrollments[0].occurrence?.messageId).toBe(secondMessageId);
  });

  it.each([
    'UNRESOLVED_HISTORY',
    'UNKNOWN_OUTCOME',
    'AMBIGUOUS_HISTORY',
    'MALFORMED_HISTORY',
    'UNRECONCILED_HISTORY',
  ] as const)(
    'blocks %s history before authority or graph writes',
    async (reason) => {
      const harness = createHarness({
        history: { status: 'BLOCKED', reason },
      });

      await expect(
        harness.service.startCampaign(startInput()),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'PROGRESSION_HISTORY_UNAVAILABLE',
      });
      expect(
        harness.authority.createNewAuthorizationInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        harness.persistence.createActivationGraphInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('returns an exact current replay before current eligibility participants', async () => {
    const record = authorityRecord();
    const harness = createHarness({
      lifecycleStatus: 'ACTIVE',
      lookup: { kind: 'EXACT_MATCH', authorization: record },
    });

    await expect(harness.service.startCampaign(startInput())).resolves.toEqual({
      status: 'REPLAYED',
      mayActivate: true,
      activation: expect.objectContaining({ activationId }),
    });
    expect(harness.order).toEqual([
      'transaction',
      'inspect-authority',
      'load-execution',
      'load-activation',
      'lookup-start',
      'load-activation',
    ]);
    expect(
      harness.capacity.readCampaignCapacityTimeZoneInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.review.revalidateNewActivationInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.history.readSameWorkflowVersionHistoryInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('returns historical replay after completion with mayActivate false and zero current checks', async () => {
    const record = authorityRecord({
      state: 'REVOKED',
      revokedAt: authorizedAt,
      revocationReason: 'CAMPAIGN_COMPLETED',
    });
    const harness = createHarness({
      lifecycleStatus: 'COMPLETED',
      lookup: { kind: 'EXACT_MATCH', authorization: record },
    });

    await expect(
      harness.service.startCampaign(startInput()),
    ).resolves.toMatchObject({
      status: 'REPLAYED',
      mayActivate: false,
      activation: { activationId },
    });
    expect(
      harness.capacity.readCampaignCapacityTimeZoneInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.planReader.loadExecutionPlanInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.review.revalidateNewActivationInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('blocks changed-version continuation from PAUSED before current-version checks or writes', async () => {
    const changedWorkflowVersionId = '25252525-2525-4525-8525-252525252525';
    const changedRequest: CampaignSequenceAuthorizationRequest = {
      ...request,
      preparedProof: {
        ...request.preparedProof,
        workflowVersionId: changedWorkflowVersionId,
      },
    };
    const harness = createHarness({ lifecycleStatus: 'PAUSED' });

    await expect(
      harness.service.startCampaign({
        ...startInput(),
        request: changedRequest,
      }),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'CHANGED_WORKFLOW_VERSION_UNMAPPED',
    });
    expect(
      harness.planReader.loadExecutionPlanInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.history.readSameWorkflowVersionHistoryInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.authority.createNewAuthorizationInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.persistence.createActivationGraphInTransaction,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [
      'IDEMPOTENCY_KEY_CONFLICT',
      { kind: 'IDEMPOTENCY_KEY_CONFLICT' },
      'IDEMPOTENCY_KEY_CONFLICT',
    ],
    ['already active', { kind: 'NOT_FOUND' }, 'CAMPAIGN_ALREADY_ACTIVE'],
  ] as const)(
    'blocks %s with zero new writes',
    async (_name, lookup, reason) => {
      const harness = createHarness({ lifecycleStatus: 'ACTIVE', lookup });

      await expect(
        harness.service.startCampaign(startInput()),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason,
      });
      expect(
        harness.authority.createNewAuthorizationInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        harness.persistence.createActivationGraphInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('gives inconsistent ACTIVE structure precedence over replay lookup', async () => {
    const harness = createHarness({
      lifecycleStatus: 'ACTIVE',
      structure: { kind: 'NO_CURRENT_AUTHORITY' },
      lookup: {
        kind: 'EXACT_MATCH',
        authorization: authorityRecord(),
      },
    });

    await expect(harness.service.startCampaign(startInput())).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'INCONSISTENT_CURRENT_AUTHORITY',
    });
    expect(
      harness.authority.lookupStartRequestInTransaction,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['missing execution', { execution: null }, 'MISSING_SENDING_WINDOW'],
    [
      'missing capacity timezone',
      { capacityResult: { status: 'BLOCKED', reason: 'NOT_CONFIGURED' } },
      'WORKSPACE_CAPACITY_TIMEZONE_UNAVAILABLE',
    ],
    [
      'blocked plan',
      {
        plan: {
          kind: 'BLOCKED_DEPENDENCY_INTEGRITY',
          reason: 'WORKFLOW_VERSION_NOT_FOUND',
        },
      },
      'SEQUENCE_UNAVAILABLE',
    ],
    [
      'stale review',
      { review: { status: 'BLOCKED', reason: 'STALE_PROOF' } },
      'CURRENT_REVIEW_INVALID',
    ],
  ] as const)(
    'blocks %s before authority creation',
    async (_name, override, reason) => {
      const harness = createHarness(override);

      await expect(
        harness.service.startCampaign(startInput()),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason,
      });
      expect(
        harness.authority.createNewAuthorizationInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('reconsiders authorization-local skips but suppresses accepted history in a new generation', async () => {
    const harness = createHarness({
      history: {
        status: 'COMPLETE',
        entries: [
          {
            kind: 'ACCEPTED',
            workspaceId,
            campaignId,
            authorizationId: '16161616-1616-4616-8616-161616161616',
            enrollmentId: previousEnrollmentId,
            occurrenceId: previousOccurrenceId,
            attemptId: acceptedAttemptId,
            acceptedEvidenceId: acceptedAttemptId,
            workflowVersionId,
            messageId: secondMessageId,
            authoredMessageIndex: 1,
            connectedAccountId: '17171717-1717-4717-8717-171717171717',
            messageChannelId: '18181818-1818-4818-8818-181818181818',
            provider: 'google',
            normalizedSenderHandle: 'sender@example.com',
            normalizedRecipient: 'creator@example.com',
            providerMessageId: 'provider-2',
            providerAcceptedAt: acceptedAt,
          },
        ],
        lastProviderAcceptedAt: acceptedAt,
      },
    });

    await harness.service.startCampaign(startInput());

    const graph = jest.mocked(
      harness.persistence.createActivationGraphInTransaction,
    ).mock.calls[0][1];
    expect(graph.enrollments[0].nextAuthoredMessageIndex).toBe(0);
    expect(graph.enrollments[0].occurrence?.messageId).toBe(firstMessageId);
    expect(harness.dueTime.adjustInitialDueAt).toHaveBeenCalledWith({
      anchorAt: authorizedAt,
      delaySeconds: 0,
      window,
    });
  });

  it.each([
    ['null evidence IDs', { attemptId: null, acceptedEvidenceId: null }],
    ['invalid account', { connectedAccountId: 'not-a-uuid' }],
    ['invalid channel', { messageChannelId: 'not-a-uuid' }],
    ['non-normalized provider', { provider: 'GOOGLE' }],
    [
      'non-normalized recipient',
      { normalizedRecipient: ' Creator@Example.com ' },
    ],
    ['blank provider message', { providerMessageId: ' ' }],
  ])(
    'fails malformed accepted %s closed before authority creation',
    async (_name, malformed) => {
      const harness = createHarness({
        history: {
          status: 'COMPLETE',
          entries: [acceptedHistoryEntry(malformed)],
          lastProviderAcceptedAt: acceptedAt,
        },
      });

      await expect(
        harness.service.startCampaign(startInput()),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'PROGRESSION_HISTORY_UNAVAILABLE',
      });
      expect(
        harness.authority.createNewAuthorizationInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        harness.persistence.createActivationGraphInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('orders eligible Creators canonically before history and graph planning', async () => {
    const lowerCreatorId = '20202020-2020-4020-8020-202020202020';
    const lowerCampaignCreatorId = '21212121-2121-4121-8121-212121212121';
    const lowerEnrollmentId = '23232323-2323-4323-8323-232323232323';
    const lowerOccurrenceId = '24242424-2424-4424-8424-242424242424';
    const harness = createHarness({
      review: {
        status: 'READY',
        eligibleCreators: [
          { campaignCreatorId, creatorId, usableMessageIds: [firstMessageId] },
          {
            campaignCreatorId: lowerCampaignCreatorId,
            creatorId: lowerCreatorId,
            usableMessageIds: [firstMessageId],
          },
        ],
      },
    });
    jest
      .mocked(harness.identity.generateEnrollmentId)
      .mockReturnValueOnce(lowerEnrollmentId)
      .mockReturnValueOnce(enrollmentId);
    jest
      .mocked(harness.identity.generateOccurrenceId)
      .mockReturnValueOnce(lowerOccurrenceId)
      .mockReturnValueOnce(occurrenceId);

    await harness.service.startCampaign(startInput());

    expect(
      jest
        .mocked(harness.history.readSameWorkflowVersionHistoryInTransaction)
        .mock.calls.map(([scope]) => scope.creatorId),
    ).toEqual([lowerCreatorId, creatorId]);
    const graph = jest.mocked(
      harness.persistence.createActivationGraphInTransaction,
    ).mock.calls[0][1];
    expect(graph.enrollments.map(({ creatorId }) => creatorId)).toEqual([
      lowerCreatorId,
      creatorId,
    ]);
    expect(graph.activation.createdEnrollmentCount).toBe(2);
    expect(graph.activation.createdOccurrenceCount).toBe(2);
  });

  it('rejects malformed/duplicate eligibility before authority creation', async () => {
    const harness = createHarness({
      review: {
        status: 'READY',
        eligibleCreators: [
          {
            campaignCreatorId,
            creatorId,
            usableMessageIds: [firstMessageId],
          },
          {
            campaignCreatorId: '19191919-1919-4919-8919-191919191919',
            creatorId,
            usableMessageIds: [secondMessageId],
          },
        ],
      },
    });

    await expect(harness.service.startCampaign(startInput())).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'CURRENT_REVIEW_INVALID',
    });
    expect(
      harness.authority.createNewAuthorizationInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('rejects malformed server-authored authority and graph acknowledgements', async () => {
    const badAuthority = createHarness({
      createdAuthority: {
        kind: 'CREATED',
        authorization: authorityRecord({ generation: 0 }),
      },
    });
    await expect(
      badAuthority.service.startCampaign(startInput()),
    ).rejects.toThrow('Created Campaign authority was inconsistent');
    expect(
      badAuthority.persistence.createActivationGraphInTransaction,
    ).not.toHaveBeenCalled();

    const badGraph = createHarness({
      persistedGraph: {
        activation: activationRecord({ createdOccurrenceCount: 0 }),
        enrollments: [],
      },
    });
    await expect(badGraph.service.startCampaign(startInput())).rejects.toThrow(
      'Created Campaign activation graph was inconsistent',
    );
  });

  it('creates the first stable execution/window and uses configured capacity timezone', async () => {
    const harness = createHarness({ execution: null });

    await expect(
      harness.service.updateSendingWindow({
        workspaceId,
        campaignId,
        authContext,
        window,
      }),
    ).resolves.toEqual({
      status: 'UPDATED',
      createdExecution: true,
      campaignExecutionId,
      window,
    });
    expect(harness.order).toEqual([
      'transaction',
      'capacity',
      'load-execution',
      'write-window',
    ]);
    expect(
      harness.persistence.writeSendingWindowInTransaction,
    ).toHaveBeenCalledWith(harness.context, {
      window,
      campaignCapacityTimeZone: 'America/New_York',
    });
  });

  it('preserves the stable execution identity on later update/no-op', async () => {
    const harness = createHarness({
      writeWindow: {
        status: 'UNCHANGED',
        createdExecution: false,
        execution: {
          campaignExecutionId,
          workspaceId,
          campaignId,
          window,
          campaignCapacityTimeZone: 'America/New_York',
        },
      },
    });

    await expect(
      harness.service.updateSendingWindow({
        workspaceId,
        campaignId,
        authContext,
        window,
      }),
    ).resolves.toEqual({
      status: 'UNCHANGED',
      createdExecution: false,
      campaignExecutionId,
      window,
    });
  });

  it.each([
    [{ ...window, timeZone: 'europe/paris' }, 'unsupported timezone'],
    [{ ...window, startLocalTime: '17:00:00' }, 'reversed window'],
    [{ ...window, endLocalTime: '09:00:00' }, 'equal window'],
  ])(
    'rejects invalid window %s before opening a transaction',
    async (badWindow) => {
      const harness = createHarness();

      await expect(
        harness.service.updateSendingWindow({
          workspaceId,
          campaignId,
          authContext,
          window: badWindow,
        }),
      ).rejects.toThrow('Campaign sending window input was invalid');
      expect(harness.transaction.run).not.toHaveBeenCalled();
    },
  );

  it('fails capacity-result proxies closed without invoking traps', async () => {
    let trapCalls = 0;
    const harness = createHarness({
      capacityResult: new Proxy(
        {
          status: 'CONFIGURED',
          campaignCapacityTimeZone: 'America/New_York',
        },
        {
          ownKeys: () => {
            trapCalls += 1;
            return ['status', 'campaignCapacityTimeZone'];
          },
        },
      ),
    });

    await expect(harness.service.startCampaign(startInput())).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'WORKSPACE_CAPACITY_TIMEZONE_UNAVAILABLE',
    });
    expect(trapCalls).toBe(0);
    expect(
      harness.authority.createNewAuthorizationInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('blocks window mutation while ACTIVE and does not read capacity or write', async () => {
    const harness = createHarness({ lifecycleStatus: 'ACTIVE' });

    await expect(
      harness.service.updateSendingWindow({
        workspaceId,
        campaignId,
        authContext,
        window,
      }),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'INVALID_LIFECYCLE_TRANSITION',
    });
    expect(
      harness.capacity.readCampaignCapacityTimeZoneInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.persistence.writeSendingWindowInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('pauses ACTIVE by revoking authority before lifecycle CAS and reports in-flight attempts', async () => {
    const harness = createHarness({ lifecycleStatus: 'ACTIVE' });

    await expect(
      harness.service.pauseCampaign({ workspaceId, campaignId, authContext }),
    ).resolves.toEqual({
      status: 'PAUSED',
      changed: true,
      campaignExecutionId,
      lifecycleStatus: 'PAUSED',
      inFlightCount: 2,
    });
    expect(harness.order).toEqual([
      'transaction',
      'inspect-authority',
      'load-execution',
      'load-activation',
      'revoke:CAMPAIGN_PAUSED',
      'transition:ACTIVE->PAUSED',
      'count-in-flight',
    ]);
  });

  it.each([
    ['pauseCampaign', 'CAMPAIGN_PAUSED'],
    ['completeCampaign', 'CAMPAIGN_COMPLETED'],
  ] as const)(
    'rejects a historical revoked acknowledgement from %s before lifecycle CAS',
    async (operation, revocationReason) => {
      const otherAuthorizationId = '26262626-2626-4626-8626-262626262626';
      const baseRevoked = authorityRecord({
        state: 'REVOKED',
        revokedAt: authorizedAt,
        revocationReason,
      });
      const harness = createHarness({
        lifecycleStatus: 'ACTIVE',
        revoke: {
          kind: 'REVOKED',
          authorization: {
            ...baseRevoked,
            authorizationId: otherAuthorizationId,
            binding: {
              ...baseRevoked.binding,
              authorizationId: otherAuthorizationId,
            },
          },
        },
      });

      await expect(
        harness.service[operation]({ workspaceId, campaignId, authContext }),
      ).rejects.toThrow(/revocation was inconsistent/);
      expect(
        harness.persistence.transitionLifecycleInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('replays coherent PAUSED as no-op without revocation/CAS', async () => {
    const harness = createHarness({ lifecycleStatus: 'PAUSED' });

    await expect(
      harness.service.pauseCampaign({ workspaceId, campaignId, authContext }),
    ).resolves.toMatchObject({
      status: 'PAUSED',
      changed: false,
      inFlightCount: 2,
    });
    expect(
      harness.authority.revokeCurrentAuthorizationInTransaction,
    ).not.toHaveBeenCalled();
    expect(
      harness.persistence.transitionLifecycleInTransaction,
    ).not.toHaveBeenCalled();
  });

  it('completes ACTIVE with revocation and PAUSED without rewriting revocation evidence', async () => {
    const active = createHarness({ lifecycleStatus: 'ACTIVE' });
    await expect(
      active.service.completeCampaign({ workspaceId, campaignId, authContext }),
    ).resolves.toMatchObject({ status: 'COMPLETED', changed: true });
    expect(active.order).toContain('revoke:CAMPAIGN_COMPLETED');
    expect(active.order).toContain('transition:ACTIVE->COMPLETED');

    const paused = createHarness({ lifecycleStatus: 'PAUSED' });
    await expect(
      paused.service.completeCampaign({ workspaceId, campaignId, authContext }),
    ).resolves.toMatchObject({ status: 'COMPLETED', changed: true });
    expect(
      paused.authority.revokeCurrentAuthorizationInTransaction,
    ).not.toHaveBeenCalled();
    expect(paused.order).toContain('transition:PAUSED->COMPLETED');
  });

  it('replays coherent COMPLETED as no-op and rejects DRAFT pause/completion', async () => {
    const completed = createHarness({ lifecycleStatus: 'COMPLETED' });
    await expect(
      completed.service.completeCampaign({
        workspaceId,
        campaignId,
        authContext,
      }),
    ).resolves.toMatchObject({ status: 'COMPLETED', changed: false });

    for (const operation of ['pauseCampaign', 'completeCampaign'] as const) {
      const draft = createHarness({ lifecycleStatus: 'DRAFT' });
      await expect(
        draft.service[operation]({ workspaceId, campaignId, authContext }),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'INVALID_LIFECYCLE_TRANSITION',
      });
      expect(
        draft.persistence.transitionLifecycleInTransaction,
      ).not.toHaveBeenCalled();
    }
  });

  it.each([
    'startCampaign',
    'pauseCampaign',
    'completeCampaign',
    'updateSendingWindow',
  ] as const)(
    'propagates W4 authorization failure for %s with zero participant calls',
    async (operation) => {
      const harness = createHarness();
      const denied = new Error('write denied');
      jest.mocked(harness.transaction.run).mockRejectedValueOnce(denied);
      const input =
        operation === 'startCampaign'
          ? startInput()
          : operation === 'updateSendingWindow'
            ? { workspaceId, campaignId, authContext, window }
            : { workspaceId, campaignId, authContext };

      await expect(harness.service[operation](input as never)).rejects.toBe(
        denied,
      );
      expect(
        harness.authority.inspectCurrentAuthorityInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        harness.persistence.loadExecutionInTransaction,
      ).not.toHaveBeenCalled();
      expect(
        harness.capacity.readCampaignCapacityTimeZoneInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it('rejects proxy/accessor Start input without invoking traps/getters or opening a transaction', async () => {
    let trapCalls = 0;
    let getterCalls = 0;
    const harness = createHarness();
    const proxied = new Proxy(startInput(), {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
    });
    const accessor = Object.defineProperty(
      {
        workspaceId,
        campaignId,
        authContext,
        startIdempotencyKey,
      },
      'request',
      {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return request;
        },
      },
    );

    await expect(harness.service.startCampaign(proxied)).rejects.toThrow(
      'Campaign Start input was invalid',
    );
    await expect(
      harness.service.startCampaign(accessor as StartCampaignInput),
    ).rejects.toThrow('Campaign Start input was invalid');
    expect(trapCalls).toBe(0);
    expect(getterCalls).toBe(0);
    expect(harness.transaction.run).not.toHaveBeenCalled();
  });
});
