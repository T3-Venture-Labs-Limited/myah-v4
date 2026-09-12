import { CampaignSenderMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-sender-material.adapter';

const coordinates = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  campaignId: '22222222-2222-4222-8222-222222222222',
  campaignCreatorId: '33333333-3333-4333-8333-333333333333',
  workflowVersionId: '44444444-4444-4444-8444-444444444444',
  messageId: '55555555-5555-4555-8555-555555555555',
};
const accountId = '66666666-6666-4666-8666-666666666666';
const channelId = '77777777-7777-4777-8777-777777777777';

const activeManager = () => {
  const manager = { queryRunner: undefined as unknown };
  manager.queryRunner = {
    isTransactionActive: true,
    isReleased: false,
    manager,
  };
  return manager;
};

const context = (manager = activeManager()) => ({
  kind: 'DISPATCH',
  authContext: { type: 'system', workspace: { id: coordinates.workspaceId } },
  transactionManager: manager,
  renderContext: {
    ...coordinates,
    kind: 'CAMPAIGN_SEQUENCE_RENDER',
    authorizationId: 'authorization',
    enrollmentId: 'enrollment',
    occurrenceId: 'occurrence',
    initiatorUserWorkspaceId: 'initiator',
    authorityFingerprint: 'authority',
    senderPoolFingerprint: 'pool',
    fixedMaterialFingerprint: 'fixed',
    connectedAccountId: accountId,
    messageChannelId: channelId,
    senderHandle: 'sender@example.com',
    replyEvidenceId: null,
  },
  senderBinding: {
    connectedAccountId: accountId,
    messageChannelId: channelId,
    senderHandle: 'sender@example.com',
    provider: 'google',
    senderPoolFingerprint: 'pool',
  },
  replyEvidence: { kind: 'NEW_THREAD' },
  fixedMaterialProof: {
    fixedMaterialFingerprint: 'fixed',
    signatureDigest: null,
    orderedAttachmentProofs: [],
  },
});

const readyMailbox = {
  campaignAccountId: 'campaign-account',
  connectedAccountId: accountId,
  messageChannelId: channelId,
  recoveryPath: null,
  bindingStatus: 'RESOLVED_BINDING',
  senderHandle: 'sender@example.com',
  provider: 'google',
  dailySendLimit: 100,
  minimumSendIntervalMs: 1000,
  status: 'READY',
  reason: null,
  missingBinding: null,
};
const blockedMailbox = {
  ...readyMailbox,
  campaignAccountId: 'blocked-campaign-account',
  connectedAccountId: '88888888-8888-4888-8888-888888888888',
  messageChannelId: '99999999-9999-4999-8999-999999999999',
  status: 'BLOCKED',
  reason: 'CAPACITY_UNAVAILABLE',
};

const setup = (
  pool = {
    senderPoolFingerprint: 'pool',
    serializationRevision: 'campaign-sender-pool/v1',
    rotationPolicyId: 'campaign-email-rotation/v1',
    mailboxes: [blockedMailbox, readyMailbox],
  },
) => {
  const readiness = {
    getCampaignEmailSenderPoolInTransaction: jest.fn().mockResolvedValue(pool),
  };
  return {
    adapter: new CampaignSenderMaterialAdapter(readiness as never),
    readiness,
  };
};

describe('CampaignSenderMaterialAdapter', () => {
  it('preserves deterministic pool ordering/material and the already selected ROTATE binding', async () => {
    const manager = activeManager();
    const { adapter, readiness } = setup();

    await expect(
      adapter.load({ coordinates, context: context(manager) } as never),
    ).resolves.toEqual({
      kind: 'READY',
      value: {
        connectedAccountId: accountId,
        messageChannelId: channelId,
        handle: 'sender@example.com',
        provider: 'google',
        senderPoolFingerprint: 'pool',
        authorizedEmailSenderPool: [
          { ...blockedMailbox, reason: 'ACCOUNT_NOT_READY' },
          readyMailbox,
        ],
        projectedSlotAt: null,
        isPreviewProjection: false,
      },
    });
    expect(
      readiness.getCampaignEmailSenderPoolInTransaction,
    ).toHaveBeenCalledWith(
      {
        workspaceId: coordinates.workspaceId,
        campaignId: coordinates.campaignId,
      },
      manager,
    );
  });

  it.each([
    [{ isTransactionActive: false }, 'SENDER_PROJECTION_STALE'],
    [{ isReleased: true }, 'SENDER_PROJECTION_STALE'],
  ])(
    'requires exact active manager ownership %#',
    async (runnerOverride, code) => {
      const manager = activeManager();
      Object.assign(manager.queryRunner as object, runnerOverride);
      const { adapter, readiness } = setup();
      await expect(
        adapter.load({ coordinates, context: context(manager) } as never),
      ).resolves.toMatchObject({ kind: 'BLOCKED', blockers: [{ code }] });
      expect(
        readiness.getCampaignEmailSenderPoolInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    'workspaceId',
    'campaignId',
    'campaignCreatorId',
    'workflowVersionId',
    'messageId',
  ] as const)(
    'rejects cross-scope render %s before readiness reads',
    async (field) => {
      const value = context();
      value.renderContext[field] = 'cross-scope';
      const { adapter, readiness } = setup();
      await expect(
        adapter.load({ coordinates, context: value } as never),
      ).resolves.toMatchObject({
        kind: 'BLOCKED',
        blockers: [{ code: 'SENDER_PROJECTION_STALE' }],
      });
      expect(
        readiness.getCampaignEmailSenderPoolInTransaction,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ senderPoolFingerprint: 'changed' }, 'SENDER_POOL_STALE'],
    [{ mailboxes: [blockedMailbox] }, 'SENDER_NOT_READY'],
    [
      { mailboxes: [{ ...readyMailbox, provider: 'microsoft' }] },
      'SENDER_NOT_READY',
    ],
    [
      { mailboxes: [{ ...readyMailbox, senderHandle: 'other@example.com' }] },
      'SENDER_NOT_READY',
    ],
  ])('fails closed for malformed/stale pool %#', async (override, code) => {
    const base = {
      senderPoolFingerprint: 'pool',
      serializationRevision: 'campaign-sender-pool/v1',
      rotationPolicyId: 'campaign-email-rotation/v1',
      mailboxes: [readyMailbox],
      ...override,
    };
    const { adapter } = setup(base as never);
    await expect(
      adapter.load({ coordinates, context: context() } as never),
    ).resolves.toMatchObject({ kind: 'BLOCKED', blockers: [{ code }] });
  });

  it('propagates transaction/readiness failure so the owner can roll back', async () => {
    const failure = new Error('rollback');
    const readiness = {
      getCampaignEmailSenderPoolInTransaction: jest
        .fn()
        .mockRejectedValue(failure),
    };
    const adapter = new CampaignSenderMaterialAdapter(readiness as never);
    await expect(
      adapter.load({ coordinates, context: context() } as never),
    ).rejects.toBe(failure);
  });
});
