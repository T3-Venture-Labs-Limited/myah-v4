import { CampaignThreadMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-thread-material.adapter';

const coordinates = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  campaignId: '22222222-2222-4222-8222-222222222222',
  campaignCreatorId: '33333333-3333-4333-8333-333333333333',
  workflowVersionId: '44444444-4444-4444-8444-444444444444',
  messageId: '55555555-5555-4555-8555-555555555555',
};
const evidence = {
  evidenceId: '66666666-6666-4666-8666-666666666666',
  enrollmentId: '77777777-7777-4777-8777-777777777777',
  occurrenceId: '88888888-8888-4888-8888-888888888888',
  priorMessageId: '99999999-9999-4999-8999-999999999999',
  normalizedRecipient: 'recipient@example.com',
  connectedAccountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  messageChannelId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  senderHandle: 'sender@example.com',
  providerMessageId: '<trusted@example.com>',
  providerThreadId: 'trusted-thread',
};
const acceptedRow = {
  attemptId: evidence.evidenceId,
  enrollmentId: evidence.enrollmentId,
  occurrenceId: evidence.occurrenceId,
  messageId: evidence.priorMessageId,
  normalizedRecipient: evidence.normalizedRecipient,
  connectedAccountId: evidence.connectedAccountId,
  messageChannelId: evidence.messageChannelId,
  normalizedSenderHandle: evidence.senderHandle,
  providerHeaderMessageId: evidence.providerMessageId,
  reconciledProviderHeaderMessageId: null,
  resolvedThreadExternalId: evidence.providerThreadId,
  projectedMessageId: 'projected-message',
  projectedMessageThreadId: 'projected-thread',
};

const managerWith = (query: jest.Mock) => {
  const manager = { queryRunner: undefined as unknown };
  manager.queryRunner = {
    isTransactionActive: true,
    isReleased: false,
    manager,
    query,
  };
  return manager;
};
const dispatchContext = (
  manager: ReturnType<typeof managerWith>,
  replyEvidence: object = evidence,
) => ({
  kind: 'DISPATCH',
  authContext: { type: 'system', workspace: { id: coordinates.workspaceId } },
  transactionManager: manager,
  renderContext: {
    ...coordinates,
    kind: 'CAMPAIGN_SEQUENCE_RENDER',
    authorizationId: 'authorization',
    enrollmentId: evidence.enrollmentId,
    occurrenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    initiatorUserWorkspaceId: 'initiator',
    authorityFingerprint: 'authority',
    senderPoolFingerprint: 'pool',
    fixedMaterialFingerprint: 'fixed',
    connectedAccountId: evidence.connectedAccountId,
    messageChannelId: evidence.messageChannelId,
    senderHandle: evidence.senderHandle,
    replyEvidenceId: evidence.evidenceId,
  },
  senderBinding: {
    connectedAccountId: evidence.connectedAccountId,
    messageChannelId: evidence.messageChannelId,
    senderHandle: evidence.senderHandle,
    provider: 'google',
    senderPoolFingerprint: 'pool',
  },
  replyEvidence,
  fixedMaterialProof: {
    fixedMaterialFingerprint: 'fixed',
    signatureDigest: null,
    orderedAttachmentProofs: [],
  },
});
const sender = {
  connectedAccountId: evidence.connectedAccountId,
  messageChannelId: evidence.messageChannelId,
  handle: evidence.senderHandle,
  provider: 'google',
  senderPoolFingerprint: 'pool',
  authorizedEmailSenderPool: [],
  projectedSlotAt: null,
  isPreviewProjection: false,
};
const input = (query = jest.fn().mockResolvedValue([acceptedRow])) => {
  const manager = managerWith(query);
  return {
    query,
    value: {
      coordinates,
      context: dispatchContext(manager),
      replyToThread: true,
      normalizedRecipient: evidence.normalizedRecipient,
      sender,
    },
  };
};

describe('CampaignThreadMaterialAdapter', () => {
  it('returns exact NEW_THREAD without reading any prior evidence', async () => {
    const query = jest.fn();
    const manager = managerWith(query);
    const adapter = new CampaignThreadMaterialAdapter();
    await expect(
      adapter.load({
        ...input(query).value,
        context: dispatchContext(manager, { kind: 'NEW_THREAD' }),
        replyToThread: false,
      } as never),
    ).resolves.toEqual({ kind: 'READY', value: { kind: 'NEW_THREAD' } });
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts exact PINNED_REPLY evidence using original trusted header and same manager', async () => {
    const { query, value } = input();
    const adapter = new CampaignThreadMaterialAdapter();
    await expect(adapter.load(value as never)).resolves.toEqual({
      kind: 'READY',
      value: { kind: 'REPLY', evidence },
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'priorOccurrence."authoredMessageIndex" < currentOccurrence."authoredMessageIndex"',
      ),
      [
        coordinates.workspaceId,
        coordinates.campaignId,
        evidence.evidenceId,
        evidence.enrollmentId,
        coordinates.workflowVersionId,
        value.context.renderContext.occurrenceId,
      ],
    );
  });

  it('accepts a monotonic reconciled header when the original header is absent', async () => {
    const { value } = input(
      jest.fn().mockResolvedValue([
        {
          ...acceptedRow,
          providerHeaderMessageId: null,
          reconciledProviderHeaderMessageId: evidence.providerMessageId,
        },
      ]),
    );
    await expect(
      new CampaignThreadMaterialAdapter().load(value as never),
    ).resolves.toMatchObject({ kind: 'READY' });
  });

  it.each([
    [
      {
        providerHeaderMessageId: null,
        reconciledProviderHeaderMessageId: null,
      },
      'Microsoft missing header',
    ],
    [{ attemptId: 'other' }, 'attempt mismatch'],
    [{ enrollmentId: 'other' }, 'cross enrollment'],
    [{ occurrenceId: 'other' }, 'cross occurrence'],
    [{ messageId: 'other' }, 'prior message mismatch'],
    [{ normalizedRecipient: 'other@example.com' }, 'recipient mismatch'],
    [{ connectedAccountId: 'other' }, 'account mismatch'],
    [{ messageChannelId: 'other' }, 'channel mismatch'],
    [{ normalizedSenderHandle: 'other@example.com' }, 'sender mismatch'],
    [{ resolvedThreadExternalId: '' }, 'blank thread'],
    [{ projectedMessageId: null }, 'legacy unprojected'],
    [{ projectedMessageThreadId: null }, 'legacy thread unprojected'],
  ] as const)('fails closed for %s', async (override, _label) => {
    const { value } = input(
      jest.fn().mockResolvedValue([{ ...acceptedRow, ...override }]),
    );
    await expect(
      new CampaignThreadMaterialAdapter().load(value as never),
    ).resolves.toMatchObject({
      kind: 'BLOCKED',
      blockers: [{ code: 'THREAD_IDENTITY_MISMATCH' }],
    });
  });

  it.each([[[]], [[acceptedRow, acceptedRow]]])(
    'fails closed for missing/ambiguous/legacy state rows',
    async (rows) => {
      const { value } = input(jest.fn().mockResolvedValue(rows));
      await expect(
        new CampaignThreadMaterialAdapter().load(value as never),
      ).resolves.toMatchObject({
        kind: 'BLOCKED',
        blockers: [{ code: 'THREAD_EVIDENCE_AMBIGUOUS' }],
      });
    },
  );

  it.each([
    'workspaceId',
    'campaignId',
    'campaignCreatorId',
    'workflowVersionId',
    'messageId',
  ] as const)('rejects cross-scope context %s before SQL', async (field) => {
    const { query, value } = input();
    value.context.renderContext[field] = 'cross-scope';
    await expect(
      new CampaignThreadMaterialAdapter().load(value as never),
    ).resolves.toMatchObject({
      kind: 'BLOCKED',
      blockers: [{ code: 'THREAD_IDENTITY_MISMATCH' }],
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('requires the exact active manager and performs no ambient read', async () => {
    const { query, value } = input();
    (
      value.context.transactionManager.queryRunner as {
        isTransactionActive: boolean;
      }
    ).isTransactionActive = false;
    await expect(
      new CampaignThreadMaterialAdapter().load(value as never),
    ).resolves.toMatchObject({
      kind: 'BLOCKED',
      blockers: [{ code: 'THREAD_EVIDENCE_MISSING' }],
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('propagates query failure for transaction rollback', async () => {
    const failure = new Error('rollback');
    const { value } = input(jest.fn().mockRejectedValue(failure));
    await expect(
      new CampaignThreadMaterialAdapter().load(value as never),
    ).rejects.toBe(failure);
  });
});
