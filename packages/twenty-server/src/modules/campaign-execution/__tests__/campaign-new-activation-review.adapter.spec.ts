import { CampaignNewActivationReviewAdapter } from 'src/modules/campaign-execution/adapters/campaign-new-activation-review.adapter';
import {
  buildCampaignFixedMaterialDigest,
  buildCampaignPreparedFingerprint,
  buildCampaignSenderAuthorityDigest,
  buildCampaignSequenceIdentityDigest,
} from 'src/modules/campaign-execution/utils/campaign-launch-proof.util';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const workflowId = '33333333-3333-4333-8333-333333333333';
const workflowVersionId = '44444444-4444-4444-8444-444444444444';
const messageId = '55555555-5555-4555-8555-555555555555';
const userWorkspaceId = '66666666-6666-4666-8666-666666666666';
const userId = '77777777-7777-4777-8777-777777777777';
const workspaceMemberId = '88888888-8888-4888-8888-888888888888';
const mailbox = {
  bindingStatus: 'RESOLVED_BINDING' as const,
  status: 'READY' as const,
  reason: null,
  campaignAccountId: '99999999-9999-4999-8999-999999999999',
  connectedAccountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  messageChannelId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recoveryPath: null,
  senderHandle: 'sender@example.com',
  provider: 'google' as never,
  dailySendLimit: 100,
  minimumSendIntervalMs: 1000,
  missingBinding: null,
};
const senderPool = {
  rotationPolicyId:
    'EARLIEST_ELIGIBLE_LOWEST_DAILY_USAGE_STABLE_ACCOUNT_V1' as const,
  serializationRevision: 'CAMPAIGN_SENDER_POOL_V2' as const,
  mailboxes: [mailbox],
  senderPoolFingerprint: 'a'.repeat(64),
};
const fixedMaterialValue = {
  workspaceId,
  campaignId,
  workflowVersionId,
  signatureDigest: null,
  messages: [
    {
      messageId,
      subject: 'Subject',
      body: 'Body',
      replyToThread: false,
      orderedFileRefs: [],
      orderedAttachmentProofs: [],
    },
  ],
};
const fixedMaterial = {
  loadSequenceFixedMaterial: jest
    .fn()
    .mockResolvedValue({ kind: 'READY', value: fixedMaterialValue }),
};

const plan = {
  kind: 'READY' as const,
  workspaceId,
  campaignId,
  workflowId,
  workflowVersionId,
  nodes: [{ messageId, channel: 'EMAIL' as const, replyToThread: false }],
  delaysSeconds: [],
};

const makeInput = (
  rows: unknown[],
  proofSenderPool: {
    rotationPolicyId: string;
    serializationRevision: string;
    mailboxes: { bindingStatus: string; status: string }[];
    senderPoolFingerprint: string;
  } = senderPool,
) => {
  const query = jest.fn().mockResolvedValue(rows);
  const manager = {} as any;
  const queryRunner = {
    isTransactionActive: true,
    isReleased: false,
    manager,
    query,
  };
  manager.queryRunner = queryRunner;
  const sequenceDigest = buildCampaignSequenceIdentityDigest(plan);
  const readySenderBindings = proofSenderPool.mailboxes.filter(
    (selectedMailbox) =>
      selectedMailbox.bindingStatus === 'RESOLVED_BINDING' &&
      selectedMailbox.status === 'READY',
  );
  const senderAuthorityDigest = buildCampaignSenderAuthorityDigest({
    readySenderBindings,
    senderPoolFingerprint: proofSenderPool.senderPoolFingerprint,
    senderPoolSerializationRevision: proofSenderPool.serializationRevision,
    senderPoolRotationPolicyId: proofSenderPool.rotationPolicyId,
  });
  const proofBase = {
    workspaceId,
    campaignId,
    workflowId,
    workflowVersionId,
    initiatingUserWorkspaceId: userWorkspaceId,
    initiatingUserId: userId,
    initiatingWorkspaceMemberId: workspaceMemberId,
    sequenceDigest,
    fixedMaterialDigest: buildCampaignFixedMaterialDigest({
      signatureDigest: fixedMaterialValue.signatureDigest,
      messages: fixedMaterialValue.messages,
    }),
    senderAuthorityDigest,
  };
  const proof = {
    kind: 'PREPARED' as const,
    ...proofBase,
    preparedFingerprint: buildCampaignPreparedFingerprint(proofBase),
    orderedMessageIds: [messageId],
    usedChannels: ['EMAIL'] as const,
    signatureDigest: null,
    fixedMaterialProofs: [{ messageId, orderedAttachmentProofs: [] }],
    senderPoolFingerprint: proofSenderPool.senderPoolFingerprint,
    senderPoolSerializationRevision: proofSenderPool.serializationRevision,
    senderPoolRotationPolicyId: proofSenderPool.rotationPolicyId,
  };
  const context = {
    manager,
    workspaceId,
    campaignId,
    schemaName: 'workspace_test',
    workspace: { id: workspaceId, campaignCapacityTimeZone: 'UTC' },
    campaign: {
      id: campaignId,
      lifecycleStatus: 'DRAFT',
      sequenceAuthorization: null,
    },
    actorPermissionContext: {
      rolePermissionConfig: { intersectionOf: ['role'] },
      authContext: {
        type: 'user',
        workspace: { id: workspaceId },
        userWorkspaceId,
        user: { id: userId },
        workspaceMemberId,
        workspaceMember: {},
      },
    },
  } as any;

  return {
    query,
    input: {
      context,
      execution: {
        campaignExecutionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        workspaceId,
        campaignId,
        window: {
          timeZone: 'UTC',
          startLocalTime: '09:00:00',
          endLocalTime: '17:00:00',
        },
        campaignCapacityTimeZone: 'UTC',
      },
      request: {
        preparedProof: proof,
        reviewedWindow: {
          timeZone: 'UTC',
          startLocalTime: '09:00:00',
          endLocalTime: '17:00:00',
        },
        campaignCapacityTimeZone: 'UTC',
      },
      plan,
      campaignCapacityTimeZone: 'UTC',
    } as any,
  };
};

const audienceReview = (
  eligible: Array<{ campaignCreatorId: string; creatorId: string }> = [
    {
      campaignCreatorId: '10000000-0000-4000-8000-000000000001',
      creatorId: '20000000-0000-4000-8000-000000000001',
    },
  ],
) => ({
  reviewInTransaction: jest.fn().mockResolvedValue({
    campaignId,
    eligible: eligible.map((creator) => ({
      ...creator,
      creatorName: creator.creatorId,
      normalizedEmail: 'creator@example.com',
    })),
    excluded: [],
  }),
});

describe('CampaignNewActivationReviewAdapter', () => {
  it('uses the authoritative audience result for transactional enrollment', async () => {
    const harness = makeInput([
      {
        campaignCreatorId: '10000000-0000-4000-8000-000000000001',
        creatorId: '20000000-0000-4000-8000-000000000001',
        stage: 'READY',
        email: ' Unique@Example.com ',
      },
      {
        campaignCreatorId: '10000000-0000-4000-8000-000000000002',
        creatorId: '20000000-0000-4000-8000-000000000002',
        stage: 'CONTACTED',
        email: 'same@example.com',
      },
      {
        campaignCreatorId: '10000000-0000-4000-8000-000000000003',
        creatorId: '20000000-0000-4000-8000-000000000003',
        stage: 'READY',
        email: ' SAME@example.com ',
      },
      {
        campaignCreatorId: '10000000-0000-4000-8000-000000000004',
        creatorId: '20000000-0000-4000-8000-000000000004',
        stage: 'READY',
        email: null,
      },
      {
        campaignCreatorId: '10000000-0000-4000-8000-000000000005',
        creatorId: '20000000-0000-4000-8000-000000000005',
        stage: 'READY',
        email: 'not-an-email',
      },
    ]);
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockResolvedValue(senderPool),
    };
    const review = audienceReview([
      {
        campaignCreatorId: '10000000-0000-4000-8000-000000000001',
        creatorId: '20000000-0000-4000-8000-000000000001',
      },
    ]);
    const adapter = new CampaignNewActivationReviewAdapter(
      readiness as never,
      review as never,
      fixedMaterial as never,
    );

    await expect(
      adapter.revalidateNewActivationInTransaction(harness.input),
    ).resolves.toEqual({
      status: 'READY',
      eligibleCreators: [
        {
          campaignCreatorId: '10000000-0000-4000-8000-000000000001',
          creatorId: '20000000-0000-4000-8000-000000000001',
          usableMessageIds: [messageId],
        },
      ],
    });
    expect(review.reviewInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        manager: harness.input.context.manager,
        rolePermissionConfig: { intersectionOf: ['role'] },
      }),
    );
    expect(fixedMaterial.loadSequenceFixedMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId,
        workspaceId,
        workflowVersionId,
      }),
      harness.input.context.manager,
    );
  });

  it('fails closed when fixed material mutates before the transactional Start lock', async () => {
    const harness = makeInput([]);
    const mutatedMaterial = {
      loadSequenceFixedMaterial: jest.fn().mockResolvedValue({
        kind: 'READY',
        value: {
          ...fixedMaterialValue,
          messages: [
            {
              ...fixedMaterialValue.messages[0],
              body: 'Mutated while Start was waiting',
            },
          ],
        },
      }),
    };
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest.fn(),
    };
    const review = audienceReview();
    const adapter = new CampaignNewActivationReviewAdapter(
      readiness as never,
      review as never,
      mutatedMaterial as never,
    );

    await expect(
      adapter.revalidateNewActivationInTransaction(harness.input),
    ).resolves.toEqual({
      reason: 'CURRENT_REVIEW_INVALID',
      status: 'BLOCKED',
    });
    expect(mutatedMaterial.loadSequenceFixedMaterial).toHaveBeenCalledWith(
      expect.anything(),
      harness.input.context.manager,
    );
    expect(
      readiness.getCampaignEmailSenderPoolInTransaction,
    ).not.toHaveBeenCalled();
    expect(review.reviewInTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when no selected EMAIL mailbox is READY', async () => {
    const zeroReadyPool = {
      ...senderPool,
      mailboxes: [{ ...mailbox, status: 'BLOCKED' as const }],
      senderPoolFingerprint: 'c'.repeat(64),
    };
    const harness = makeInput([], zeroReadyPool);
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockResolvedValue(zeroReadyPool),
    };

    const review = audienceReview();
    await expect(
      new CampaignNewActivationReviewAdapter(
        readiness as never,
        review as never,
        fixedMaterial as never,
      ).revalidateNewActivationInTransaction(harness.input),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'CURRENT_REVIEW_INVALID',
    });
    expect(review.reviewInTransaction).not.toHaveBeenCalled();
  });

  it('accepts multiple READY senders', async () => {
    const multipleReadyPool = {
      ...senderPool,
      mailboxes: [
        mailbox,
        {
          ...mailbox,
          campaignAccountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          connectedAccountId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          messageChannelId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          senderHandle: 'second@example.com',
        },
      ],
      senderPoolFingerprint: 'd'.repeat(64),
    };
    const harness = makeInput([], multipleReadyPool);
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockResolvedValue(multipleReadyPool),
    };

    const review = audienceReview();
    await expect(
      new CampaignNewActivationReviewAdapter(
        readiness as never,
        review as never,
        fixedMaterial as never,
      ).revalidateNewActivationInTransaction(harness.input),
    ).resolves.toMatchObject({ status: 'READY' });
    expect(review.reviewInTransaction).toHaveBeenCalledTimes(1);
  });

  it('accepts mixed READY and blocked senders while digesting only READY bindings', async () => {
    const blockedMailbox = {
      ...mailbox,
      status: 'BLOCKED' as const,
      reason: 'AUTH_EXPIRED' as const,
      campaignAccountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      connectedAccountId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      messageChannelId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      senderHandle: 'blocked@example.com',
    };
    const mixedPool = {
      ...senderPool,
      mailboxes: [mailbox, blockedMailbox],
      senderPoolFingerprint: 'e'.repeat(64),
    };
    const harness = makeInput([], mixedPool);
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockResolvedValue(mixedPool),
    };

    expect(harness.input.request.preparedProof.senderAuthorityDigest).toBe(
      buildCampaignSenderAuthorityDigest({
        readySenderBindings: [mailbox],
        senderPoolFingerprint: mixedPool.senderPoolFingerprint,
        senderPoolSerializationRevision: mixedPool.serializationRevision,
        senderPoolRotationPolicyId: mixedPool.rotationPolicyId,
      }),
    );
    const review = audienceReview();
    await expect(
      new CampaignNewActivationReviewAdapter(
        readiness as never,
        review as never,
        fixedMaterial as never,
      ).revalidateNewActivationInTransaction(harness.input),
    ).resolves.toMatchObject({ status: 'READY' });
    expect(review.reviewInTransaction).toHaveBeenCalledTimes(1);
  });

  it('blocks a zero-eligible audience from Start', async () => {
    const harness = makeInput([]);
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockResolvedValue(senderPool),
    };
    const review = audienceReview([]);

    await expect(
      new CampaignNewActivationReviewAdapter(
        readiness as never,
        review as never,
        fixedMaterial as never,
      ).revalidateNewActivationInTransaction(harness.input),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'CURRENT_REVIEW_INVALID',
    });
  });

  it.each([
    [
      'full selected pool fingerprint',
      { ...senderPool, senderPoolFingerprint: 'f'.repeat(64) },
    ],
    [
      'serialization revision',
      { ...senderPool, serializationRevision: 'CAMPAIGN_SENDER_POOL_V3' },
    ],
    [
      'rotation policy',
      { ...senderPool, rotationPolicyId: 'DIFFERENT_ROTATION_POLICY' },
    ],
    [
      'READY sender authority',
      {
        ...senderPool,
        mailboxes: [{ ...mailbox, senderHandle: 'changed@example.com' }],
      },
    ],
  ])('fences a stale %s before audience SQL', async (_label, currentPool) => {
    const harness = makeInput([]);
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockResolvedValue(currentPool),
    };

    const review = audienceReview();
    await expect(
      new CampaignNewActivationReviewAdapter(
        readiness as never,
        review as never,
        fixedMaterial as never,
      ).revalidateNewActivationInTransaction(harness.input),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'CURRENT_REVIEW_INVALID',
    });
    expect(review.reviewInTransaction).not.toHaveBeenCalled();
  });

  it('fails closed before audience SQL for Instagram or stale proof identity', async () => {
    const harness = makeInput([]);
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockResolvedValue(senderPool),
    };
    const review = audienceReview();
    const adapter = new CampaignNewActivationReviewAdapter(
      readiness as never,
      review as never,
      fixedMaterial as never,
    );
    harness.input.plan.nodes[0].channel = 'INSTAGRAM';

    await expect(
      adapter.revalidateNewActivationInTransaction(harness.input),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'CURRENT_REVIEW_INVALID' });
    expect(
      readiness.getCampaignEmailSenderPoolInTransaction,
    ).not.toHaveBeenCalled();
    expect(review.reviewInTransaction).not.toHaveBeenCalled();
  });
});
