import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
} from 'twenty-shared/types';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import {
  CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
  CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
  type CampaignSenderReadiness,
  type ReadyCampaignSenderReadiness,
  computeCampaignSenderPoolFingerprint,
  serializeCampaignSenderPool,
} from 'src/modules/myah-campaign/types/campaign-sender-pool.type';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';

const workspaceId = '11111111-1111-4111-8111-111111111110';
const campaignId = '11111111-1111-4111-8111-111111111111';
const accountId = '33333333-3333-4333-8333-333333333333';
const secondAccountId = '44444444-4444-4444-8444-444444444444';
const channelId = '55555555-5555-4555-8555-555555555555';
const secondChannelId = '66666666-6666-4666-8666-666666666666';
const authContext = {
  type: 'system',
  workspace: { id: workspaceId },
} as never;
const workspaceContext = {
  authContext,
  userWorkspaceRoleMap: {},
  apiKeyRoleMap: {},
} as unknown as ORMWorkspaceContext;

const readyRow = (overrides: Record<string, unknown> = {}) => ({
  campaignAccountId: 'campaign-account-1',
  connectedAccountId: accountId,
  messageChannelId: channelId,
  accountWorkspaceId: workspaceId,
  channelWorkspaceId: workspaceId,
  accountHandle: ' Sender@Brand.Test ',
  channelHandle: ' Sender@Brand.Test ',
  provider: ConnectedAccountProvider.GOOGLE,
  archivedAt: null,
  authFailedAt: null,
  scopes: ['https://www.googleapis.com/auth/gmail.send'],
  dailySendLimit: 50,
  minimumSendIntervalMs: 300_000,
  isSyncEnabled: true,
  syncStatus: MessageChannelSyncStatus.ACTIVE,
  isManaged: false,
  ...overrides,
});

const createHarness = (rows = [readyRow()]) => {
  const query = jest.fn().mockResolvedValue(rows);
  const manager = { queryRunner: { query } };
  const campaignRepository = {
    findOne: jest.fn().mockResolvedValue({ id: campaignId }),
  };
  const transaction = jest.fn(
    async (callback: (transactionManager: unknown) => unknown) =>
      callback(manager),
  );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      withWorkspaceContext(workspaceContext, callback),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ transaction }),
    getRepository: jest.fn().mockResolvedValue(campaignRepository),
  } as unknown as GlobalWorkspaceOrmManager;
  return {
    service: new CampaignSenderReadinessService(orm),
    manager,
    query,
    campaignRepository,
    transaction,
  };
};

describe('CampaignSenderReadinessService', () => {
  it('compares core UUID bindings to workspace text identifiers without casting untrusted text', async () => {
    const harness = createHarness();

    await harness.service.getCampaignEmailSenderPoolInTransaction(
      { workspaceId, campaignId },
      harness.manager as never,
    );

    const sql = harness.query.mock.calls[0]?.[0] as string;

    expect(sql).toContain('account.id::text = ca."connectedAccountId"');
    expect(sql).toContain('channel.id::text = ca."messageChannelId"');
    expect(sql).toContain(
      'managed."connectedAccountId"::text = ca."connectedAccountId"',
    );
    expect(sql).toContain(
      'managed."messageChannelId"::text = ca."messageChannelId"',
    );
    expect(sql).not.toContain('ca."connectedAccountId"::uuid');
    expect(sql).not.toContain('ca."messageChannelId"::uuid');
  });

  it('builds an order-stable, secret-free canonical fingerprint over exact static bindings', async () => {
    const first = createHarness([
      readyRow({
        campaignAccountId: 'campaign-account-2',
        connectedAccountId: secondAccountId,
        messageChannelId: secondChannelId,
        accountHandle: 'Team@Brand.Test',
        channelHandle: 'Team@Brand.Test',
        provider: ConnectedAccountProvider.MICROSOFT,
        scopes: ['Mail.Send'],
        dailySendLimit: 75,
        minimumSendIntervalMs: 120_000,
        accessToken: 'must-not-leak',
      }),
      readyRow(),
    ]);
    const second = createHarness([
      readyRow(),
      readyRow({
        campaignAccountId: 'campaign-account-2',
        connectedAccountId: secondAccountId,
        messageChannelId: secondChannelId,
        accountHandle: 'Team@Brand.Test',
        channelHandle: 'Team@Brand.Test',
        provider: ConnectedAccountProvider.MICROSOFT,
        scopes: ['Mail.Send'],
        dailySendLimit: 75,
        minimumSendIntervalMs: 120_000,
      }),
    ]);

    const left = await first.service.getCampaignEmailSenderPoolInTransaction(
      { workspaceId, campaignId },
      first.manager as never,
    );
    const right = await second.service.getCampaignEmailSenderPoolInTransaction(
      { workspaceId, campaignId },
      second.manager as never,
    );

    expect(left.rotationPolicyId).toBe(CAMPAIGN_EMAIL_ROTATION_POLICY_ID);
    expect(left.serializationRevision).toBe(
      CAMPAIGN_SENDER_POOL_SERIALIZATION_REVISION,
    );
    expect(left.senderPoolFingerprint).toBe(right.senderPoolFingerprint);
    expect(
      left.mailboxes.map(
        (mailbox: { connectedAccountId: string }) => mailbox.connectedAccountId,
      ),
    ).toEqual([accountId, secondAccountId]);
    expect(left.mailboxes[0]).toMatchObject({
      bindingStatus: 'RESOLVED_BINDING',
      missingBinding: null,
      senderHandle: 'sender@brand.test',
      status: 'READY',
      reason: null,
      recoveryPath: null,
      dailySendLimit: 50,
      minimumSendIntervalMs: 300_000,
    });
    expect(JSON.stringify(left)).not.toContain('must-not-leak');
    const firstMailbox = left.mailboxes[0];
    if (firstMailbox.bindingStatus !== 'RESOLVED_BINDING')
      throw new Error('Expected resolved first mailbox');

    expect(
      computeCampaignSenderPoolFingerprint(left.mailboxes, {
        rotationPolicyId: 'ROTATION_POLICY_V2',
      }),
    ).not.toBe(left.senderPoolFingerprint);
    expect(
      computeCampaignSenderPoolFingerprint(left.mailboxes, {
        serializationRevision: 'CAMPAIGN_SENDER_POOL_V3',
      }),
    ).not.toBe(left.senderPoolFingerprint);
    expect(
      computeCampaignSenderPoolFingerprint([
        { ...firstMailbox, messageChannelId: secondChannelId },
        left.mailboxes[1],
      ]),
    ).not.toBe(left.senderPoolFingerprint);
    expect(
      computeCampaignSenderPoolFingerprint([
        { ...firstMailbox, dailySendLimit: 51 },
        left.mailboxes[1],
      ]),
    ).not.toBe(left.senderPoolFingerprint);
  });

  it.each([
    [{ authFailedAt: new Date() }, 'AUTH_EXPIRED'],
    [{ scopes: [] }, 'MISSING_PERMISSION'],
    [
      { syncStatus: MessageChannelSyncStatus.FAILED_INSUFFICIENT_PERMISSIONS },
      'MISSING_PERMISSION',
    ],
    [{ isSyncEnabled: false }, 'SYNC_DISABLED'],
    [{ archivedAt: new Date() }, 'ACCOUNT_UNAVAILABLE'],
    [
      { syncStatus: MessageChannelSyncStatus.FAILED_UNKNOWN },
      'ACCOUNT_UNAVAILABLE',
    ],
    [{ isManaged: true }, 'UNAUTHORIZED'],
    [{ accountWorkspaceId: 'other-workspace' }, 'WRONG_WORKSPACE'],
    [{ channelWorkspaceId: 'other-workspace' }, 'WRONG_WORKSPACE'],
  ])(
    'maps current account/channel state to stable reason %s',
    async (patch, reason) => {
      const harness = createHarness([readyRow(patch)]);

      const snapshot =
        await harness.service.getCampaignEmailSenderPoolInTransaction(
          { workspaceId, campaignId },
          harness.manager as never,
        );

      expect(snapshot.mailboxes[0]).toMatchObject({
        status: 'BLOCKED',
        reason,
        recoveryPath: null,
      });
    },
  );

  it.each([
    [{ scopes: [] }, 'MISSING_PERMISSION'],
    [{ isManaged: true }, 'UNAUTHORIZED'],
  ] as const)(
    'uses the selected-pool evaluator for unselected candidate reason %s',
    async (patch, expectedReason) => {
      const row = readyRow(patch);
      const harness = createHarness([row]);
      const selected =
        await harness.service.getCampaignEmailSenderPoolInTransaction(
          { workspaceId, campaignId },
          harness.manager as never,
        );
      const candidate = harness.service.evaluateCandidateSenderReadiness({
        ...row,
        workspaceId,
      });

      expect(candidate).toEqual({
        rotationPolicyId: CAMPAIGN_EMAIL_ROTATION_POLICY_ID,
        connectedAccountId: accountId,
        messageChannelId: channelId,
        senderHandle: 'sender@brand.test',
        status: 'BLOCKED',
        reason: expectedReason,
      });
      expect(candidate.reason).toBe(selected.mailboxes[0].reason);
      expect(JSON.stringify(candidate)).not.toContain('campaignAccountId');
    },
  );

  it.each([
    [
      {
        accountWorkspaceId: null,
        accountHandle: null,
        provider: null,
        dailySendLimit: null,
        minimumSendIntervalMs: null,
      },
      'CONNECTED_ACCOUNT',
    ],
    [
      {
        channelWorkspaceId: null,
        channelConnectedAccountId: null,
        channelHandle: null,
        isSyncEnabled: null,
        syncStatus: null,
      },
      'MESSAGE_CHANNEL',
    ],
    [
      {
        accountWorkspaceId: null,
        accountHandle: null,
        provider: null,
        dailySendLimit: null,
        minimumSendIntervalMs: null,
        channelWorkspaceId: null,
        channelConnectedAccountId: null,
        channelHandle: null,
        isSyncEnabled: null,
        syncStatus: null,
      },
      'BOTH',
    ],
  ] as const)(
    'retains a selected missing core binding as an explicit %s tombstone',
    async (patch, missingBinding) => {
      const harness = createHarness([readyRow(patch)]);
      const snapshot =
        await harness.service.getCampaignEmailSenderPoolInTransaction(
          { workspaceId, campaignId },
          harness.manager as never,
        );

      expect(snapshot.mailboxes).toEqual([
        {
          bindingStatus: 'MISSING_CORE_BINDING',
          campaignAccountId: 'campaign-account-1',
          connectedAccountId: accountId,
          messageChannelId: channelId,
          senderHandle: null,
          provider: null,
          dailySendLimit: null,
          minimumSendIntervalMs: null,
          status: 'BLOCKED',
          reason: 'ACCOUNT_UNAVAILABLE',
          recoveryPath: null,
          missingBinding,
        },
      ]);
      await expect(
        harness.service.resolveExactCampaignEmailSenderInTransaction(
          {
            workspaceId,
            campaignId,
            connectedAccountId: accountId,
            expectedSenderPoolFingerprint: snapshot.senderPoolFingerprint,
          },
          harness.manager as never,
        ),
      ).resolves.toEqual({
        status: 'BLOCKED',
        reason: 'ACCOUNT_UNAVAILABLE',
      });
    },
  );

  it('uses the fixed mixed V2 canonical JSON envelope and SHA-256 fixture', () => {
    const mixed: CampaignSenderReadiness[] = [
      {
        bindingStatus: 'MISSING_CORE_BINDING',
        campaignAccountId: 'campaign-account-2',
        connectedAccountId: secondAccountId,
        messageChannelId: secondChannelId,
        senderHandle: null,
        provider: null,
        dailySendLimit: null,
        minimumSendIntervalMs: null,
        status: 'BLOCKED',
        reason: 'ACCOUNT_UNAVAILABLE',
        recoveryPath: null,
        missingBinding: 'MESSAGE_CHANNEL',
      },
      {
        bindingStatus: 'RESOLVED_BINDING',
        campaignAccountId: 'campaign-account-1',
        connectedAccountId: accountId,
        messageChannelId: channelId,
        senderHandle: 'sender@brand.test',
        provider: ConnectedAccountProvider.GOOGLE,
        dailySendLimit: 50,
        minimumSendIntervalMs: 300_000,
        status: 'READY',
        reason: null,
        recoveryPath: null,
        missingBinding: null,
      },
    ];
    const canonicalJson =
      '{"serializationRevision":"CAMPAIGN_SENDER_POOL_V2","rotationPolicyId":"EARLIEST_ELIGIBLE_LOWEST_DAILY_USAGE_STABLE_ACCOUNT_V1","bindings":[{"tag":"RESOLVED_BINDING","campaignAccountId":"campaign-account-1","connectedAccountId":"33333333-3333-4333-8333-333333333333","messageChannelId":"55555555-5555-4555-8555-555555555555","normalizedSenderHandle":"sender@brand.test","provider":"google","dailySendLimit":50,"minimumSendIntervalMs":300000},{"tag":"MISSING_CORE_BINDING","campaignAccountId":"campaign-account-2","connectedAccountId":"44444444-4444-4444-8444-444444444444","messageChannelId":"66666666-6666-4666-8666-666666666666","missingBinding":"MESSAGE_CHANNEL"}]}';

    expect(serializeCampaignSenderPool(mixed)).toBe(canonicalJson);
    expect(computeCampaignSenderPoolFingerprint(mixed)).toBe(
      'd0c100f634c54c80a82f5fca6bd278402817280cce8e8523f5cbf8bab81dde85',
    );
    expect(canonicalJson.match(/CAMPAIGN_SENDER_POOL_V2/g)).toHaveLength(1);
    expect(
      canonicalJson.match(
        /EARLIEST_ELIGIBLE_LOWEST_DAILY_USAGE_STABLE_ACCOUNT_V1/g,
      ),
    ).toHaveLength(1);
  });

  it('changes each immediately preceding fingerprint across deletion, partial restoration, full restoration, and selection removal', async () => {
    const rows = [readyRow()];
    const harness = createHarness(rows);
    const fingerprint = async () =>
      (
        await harness.service.getCampaignEmailSenderPoolInTransaction(
          { workspaceId, campaignId },
          harness.manager as never,
        )
      ).senderPoolFingerprint;

    const resolved = await fingerprint();
    Object.assign(rows[0], {
      accountWorkspaceId: null,
      accountHandle: null,
      provider: null,
      dailySendLimit: null,
      minimumSendIntervalMs: null,
    });
    const accountDeleted = await fingerprint();
    expect(accountDeleted).not.toBe(resolved);

    Object.assign(rows[0], readyRow(), {
      channelWorkspaceId: null,
      channelConnectedAccountId: null,
      channelHandle: null,
      isSyncEnabled: null,
      syncStatus: null,
    });
    const accountRestored = await fingerprint();
    expect(accountRestored).not.toBe(accountDeleted);

    Object.assign(rows[0], readyRow());
    const fullyRestored = await fingerprint();
    expect(fullyRestored).not.toBe(accountRestored);
    expect(fullyRestored).toBe(resolved);

    Object.assign(rows[0], {
      accountWorkspaceId: null,
      accountHandle: null,
      provider: null,
      dailySendLimit: null,
      minimumSendIntervalMs: null,
      channelWorkspaceId: null,
      channelConnectedAccountId: null,
      channelHandle: null,
      isSyncEnabled: null,
      syncStatus: null,
    });
    const bothDeleted = await fingerprint();
    expect(bothDeleted).not.toBe(fullyRestored);

    harness.query.mockResolvedValueOnce([]);
    const removed = await fingerprint();
    expect(removed).not.toBe(bothDeleted);
  });

  it('makes tombstones structurally ineligible for exact-resolution READY', () => {
    const tombstone: CampaignSenderReadiness = {
      bindingStatus: 'MISSING_CORE_BINDING',
      campaignAccountId: 'campaign-account-1',
      connectedAccountId: accountId,
      messageChannelId: channelId,
      senderHandle: null,
      provider: null,
      dailySendLimit: null,
      minimumSendIntervalMs: null,
      status: 'BLOCKED',
      reason: 'ACCOUNT_UNAVAILABLE',
      recoveryPath: null,
      missingBinding: 'BOTH',
    };
    const acceptExactReady = (_sender: ReadyCampaignSenderReadiness) => true;
    const compileTimeFence = () => {
      // @ts-expect-error A missing core binding must never inhabit exact READY.
      return acceptExactReady(tombstone);
    };

    expect(compileTimeFence).toBeInstanceOf(Function);
  });

  it('rejects stale fingerprints before exact lookup and never substitutes another sender', async () => {
    const harness = createHarness([
      readyRow(),
      readyRow({
        campaignAccountId: 'campaign-account-2',
        connectedAccountId: secondAccountId,
        messageChannelId: secondChannelId,
        accountHandle: 'team@brand.test',
        channelHandle: 'team@brand.test',
      }),
    ]);
    const snapshot =
      await harness.service.getCampaignEmailSenderPoolInTransaction(
        { workspaceId, campaignId },
        harness.manager as never,
      );

    await expect(
      harness.service.resolveExactCampaignEmailSenderInTransaction(
        {
          workspaceId,
          campaignId,
          connectedAccountId: secondAccountId,
          expectedSenderPoolFingerprint: 'stale',
        },
        harness.manager as never,
      ),
    ).resolves.toEqual({ status: 'STALE_POOL' });
    await expect(
      harness.service.resolveExactCampaignEmailSenderInTransaction(
        {
          workspaceId,
          campaignId,
          connectedAccountId: secondAccountId,
          expectedSenderPoolFingerprint: snapshot.senderPoolFingerprint,
        },
        harness.manager as never,
      ),
    ).resolves.toMatchObject({
      status: 'READY',
      sender: { connectedAccountId: secondAccountId },
    });
    await expect(
      harness.service.resolveExactCampaignEmailSenderInTransaction(
        {
          workspaceId,
          campaignId,
          connectedAccountId: '77777777-7777-4777-8777-777777777777',
          expectedSenderPoolFingerprint: snapshot.senderPoolFingerprint,
        },
        harness.manager as never,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', reason: 'ACCOUNT_UNAVAILABLE' });
  });

  it('derives workspace authority from auth context and enforces Campaign read permission', async () => {
    const harness = createHarness();

    await expect(
      harness.service.getCampaignEmailSenderPool({ campaignId }, authContext),
    ).resolves.toMatchObject({
      mailboxes: [{ connectedAccountId: accountId }],
    });
    expect(harness.campaignRepository.findOne).toHaveBeenCalledWith(
      { where: { id: campaignId } },
      harness.manager,
    );
    expect(harness.query).toHaveBeenCalledWith(
      expect.stringContaining('"workspaceId" = $2'),
      [campaignId, workspaceId],
    );

    harness.campaignRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      harness.service.getCampaignEmailSenderPool({ campaignId }, authContext),
    ).rejects.toThrow('Campaign not found');
  });

  it('requires the supplied transaction manager query runner without opening a transaction', async () => {
    const harness = createHarness();

    await expect(
      harness.service.getCampaignEmailSenderPoolInTransaction(
        { workspaceId, campaignId },
        {} as never,
      ),
    ).rejects.toThrow('query runner');
    expect(harness.transaction).not.toHaveBeenCalled();
  });
});
