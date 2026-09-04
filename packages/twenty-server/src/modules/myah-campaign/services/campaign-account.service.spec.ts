import {
  ConnectedAccountProvider,
  MessageChannelSyncStatus,
  MessageChannelType,
} from 'twenty-shared/types';

import { IsNull } from 'typeorm';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';

const workspaceId = 'workspace-1';
const otherWorkspaceId = 'workspace-2';
const campaignId = '11111111-1111-4111-8111-111111111111';
const secondCampaignId = '22222222-2222-4222-8222-222222222222';
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

type Row = Record<string, unknown> & { id: string; deletedAt?: string };
type Repository = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  manager?: { transaction: jest.Mock };
};

const matches = (row: Row, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) =>
    value &&
    typeof value === 'object' &&
    '_type' in value &&
    value._type === 'isNull'
      ? row[key] == null
      : row[key] === value,
  );

const createRepository = (rows: Row[]): Repository => ({
  find: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
    rows.filter((row) => !row.deletedAt && (!where || matches(row, where))),
  ),
  findOne: jest.fn(
    async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => !row.deletedAt && matches(row, where)) ?? null,
  ),
  create: jest.fn((input: Row) => ({
    ...input,
    id: `campaign-account-${rows.length + 1}`,
  })),
  save: jest.fn(async (row: Row) => {
    rows.push(row);
    return row;
  }),
  update: jest.fn(
    async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      const affected = rows.filter((row) => matches(row, where));
      affected.forEach((row) => Object.assign(row, patch));
      return { affected: affected.length };
    },
  ),
  softDelete: jest.fn(async (where: Record<string, unknown>) => {
    const affected = rows.filter((row) => matches(row, where));
    affected.forEach((row) => {
      row.deletedAt = 'deleted';
    });
    return { affected: affected.length };
  }),
});

const connectedAccount = (overrides: Partial<Row> = {}): Row => ({
  id: accountId,
  workspaceId,
  provider: ConnectedAccountProvider.GOOGLE,
  handle: 'hello@brand.test',
  name: 'Brand sender',
  archivedAt: null,
  authFailedAt: null,
  visibility: 'workspace',
  accessToken: 'secret-token',
  refreshToken: 'secret-refresh-token',
  ...overrides,
});
const messageChannel = (overrides: Partial<Row> = {}): Row => ({
  id: channelId,
  workspaceId,
  connectedAccountId: accountId,
  type: MessageChannelType.EMAIL,
  handle: 'hello@brand.test',
  isSyncEnabled: true,
  syncStatus: MessageChannelSyncStatus.ACTIVE,
  ...overrides,
});

const createHarness = (
  seed: {
    campaignAccounts?: Row[];
    connectedAccounts?: Row[];
    messageChannels?: Row[];
    campaigns?: Row[];
  } = {},
) => {
  const rows = {
    campaign: [
      { id: campaignId },
      { id: secondCampaignId },
      ...(seed.campaigns ?? []),
    ],
    campaignAccount: seed.campaignAccounts ?? [],
    connectedAccount: seed.connectedAccounts ?? [connectedAccount()],
    messageChannel: seed.messageChannels ?? [messageChannel()],
  };
  const workspaceRepositories = {
    campaign: createRepository(rows.campaign),
    campaignAccount: createRepository(rows.campaignAccount),
  };
  const coreRepositories = {
    connectedAccount: createRepository(rows.connectedAccount),
    messageChannel: createRepository(rows.messageChannel),
  };
  const transactionManager = { query: jest.fn().mockResolvedValue(undefined) };
  const orm = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      withWorkspaceContext(workspaceContext, callback),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
      transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
        callback(transactionManager),
      ),
    }),
    getRepository: jest.fn(
      async (_id: string, name: string) =>
        workspaceRepositories[name as keyof typeof workspaceRepositories],
    ),
  } as unknown as GlobalWorkspaceOrmManager;
  const messageOutboundService = {
    assertConnectedAccountSendable: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CampaignAccountService(
    orm,
    coreRepositories.connectedAccount as never,
    coreRepositories.messageChannel as never,
    messageOutboundService as never,
  );
  return {
    service,
    rows,
    workspaceRepositories,
    coreRepositories,
    transactionManager,
    messageOutboundService,
    orm,
  };
};

describe('CampaignAccountService', () => {
  it('links a supported exact email account as default without exposing secrets', async () => {
    const harness = createHarness();

    const accounts = await harness.service.link(
      { campaignId, connectedAccountId: accountId },
      authContext,
    );

    expect(accounts).toEqual([
      {
        id: 'campaign-account-1',
        connectedAccountId: accountId,
        messageChannelId: channelId,
        provider: ConnectedAccountProvider.GOOGLE,
        senderEmail: 'hello@brand.test',
        label: 'Brand sender',
        isDefault: true,
        health: 'AVAILABLE',
      },
    ]);
    expect(JSON.stringify(accounts)).not.toContain('secret-token');
    expect(harness.transactionManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`campaign-account:${workspaceId}:${campaignId}`],
    );
  });

  it('rejects foreign, archived, unsupported, ambiguous, invalid-address, and duplicate account links', async () => {
    const scenarios: Array<{ account: Row; channels?: Row[] }> = [
      { account: connectedAccount({ workspaceId: otherWorkspaceId }) },
      { account: connectedAccount({ archivedAt: new Date() }) },
      {
        account: connectedAccount({
          provider: ConnectedAccountProvider.EMAIL_GROUP,
        }),
      },
      {
        account: connectedAccount(),
        channels: [messageChannel(), messageChannel({ id: secondChannelId })],
      },
      { account: connectedAccount({ handle: 'not-an-email' }) },
    ];
    for (const scenario of scenarios) {
      const harness = createHarness({
        connectedAccounts: [scenario.account],
        messageChannels: scenario.channels ?? [messageChannel()],
      });
      await expect(
        harness.service.link(
          { campaignId, connectedAccountId: accountId },
          authContext,
        ),
      ).rejects.toThrow();
    }
    const duplicate = createHarness({
      campaignAccounts: [
        {
          id: 'linked',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
      ],
    });
    await expect(
      duplicate.service.link(
        { campaignId, connectedAccountId: accountId },
        authContext,
      ),
    ).rejects.toThrow('already linked');
  });

  it('retains connecting and unhealthy links, but returns unavailable candidates disabled by health', async () => {
    const harness = createHarness({
      campaignAccounts: [
        {
          id: 'linked',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
      ],
      connectedAccounts: [
        connectedAccount(),
        connectedAccount({ id: secondAccountId, handle: 'team@brand.test' }),
      ],
      messageChannels: [
        messageChannel({ isSyncEnabled: false }),
        messageChannel({
          id: secondChannelId,
          connectedAccountId: secondAccountId,
          handle: 'team@brand.test',
          syncStatus: MessageChannelSyncStatus.FAILED_UNKNOWN,
        }),
      ],
    });

    await expect(
      harness.service.list(campaignId, authContext),
    ).resolves.toMatchObject([{ id: 'linked', health: 'UNAVAILABLE' }]);
    await expect(
      harness.service.candidates(campaignId, authContext),
    ).resolves.toEqual([
      expect.objectContaining({
        connectedAccountId: secondAccountId,
        health: 'RECONNECT_REQUIRED',
        isDefault: false,
      }),
    ]);
  });

  it('preserves the first default, serializes replacement, and does not promote after default removal', async () => {
    const harness = createHarness({
      campaignAccounts: [
        {
          id: 'first',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
        {
          id: 'second',
          campaignId,
          connectedAccountId: secondAccountId,
          messageChannelId: secondChannelId,
          channel: 'EMAIL',
          isDefault: false,
        },
      ],
      connectedAccounts: [
        connectedAccount(),
        connectedAccount({ id: secondAccountId, handle: 'team@brand.test' }),
      ],
      messageChannels: [
        messageChannel(),
        messageChannel({
          id: secondChannelId,
          connectedAccountId: secondAccountId,
          handle: 'team@brand.test',
        }),
      ],
    });

    await harness.service.setDefault(
      { campaignId, campaignAccountId: 'second' },
      authContext,
    );
    expect(
      harness.workspaceRepositories.campaignAccount.update,
    ).toHaveBeenNthCalledWith(
      1,
      { campaignId, channel: 'EMAIL', isDefault: true, deletedAt: IsNull() },
      { isDefault: false },
      undefined,
      expect.anything(),
    );
    expect(
      harness.workspaceRepositories.campaignAccount.update,
    ).toHaveBeenNthCalledWith(
      2,
      { id: 'second', campaignId, channel: 'EMAIL', deletedAt: IsNull() },
      { isDefault: true },
      undefined,
      expect.anything(),
    );
    await harness.service.remove(
      { campaignId, campaignAccountId: 'second' },
      authContext,
    );
    expect(await harness.service.list(campaignId, authContext)).toEqual([
      expect.objectContaining({ id: 'first', isDefault: false }),
    ]);

    await harness.service.link(
      { campaignId, connectedAccountId: secondAccountId },
      authContext,
    );
    expect(await harness.service.list(campaignId, authContext)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'first', isDefault: false }),
        expect.objectContaining({
          connectedAccountId: secondAccountId,
          isDefault: false,
        }),
      ]),
    );
  });

  it('allows every workspace account regardless of visibility for Campaign candidates, links, and defaults', async () => {
    const candidateHarness = createHarness({
      connectedAccounts: [connectedAccount({ visibility: 'user' })],
    });
    await expect(
      candidateHarness.service.candidates(campaignId, authContext),
    ).resolves.toEqual([
      expect.objectContaining({ connectedAccountId: accountId }),
    ]);

    const linkHarness = createHarness({
      connectedAccounts: [connectedAccount({ visibility: 'user' })],
    });
    await expect(
      linkHarness.service.link(
        { campaignId, connectedAccountId: accountId },
        authContext,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        connectedAccountId: accountId,
        isDefault: true,
      }),
    ]);

    const defaultHarness = createHarness({
      campaignAccounts: [
        {
          id: 'default',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
      ],
      connectedAccounts: [connectedAccount({ visibility: 'user' })],
    });
    await expect(
      defaultHarness.service.resolveDefaultEmailAccount(
        campaignId,
        workspaceId,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'default' }));
  });

  it('does not default a newly linked account when an active non-default link exists', async () => {
    const harness = createHarness({
      campaignAccounts: [
        {
          id: 'existing',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: false,
        },
      ],
      connectedAccounts: [
        connectedAccount(),
        connectedAccount({ id: secondAccountId, handle: 'team@brand.test' }),
      ],
      messageChannels: [
        messageChannel(),
        messageChannel({
          id: secondChannelId,
          connectedAccountId: secondAccountId,
          handle: 'team@brand.test',
        }),
      ],
    });

    await harness.service.link(
      { campaignId, connectedAccountId: secondAccountId },
      authContext,
    );

    expect(
      harness.workspaceRepositories.campaignAccount.findOne,
    ).toHaveBeenNthCalledWith(
      2,
      {
        where: {
          campaignId,
          channel: 'EMAIL',
          deletedAt: IsNull(),
        },
      },
      expect.anything(),
    );
    expect(harness.rows.campaignAccount).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'existing', isDefault: false }),
        expect.objectContaining({
          connectedAccountId: secondAccountId,
          isDefault: false,
        }),
      ]),
    );
  });

  it('fails closed without a single active linked default and requires transport sendability', async () => {
    const harness = createHarness({
      campaignAccounts: [
        {
          id: 'default',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
      ],
    });
    await expect(
      harness.service.resolveDefaultEmailAccount(campaignId, workspaceId),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'default', health: 'AVAILABLE' }),
    );
    expect(
      harness.messageOutboundService.assertConnectedAccountSendable,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: accountId }));

    const noDefault = createHarness({ campaignAccounts: [] });
    await expect(
      noDefault.service.resolveDefaultEmailAccount(campaignId, workspaceId),
    ).rejects.toThrow();
    const unavailableChannel = createHarness({
      campaignAccounts: [
        {
          id: 'default',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
      ],
      messageChannels: [messageChannel({ isSyncEnabled: false })],
    });
    await expect(
      unavailableChannel.service.resolveDefaultEmailAccount(
        campaignId,
        workspaceId,
      ),
    ).rejects.toThrow();

    const authFailed = createHarness({
      campaignAccounts: [
        {
          id: 'default',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
      ],
      connectedAccounts: [connectedAccount({ authFailedAt: new Date() })],
    });
    await expect(
      authFailed.service.resolveDefaultEmailAccount(campaignId, workspaceId),
    ).rejects.toThrow('unavailable');
    expect(
      authFailed.messageOutboundService.assertConnectedAccountSendable,
    ).not.toHaveBeenCalled();

    const transportRejected = createHarness({
      campaignAccounts: [
        {
          id: 'default',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
      ],
    });
    transportRejected.messageOutboundService.assertConnectedAccountSendable.mockRejectedValueOnce(
      new Error('Transport sendability rejected'),
    );
    await expect(
      transportRejected.service.resolveDefaultEmailAccount(
        campaignId,
        workspaceId,
      ),
    ).rejects.toThrow('Transport sendability rejected');
  });

  it('does not clear the active default when a stale request selects a removed account', async () => {
    const harness = createHarness({
      campaignAccounts: [
        {
          id: 'active',
          campaignId,
          connectedAccountId: accountId,
          messageChannelId: channelId,
          channel: 'EMAIL',
          isDefault: true,
        },
        {
          id: 'removed',
          campaignId,
          connectedAccountId: secondAccountId,
          messageChannelId: secondChannelId,
          channel: 'EMAIL',
          isDefault: false,
          deletedAt: 'deleted',
        },
      ],
    });

    await expect(
      harness.service.setDefault(
        { campaignId, campaignAccountId: 'removed' },
        authContext,
      ),
    ).rejects.toThrow('not found');
    expect(harness.rows.campaignAccount).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'active', isDefault: true }),
        expect.objectContaining({ id: 'removed', isDefault: false }),
      ]),
    );
    await expect(
      harness.service.remove(
        { campaignId, campaignAccountId: 'removed' },
        authContext,
      ),
    ).rejects.toThrow('not found');
  });

  it('does not cross workspace boundaries', async () => {
    const harness = createHarness({
      connectedAccounts: [connectedAccount({ workspaceId: otherWorkspaceId })],
    });
    await expect(
      harness.service.candidates(campaignId, authContext),
    ).resolves.toEqual([]);
    await expect(
      harness.service.link(
        { campaignId, connectedAccountId: accountId },
        authContext,
      ),
    ).rejects.toThrow();
  });
});
