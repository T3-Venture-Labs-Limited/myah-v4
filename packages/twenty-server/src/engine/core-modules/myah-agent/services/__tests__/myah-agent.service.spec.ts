import { ForbiddenException } from '@nestjs/common';

import { MyahAgentService } from 'src/engine/core-modules/myah-agent/services/myah-agent.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const CAMPAIGN_ID = '42f7a72a-25d8-48eb-bd99-3f681509b7ae';

const makeService = (
  accounts: Array<{ id: string; username: string; status: string }>,
  setting: Record<string, unknown> | null,
) => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('to_regclass')) return [{ ok: true }];
    if (sql.includes('"myahInstagramAccount"')) return accounts;
    if (sql.includes('"myahCampaignAgentSetting"'))
      return setting ? [setting] : [];
    return [];
  });
  return {
    service: new MyahAgentService({ query } as never, {} as never),
    query,
  };
};

describe('MyahAgentService campaign Instagram sender', () => {
  it('has no sender when no account is connected', async () => {
    const { service } = makeService([], null);
    await expect(
      service.getCampaignSettingRecord(WORKSPACE_ID, CAMPAIGN_ID),
    ).resolves.toEqual({
      preferredChannel: 'NO_PREFERENCE',
      requireReplyApproval: false,
      instagramAccountId: null,
    });
  });

  it('uses the only connected account when none is selected', async () => {
    const { service } = makeService(
      [{ id: 'ig-1', username: 'glow', status: 'ACTIVE' }],
      null,
    );
    const record = await service.getCampaignSettingRecord(
      WORKSPACE_ID,
      CAMPAIGN_ID,
    );
    expect(record.instagramAccountId).toBe('ig-1');
  });

  it('requires a choice when several accounts are connected', async () => {
    const accounts = [
      { id: 'ig-1', username: 'glow', status: 'ACTIVE' },
      { id: 'ig-2', username: 'glow.uk', status: 'NEEDS_RECONNECT' },
    ];
    expect(
      (
        await makeService(accounts, null).service.getCampaignSettingRecord(
          WORKSPACE_ID,
          CAMPAIGN_ID,
        )
      ).instagramAccountId,
    ).toBeNull();
    expect(
      await makeService(accounts, {
        instagramAccountId: 'ig-2',
        preferredChannel: 'INSTAGRAM',
        requireReplyApproval: true,
      }).service.getCampaignSettingRecord(WORKSPACE_ID, CAMPAIGN_ID),
    ).toEqual({
      instagramAccountId: 'ig-2',
      preferredChannel: 'INSTAGRAM',
      requireReplyApproval: true,
    });
  });

  it('ignores a selected account that is no longer connected', async () => {
    const { service } = makeService(
      [
        { id: 'ig-1', username: 'glow', status: 'ACTIVE' },
        { id: 'ig-3', username: 'other', status: 'ACTIVE' },
      ],
      { instagramAccountId: 'ig-gone' },
    );
    expect(
      (await service.getCampaignSettingRecord(WORKSPACE_ID, CAMPAIGN_ID))
        .instagramAccountId,
    ).toBeNull();
  });
});

describe('MyahAgentService sending mode', () => {
  it('records who turned automatic sending on', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return sql.includes('FOR UPDATE')
          ? [{ sendingMode: 'DRAFT_FOR_APPROVAL' }]
          : [];
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (run: (m: typeof manager) => unknown) =>
        run(manager),
      ),
      query: jest.fn(async () => []),
    };
    const service = new MyahAgentService(dataSource as never, {} as never);
    await service.updateAgent(WORKSPACE_ID, 'user-workspace-1', {
      sendingMode: 'SEND_AUTOMATICALLY' as never,
    });
    const update = queries.find(({ sql }) => sql.startsWith('UPDATE'));
    expect(update?.params).toContain('user-workspace-1');
    expect(update?.params).toContain('SEND_AUTOMATICALLY');
  });

  it('refuses automatic sending without a signed-in member', async () => {
    const manager = {
      query: jest.fn(async (sql: string) =>
        sql.includes('FOR UPDATE')
          ? [{ sendingMode: 'DRAFT_FOR_APPROVAL' }]
          : [],
      ),
    };
    const service = new MyahAgentService(
      {
        transaction: async (run: (m: typeof manager) => unknown) =>
          run(manager),
      } as never,
      {} as never,
    );
    await expect(
      service.updateAgent(WORKSPACE_ID, undefined, {
        sendingMode: 'SEND_AUTOMATICALLY' as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
