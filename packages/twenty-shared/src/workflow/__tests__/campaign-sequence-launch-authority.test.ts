import {
  campaignSequenceAuthorizationBindingSchema,
  campaignSequenceAuthorizationCurrentProjectionSchema,
  campaignSequenceAuthorizationRequestSchema,
} from '../campaign-sequence-launch-authority';

const UUIDS = {
  authorization: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  campaign: '00000000-0000-4000-8000-000000000003',
  execution: '00000000-0000-4000-8000-000000000004',
  workflow: '00000000-0000-4000-8000-000000000005',
  version: '00000000-0000-4000-8000-000000000006',
  userWorkspace: '00000000-0000-4000-8000-000000000007',
  user: '00000000-0000-4000-8000-000000000008',
  workspaceMember: '00000000-0000-4000-8000-000000000009',
  message: '00000000-0000-4000-8000-00000000000a',
  file: '00000000-0000-4000-8000-00000000000b',
};

const DIGEST = 'a'.repeat(64);

const request = {
  preparedProof: {
    kind: 'PREPARED',
    workspaceId: UUIDS.workspace,
    campaignId: UUIDS.campaign,
    workflowId: UUIDS.workflow,
    workflowVersionId: UUIDS.version,
    initiatingUserWorkspaceId: UUIDS.userWorkspace,
    initiatingUserId: UUIDS.user,
    initiatingWorkspaceMemberId: UUIDS.workspaceMember,
    orderedMessageIds: [UUIDS.message],
    usedChannels: ['EMAIL'],
    sequenceDigest: DIGEST,
    fixedMaterialDigest: DIGEST,
    senderAuthorityDigest: DIGEST,
    preparedFingerprint: DIGEST,
    signatureDigest: null,
    fixedMaterialProofs: [
      {
        messageId: UUIDS.message,
        orderedAttachmentProofs: [
          {
            fileId: UUIDS.file,
            filename: 'brief.pdf',
            contentType: 'application/pdf',
            size: 12,
            contentDigest: DIGEST,
          },
        ],
      },
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
} as const;

const binding = {
  schemaVersion: 1,
  authorizationId: UUIDS.authorization,
  generation: 1,
  startIdempotencyKey: '00000000-0000-4000-8000-00000000000c',
  workspaceId: UUIDS.workspace,
  campaignId: UUIDS.campaign,
  campaignExecutionId: UUIDS.execution,
  workflowVersionId: UUIDS.version,
  request,
  futureEligibleCampaignCreatorsAuthorized: true,
  authorizedAt: '2026-09-10T10:00:00.000Z',
} as const;

describe('campaign sequence launch authority contract', () => {
  it('accepts the exact PREPARED proof wrapper and immutable binding', () => {
    expect(campaignSequenceAuthorizationRequestSchema.parse(request)).toEqual(
      request,
    );
    expect(campaignSequenceAuthorizationBindingSchema.parse(binding)).toEqual(
      binding,
    );
  });

  it('accepts aliases that are exact shared IANA list members', () => {
    expect(
      campaignSequenceAuthorizationRequestSchema.safeParse({
        ...request,
        reviewedWindow: { ...request.reviewedWindow, timeZone: 'US/Eastern' },
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown request key', { ...request, extra: true }],
    [
      'a non-canonical UUID',
      {
        ...request,
        preparedProof: {
          ...request.preparedProof,
          campaignId: 'A0000000-0000-4000-8000-000000000003',
        },
      },
    ],
    [
      'a non-PREPARED proof',
      {
        ...request,
        preparedProof: { ...request.preparedProof, kind: 'BLOCKED' },
      },
    ],
    [
      'a timezone not in the shared IANA list',
      {
        ...request,
        reviewedWindow: { ...request.reviewedWindow, timeZone: 'Mars/Olympus' },
      },
    ],
    [
      'an overnight or empty window',
      {
        ...request,
        reviewedWindow: {
          ...request.reviewedWindow,
          startLocalTime: '17:00:00',
          endLocalTime: '09:00:00',
        },
      },
    ],
    [
      'a missing capacity timezone',
      { ...request, campaignCapacityTimeZone: '' },
    ],
    [
      'out-of-order fixed material proofs',
      {
        ...request,
        preparedProof: {
          ...request.preparedProof,
          fixedMaterialProofs: [
            {
              ...request.preparedProof.fixedMaterialProofs[0],
              messageId: UUIDS.file,
            },
          ],
        },
      },
    ],
  ])('rejects %s', (_label, candidate) => {
    expect(
      campaignSequenceAuthorizationRequestSchema.safeParse(candidate).success,
    ).toBe(false);
  });

  it('rejects non-plain or accessor-bearing request data', () => {
    const inherited = Object.assign(
      Object.create({ inherited: true }),
      request,
    );
    const accessor = { ...request } as Record<string, unknown>;

    Object.defineProperty(accessor, 'campaignCapacityTimeZone', {
      enumerable: true,
      get: () => 'Europe/London',
    });

    expect(
      campaignSequenceAuthorizationRequestSchema.safeParse(inherited).success,
    ).toBe(false);
    expect(
      campaignSequenceAuthorizationRequestSchema.safeParse(accessor).success,
    ).toBe(false);
  });

  it('preserves whitespace-bearing nonblank proof identity strings exactly', () => {
    const whitespaceBearing = {
      ...request,
      preparedProof: {
        ...request.preparedProof,
        fixedMaterialProofs: [
          {
            ...request.preparedProof.fixedMaterialProofs[0],
            orderedAttachmentProofs: [
              {
                ...request.preparedProof.fixedMaterialProofs[0]
                  .orderedAttachmentProofs[0],
                filename: ' brief.pdf ',
                contentType: ' application/pdf ',
              },
            ],
          },
        ],
        senderPoolSerializationRevision: ' v1 ',
        senderPoolRotationPolicyId: ' stable-round-robin ',
      },
    };

    expect(
      campaignSequenceAuthorizationRequestSchema.parse(whitespaceBearing),
    ).toEqual(whitespaceBearing);
  });

  it('keeps array order in request identity while ignoring object key order', () => {
    const reordered = {
      campaignCapacityTimeZone: request.campaignCapacityTimeZone,
      reviewedWindow: request.reviewedWindow,
      preparedProof: {
        ...request.preparedProof,
        orderedMessageIds: [UUIDS.file, UUIDS.message],
        fixedMaterialProofs: [
          {
            messageId: UUIDS.file,
            orderedAttachmentProofs: [],
          },
          request.preparedProof.fixedMaterialProofs[0],
        ],
      },
    };

    const parsed = campaignSequenceAuthorizationRequestSchema.parse(reordered);

    expect(parsed.preparedProof.orderedMessageIds).toEqual([
      UUIDS.file,
      UUIDS.message,
    ]);
  });

  it('rejects unsafe attachment size and authorization generation integers', () => {
    const unsafeAttachmentSize = {
      ...request,
      preparedProof: {
        ...request.preparedProof,
        fixedMaterialProofs: [
          {
            ...request.preparedProof.fixedMaterialProofs[0],
            orderedAttachmentProofs: [
              {
                ...request.preparedProof.fixedMaterialProofs[0]
                  .orderedAttachmentProofs[0],
                size: Number.MAX_SAFE_INTEGER + 1,
              },
            ],
          },
        ],
      },
    };

    expect(
      campaignSequenceAuthorizationRequestSchema.safeParse(unsafeAttachmentSize)
        .success,
    ).toBe(false);
    expect(
      campaignSequenceAuthorizationBindingSchema.safeParse({
        ...binding,
        generation: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });

  it('rejects malformed non-null ACTIVE projection revocation evidence', () => {
    expect(
      campaignSequenceAuthorizationCurrentProjectionSchema.safeParse({
        schemaVersion: 1,
        authorizationId: UUIDS.authorization,
        generation: 1,
        state: 'ACTIVE',
        workflowVersionId: UUIDS.version,
        preparedFingerprint: DIGEST,
        authorizedAt: binding.authorizedAt,
        revokedAt: 'not-an-instant',
        revocationReason: null,
      }).success,
    ).toBe(false);
  });

  it('requires complete current projection revocation evidence', () => {
    expect(
      campaignSequenceAuthorizationCurrentProjectionSchema.safeParse({
        schemaVersion: 1,
        authorizationId: UUIDS.authorization,
        generation: 1,
        state: 'REVOKED',
        workflowVersionId: UUIDS.version,
        preparedFingerprint: DIGEST,
        authorizedAt: binding.authorizedAt,
        revokedAt: null,
        revocationReason: null,
      }).success,
    ).toBe(false);
  });
});
