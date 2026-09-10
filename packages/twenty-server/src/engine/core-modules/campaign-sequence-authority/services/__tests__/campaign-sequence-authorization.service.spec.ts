import { CampaignSequenceAuthorizationService } from 'src/engine/core-modules/campaign-sequence-authority/services/campaign-sequence-authorization.service';
import { type CampaignSequenceAuthorizationTransactionContext } from 'src/engine/core-modules/campaign-sequence-authority/types/campaign-sequence-authorization.type';

const IDS = {
  authorization: '00000000-0000-4000-8000-000000000001',
  nextAuthorization: '00000000-0000-4000-8000-000000000002',
  workspace: '00000000-0000-4000-8000-000000000003',
  campaign: '00000000-0000-4000-8000-000000000004',
  execution: '00000000-0000-4000-8000-000000000005',
  workflow: '00000000-0000-4000-8000-000000000006',
  version: '00000000-0000-4000-8000-000000000007',
  userWorkspace: '00000000-0000-4000-8000-000000000008',
  user: '00000000-0000-4000-8000-000000000009',
  member: '00000000-0000-4000-8000-00000000000a',
  message: '00000000-0000-4000-8000-00000000000b',
  file: '00000000-0000-4000-8000-00000000000e',
  startKey: '00000000-0000-4000-8000-00000000000c',
  nextStartKey: '00000000-0000-4000-8000-00000000000d',
};

const DIGEST = 'a'.repeat(64);
const AUTHORIZED_AT = '2026-09-10T10:00:00.000Z';
const REVOKED_AT = '2026-09-10T11:00:00.000Z';

const request = {
  preparedProof: {
    kind: 'PREPARED' as const,
    workspaceId: IDS.workspace,
    campaignId: IDS.campaign,
    workflowId: IDS.workflow,
    workflowVersionId: IDS.version,
    initiatingUserWorkspaceId: IDS.userWorkspace,
    initiatingUserId: IDS.user,
    initiatingWorkspaceMemberId: IDS.member,
    orderedMessageIds: [IDS.message],
    usedChannels: ['EMAIL'] as const,
    sequenceDigest: DIGEST,
    fixedMaterialDigest: DIGEST,
    senderAuthorityDigest: DIGEST,
    preparedFingerprint: DIGEST,
    signatureDigest: null,
    fixedMaterialProofs: [
      { messageId: IDS.message, orderedAttachmentProofs: [] },
    ],
    senderPoolFingerprint: DIGEST,
    senderPoolSerializationRevision: 'v1',
    senderPoolRotationPolicyId: 'stable-round-robin',
  },
  reviewedWindow: {
    timeZone: 'America/New_York',
    startLocalTime: '09:00:00',
    endLocalTime: '17:00:00',
  },
  campaignCapacityTimeZone: 'Europe/London',
};

const binding = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  authorizationId: IDS.authorization,
  generation: 1,
  startIdempotencyKey: IDS.startKey,
  workspaceId: IDS.workspace,
  campaignId: IDS.campaign,
  campaignExecutionId: IDS.execution,
  workflowVersionId: IDS.version,
  request,
  futureEligibleCampaignCreatorsAuthorized: true as const,
  authorizedAt: AUTHORIZED_AT,
  ...overrides,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  authorizationId: IDS.authorization,
  workspaceId: IDS.workspace,
  campaignId: IDS.campaign,
  campaignExecutionId: IDS.execution,
  generation: 1,
  startIdempotencyKey: IDS.startKey,
  preparedFingerprint: DIGEST,
  workflowId: IDS.workflow,
  workflowVersionId: IDS.version,
  initiatingUserWorkspaceId: IDS.userWorkspace,
  state: 'ACTIVE' as const,
  authorizedAt: AUTHORIZED_AT,
  revokedAt: null,
  revocationReason: null,
  binding: binding(),
  createdAt: AUTHORIZED_AT,
  updatedAt: AUTHORIZED_AT,
  ...overrides,
});

const projection = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  authorizationId: IDS.authorization,
  generation: 1,
  state: 'ACTIVE' as const,
  workflowVersionId: IDS.version,
  preparedFingerprint: DIGEST,
  authorizedAt: AUTHORIZED_AT,
  revokedAt: null,
  revocationReason: null,
  ...overrides,
});

const mutationResult = (records: unknown[], affected = records.length) => ({
  records,
  raw: records,
  affected,
});

const managerWith = (...results: unknown[]) => {
  const query = jest.fn();

  for (const result of results) query.mockResolvedValueOnce(result);

  return {
    query: jest.fn().mockRejectedValue(new Error('RAW_SQL_NOT_ALLOWED')),
    transaction: jest.fn(),
    queryRunner: {
      isReleased: false,
      isTransactionActive: true,
      query,
    },
  };
};

const contextWith = (
  manager: ReturnType<typeof managerWith>,
  lifecycleStatus: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED',
  currentAuthorityProjection: unknown,
): CampaignSequenceAuthorizationTransactionContext => ({
  manager: manager as never,
  workspaceId: IDS.workspace,
  campaignId: IDS.campaign,
  lockedCampaign: {
    id: IDS.campaign,
    lifecycleStatus,
    currentAuthorityProjection,
  },
});

const service = () =>
  new CampaignSequenceAuthorizationService({
    generateAuthorizationId: () => IDS.nextAuthorization,
    now: () => new Date(REVOKED_AT),
  });

describe('CampaignSequenceAuthorizationService', () => {
  it('rejects a missing, released, or inactive supplied transaction manager before querying', async () => {
    for (const queryRunner of [
      undefined,
      { isReleased: true, isTransactionActive: true },
      { isReleased: false, isTransactionActive: false },
    ]) {
      const manager = {
        query: jest.fn(),
        transaction: jest.fn(),
        queryRunner:
          queryRunner === undefined
            ? undefined
            : { ...queryRunner, query: jest.fn() },
      };
      const context = contextWith(
        manager as ReturnType<typeof managerWith>,
        'DRAFT',
        null,
      );

      await expect(
        service().inspectCurrentAuthorityInTransaction(context),
      ).rejects.toThrow('active caller-supplied transaction');
      expect(manager.query).not.toHaveBeenCalled();
      expect(manager.transaction).not.toHaveBeenCalled();
    }
  });

  it('classifies one exact latest active authority for ACTIVE lifecycle', async () => {
    const manager = managerWith([row()]);

    await expect(
      service().inspectCurrentAuthorityInTransaction(
        contextWith(manager, 'ACTIVE', projection()),
      ),
    ).resolves.toMatchObject({
      kind: 'CURRENT_ACTIVE',
      authorization: { authorizationId: IDS.authorization, generation: 1 },
    });
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.queryRunner.query).toHaveBeenCalledTimes(1);
    expect(manager.transaction).not.toHaveBeenCalled();
  });

  it('fails closed on malformed ACTIVE revocation evidence in history and projection', async () => {
    const malformedHistoryManager = managerWith([
      row({ revokedAt: 'not-an-instant' }),
    ]);
    const malformedProjectionManager = managerWith([row()]);

    await expect(
      service().inspectCurrentAuthorityInTransaction(
        contextWith(malformedHistoryManager, 'ACTIVE', projection()),
      ),
    ).resolves.toMatchObject({
      kind: 'INCONSISTENT_CURRENT_AUTHORITY',
      blockerCode: 'MALFORMED_AUTHORIZATION_HISTORY',
    });
    await expect(
      service().inspectCurrentAuthorityInTransaction(
        contextWith(
          malformedProjectionManager,
          'ACTIVE',
          projection({ revokedAt: 'not-an-instant' }),
        ),
      ),
    ).resolves.toMatchObject({
      kind: 'INCONSISTENT_CURRENT_AUTHORITY',
      blockerCode: 'MALFORMED_CURRENT_PROJECTION',
    });
  });

  it.each([
    {
      label: 'an unprojected active row on non-ACTIVE lifecycle',
      lifecycle: 'PAUSED' as const,
      rows: [row()],
      current: null,
    },
    {
      label: 'a stale revoked pointer when a later generation exists',
      lifecycle: 'PAUSED' as const,
      rows: [
        row({
          state: 'REVOKED',
          revokedAt: REVOKED_AT,
          revocationReason: 'CAMPAIGN_PAUSED',
          binding: binding(),
        }),
        row({
          authorizationId: IDS.nextAuthorization,
          generation: 2,
          startIdempotencyKey: IDS.nextStartKey,
          state: 'REVOKED',
          revokedAt: REVOKED_AT,
          revocationReason: 'CAMPAIGN_PAUSED',
          binding: binding({
            authorizationId: IDS.nextAuthorization,
            generation: 2,
            startIdempotencyKey: IDS.nextStartKey,
          }),
        }),
      ],
      current: projection({
        state: 'REVOKED',
        revokedAt: REVOKED_AT,
        revocationReason: 'CAMPAIGN_PAUSED',
      }),
    },
    {
      label: 'an older active row hidden by a newer revoked projection',
      lifecycle: 'PAUSED' as const,
      rows: [
        row(),
        row({
          authorizationId: IDS.nextAuthorization,
          generation: 2,
          startIdempotencyKey: IDS.nextStartKey,
          state: 'REVOKED',
          revokedAt: REVOKED_AT,
          revocationReason: 'CAMPAIGN_PAUSED',
          binding: binding({
            authorizationId: IDS.nextAuthorization,
            generation: 2,
            startIdempotencyKey: IDS.nextStartKey,
          }),
        }),
      ],
      current: projection({
        authorizationId: IDS.nextAuthorization,
        generation: 2,
        state: 'REVOKED',
        revokedAt: REVOKED_AT,
        revocationReason: 'CAMPAIGN_PAUSED',
      }),
    },
  ])('fails closed for $label', async ({ lifecycle, rows, current }) => {
    const manager = managerWith(rows);

    await expect(
      service().inspectCurrentAuthorityInTransaction(
        contextWith(manager, lifecycle, current),
      ),
    ).resolves.toMatchObject({ kind: 'INCONSISTENT_CURRENT_AUTHORITY' });
  });

  it('performs read-only structural request lookup before any current eligibility read', async () => {
    const manager = managerWith([row()]);

    await expect(
      service().lookupStartRequestInTransaction(
        contextWith(manager, 'PAUSED', projection()),
        { startIdempotencyKey: IDS.startKey, request },
      ),
    ).resolves.toMatchObject({
      kind: 'EXACT_MATCH',
      authorization: { authorizationId: IDS.authorization },
    });
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.queryRunner.query).toHaveBeenCalledTimes(1);
    expect(manager.queryRunner.query.mock.calls[0][0]).toContain(
      'startIdempotencyKey',
    );
    expect(manager.transaction).not.toHaveBeenCalled();
  });

  it('distinguishes not found from same-key structural request conflict', async () => {
    const absentManager = managerWith([]);
    const conflictManager = managerWith([row()]);

    await expect(
      service().lookupStartRequestInTransaction(
        contextWith(absentManager, 'DRAFT', null),
        { startIdempotencyKey: IDS.startKey, request },
      ),
    ).resolves.toEqual({ kind: 'NOT_FOUND' });
    await expect(
      service().lookupStartRequestInTransaction(
        contextWith(conflictManager, 'DRAFT', null),
        {
          startIdempotencyKey: IDS.startKey,
          request: {
            ...request,
            reviewedWindow: {
              ...request.reviewedWindow,
              endLocalTime: '18:00:00',
            },
          },
        },
      ),
    ).resolves.toEqual({ kind: 'IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('uses exact shared IANA membership, including listed aliases', async () => {
    const aliasRequest = {
      ...request,
      reviewedWindow: { ...request.reviewedWindow, timeZone: 'US/Eastern' },
      campaignCapacityTimeZone: 'US/Eastern',
    };
    const aliasManager = managerWith([
      row({ binding: binding({ request: aliasRequest }) }),
    ]);
    const invalidManager = managerWith();

    await expect(
      service().lookupStartRequestInTransaction(
        contextWith(aliasManager, 'PAUSED', projection()),
        { startIdempotencyKey: IDS.startKey, request: aliasRequest },
      ),
    ).resolves.toMatchObject({ kind: 'EXACT_MATCH' });
    await expect(
      service().lookupStartRequestInTransaction(
        contextWith(invalidManager, 'PAUSED', projection()),
        {
          startIdempotencyKey: IDS.startKey,
          request: {
            ...request,
            campaignCapacityTimeZone: 'Mars/Olympus',
          },
        },
      ),
    ).rejects.toThrow('request');
    expect(invalidManager.queryRunner.query).not.toHaveBeenCalled();
  });

  it('preserves whitespace-bearing request identity through lookup and replay', async () => {
    const whitespaceRequest = {
      ...request,
      preparedProof: {
        ...request.preparedProof,
        fixedMaterialProofs: [
          {
            messageId: IDS.message,
            orderedAttachmentProofs: [
              {
                fileId: IDS.file,
                filename: ' brief.pdf ',
                contentType: ' application/pdf ',
                size: 12,
                contentDigest: DIGEST,
              },
            ],
          },
        ],
        senderPoolSerializationRevision: ' v1 ',
        senderPoolRotationPolicyId: ' stable-round-robin ',
      },
    };
    const manager = managerWith([
      row({ binding: binding({ request: whitespaceRequest }) }),
    ]);

    await expect(
      service().lookupStartRequestInTransaction(
        contextWith(manager, 'PAUSED', projection()),
        { startIdempotencyKey: IDS.startKey, request: whitespaceRequest },
      ),
    ).resolves.toMatchObject({ kind: 'EXACT_MATCH' });
  });

  it('creates a server-authored next generation and CAS-projects only the locked Campaign', async () => {
    const prior = row({
      state: 'REVOKED',
      revokedAt: AUTHORIZED_AT,
      revocationReason: 'CAMPAIGN_PAUSED',
    });
    const current = projection({
      state: 'REVOKED',
      revokedAt: AUTHORIZED_AT,
      revocationReason: 'CAMPAIGN_PAUSED',
    });
    const created = row({
      authorizationId: IDS.nextAuthorization,
      generation: 2,
      startIdempotencyKey: IDS.nextStartKey,
      state: 'ACTIVE',
      authorizedAt: REVOKED_AT,
      binding: binding({
        authorizationId: IDS.nextAuthorization,
        generation: 2,
        startIdempotencyKey: IDS.nextStartKey,
        authorizedAt: REVOKED_AT,
      }),
      createdAt: REVOKED_AT,
      updatedAt: REVOKED_AT,
    });
    const manager = managerWith(
      [prior],
      mutationResult([created], 1),
      mutationResult([{ id: IDS.campaign }], 1),
    );

    await expect(
      service().createNewAuthorizationInTransaction(
        contextWith(manager, 'PAUSED', current),
        {
          startIdempotencyKey: IDS.nextStartKey,
          campaignExecutionId: IDS.execution,
          request,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'CREATED',
      authorization: {
        authorizationId: IDS.nextAuthorization,
        generation: 2,
        authorizedAt: REVOKED_AT,
      },
    });

    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.queryRunner.query).toHaveBeenCalledTimes(3);
    expect(manager.queryRunner.query.mock.calls[0][0]).toContain(
      'campaignSequenceAuthorization',
    );
    expect(manager.queryRunner.query.mock.calls[1][0]).toContain(
      'ON CONFLICT DO NOTHING',
    );
    expect(manager.queryRunner.query.mock.calls[1][1]).toEqual(
      expect.arrayContaining([IDS.nextAuthorization, 2, REVOKED_AT]),
    );
    expect(manager.queryRunner.query.mock.calls[1][2]).toBe(true);
    expect(manager.queryRunner.query.mock.calls[2][0]).toContain(
      'UPDATE "workspace_',
    );
    expect(manager.queryRunner.query.mock.calls[2][0]).toContain(
      '"."campaign"',
    );
    expect(manager.queryRunner.query.mock.calls[2][1]).toEqual(
      expect.arrayContaining([IDS.campaign]),
    );
    expect(manager.queryRunner.query.mock.calls[2][2]).toBe(true);
    expect(manager.transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'authorization insert conflict',
      [
        [
          /* no history */
        ],
        mutationResult([], 0),
        mutationResult([], 0),
      ],
    ],
    [
      'Campaign projection CAS miss',
      [
        [
          /* no history */
        ],
        mutationResult(
          [
            row({
              authorizationId: IDS.nextAuthorization,
              startIdempotencyKey: IDS.nextStartKey,
              binding: binding({
                authorizationId: IDS.nextAuthorization,
                startIdempotencyKey: IDS.nextStartKey,
                authorizedAt: REVOKED_AT,
              }),
              authorizedAt: REVOKED_AT,
              createdAt: REVOKED_AT,
              updatedAt: REVOKED_AT,
            }),
          ],
          1,
        ),
        mutationResult([], 0),
      ],
    ],
  ])('treats %s as an integrity failure', async (_label, results) => {
    const manager = managerWith(...results);

    await expect(
      service().createNewAuthorizationInTransaction(
        contextWith(manager, 'DRAFT', null),
        {
          startIdempotencyKey: IDS.nextStartKey,
          campaignExecutionId: IDS.execution,
          request,
        },
      ),
    ).rejects.toThrow('integrity');

    if (_label === 'Campaign projection CAS miss') {
      expect(manager.queryRunner.query).toHaveBeenCalledTimes(3);
      expect(manager.queryRunner.query.mock.calls[2][0]).toContain(
        'sequenceAuthorization',
      );
    }
  });

  it('rejects caller scope, malformed proof state, and caller-shaped authority values', async () => {
    const manager = managerWith();

    await expect(
      service().createNewAuthorizationInTransaction(
        contextWith(manager, 'DRAFT', null),
        {
          startIdempotencyKey: IDS.nextStartKey,
          campaignExecutionId: IDS.execution,
          request: {
            ...request,
            preparedProof: {
              ...request.preparedProof,
              kind: 'BLOCKED' as never,
            },
          },
        },
      ),
    ).rejects.toThrow('request');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('revokes exactly the current row and CAS-projects the same timestamp and reason', async () => {
    const revoked = row({
      state: 'REVOKED',
      revokedAt: REVOKED_AT,
      revocationReason: 'CAMPAIGN_PAUSED',
      updatedAt: REVOKED_AT,
    });
    const manager = managerWith(
      [row()],
      mutationResult([revoked], 1),
      mutationResult([{ id: IDS.campaign }], 1),
    );

    await expect(
      service().revokeCurrentAuthorizationInTransaction(
        contextWith(manager, 'ACTIVE', projection()),
        { reason: 'CAMPAIGN_PAUSED' },
      ),
    ).resolves.toMatchObject({
      kind: 'REVOKED',
      authorization: {
        revokedAt: REVOKED_AT,
        revocationReason: 'CAMPAIGN_PAUSED',
      },
    });
    expect(manager.query).not.toHaveBeenCalled();
    expect(manager.queryRunner.query.mock.calls[1][0]).toContain(
      `"state" = 'REVOKED'`,
    );
    expect(manager.queryRunner.query.mock.calls[1][2]).toBe(true);
    expect(manager.queryRunner.query.mock.calls[2][0]).toContain(
      'UPDATE "workspace_',
    );
    expect(manager.queryRunner.query.mock.calls[2][0]).toContain(
      '"."campaign"',
    );
    expect(manager.queryRunner.query.mock.calls[2][2]).toBe(true);
  });

  it('rejects a later Pause request from overwriting Completion evidence', async () => {
    const completed = row({
      state: 'REVOKED',
      revokedAt: REVOKED_AT,
      revocationReason: 'CAMPAIGN_COMPLETED',
    });
    const manager = managerWith([completed]);

    await expect(
      service().revokeCurrentAuthorizationInTransaction(
        contextWith(
          manager,
          'COMPLETED',
          projection({
            state: 'REVOKED',
            revokedAt: REVOKED_AT,
            revocationReason: 'CAMPAIGN_COMPLETED',
          }),
        ),
        { reason: 'CAMPAIGN_PAUSED' },
      ),
    ).rejects.toThrow('revocation conflict');
    expect(manager.queryRunner.query).toHaveBeenCalledTimes(1);
  });

  it('preserves original Pause evidence across PAUSED to COMPLETED', async () => {
    const paused = row({
      state: 'REVOKED',
      revokedAt: REVOKED_AT,
      revocationReason: 'CAMPAIGN_PAUSED',
    });
    const manager = managerWith([paused]);

    await expect(
      service().revokeCurrentAuthorizationInTransaction(
        contextWith(
          manager,
          'PAUSED',
          projection({
            state: 'REVOKED',
            revokedAt: REVOKED_AT,
            revocationReason: 'CAMPAIGN_PAUSED',
          }),
        ),
        { reason: 'CAMPAIGN_COMPLETED' },
      ),
    ).resolves.toMatchObject({
      kind: 'ALREADY_REVOKED',
      authorization: { revocationReason: 'CAMPAIGN_PAUSED' },
    });
    expect(manager.queryRunner.query).toHaveBeenCalledTimes(1);
  });
});
