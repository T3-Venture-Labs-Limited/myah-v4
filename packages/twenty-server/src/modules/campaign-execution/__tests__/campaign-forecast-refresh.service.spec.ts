import { CampaignForecastRefreshService } from 'src/modules/campaign-execution/services/campaign-forecast-refresh.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const secondCampaignId = '22222222-2222-4222-8222-333333333333';
const accountId = '33333333-3333-4333-8333-333333333333';

const occurrence = (campaign: string, suffix: string) => ({
  authoredMessageIndex: 0,
  campaignId: campaign,
  dueAt: new Date('2026-09-21T10:00:00.000Z'),
  occurrenceId: `44444444-4444-4444-8444-${suffix}`,
  pinnedConnectedAccountId: null,
  window: {
    endLocalTime: '17:00:00',
    startLocalTime: '09:00:00',
    timeZone: 'UTC',
  },
  workflowVersionId: '55555555-5555-4555-8555-555555555555',
});

const buildHarness = (input?: {
  items?: ReturnType<typeof occurrence>[];
  zones?: Array<{ campaignId: string; campaignCapacityTimeZone: string }>;
  replyToThread?: boolean;
}) => {
  const manager = {
    query: jest.fn((sql: string) => {
      if (sql.includes('campaignForecastHead')) {
        return [
          {
            inputRevision: '7',
            scopeKey: `workspace:${workspaceId}`,
            workspaceId,
          },
        ];
      }
      if (sql.includes('mailboxCapacityDay')) {
        return [
          {
            acceptedCount: 2,
            connectedAccountId: accountId,
            localDate: '2026-09-21',
            nextEligibleAt: null,
            reservedCount: 1,
          },
        ];
      }
      if (sql.includes('campaignExecution')) {
        return (
          input?.zones ?? [{ campaignId, campaignCapacityTimeZone: 'UTC' }]
        );
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  const candidates = {
    readPage: jest.fn().mockResolvedValue({
      items: input?.items ?? [occurrence(campaignId, '444444444444')],
      nextCursor: null,
    }),
  };
  const forecastResult = {
    coverage: { complete: true, evaluatedCount: 1 },
    generatedAt: new Date('2026-09-21T09:00:00.000Z'),
    horizonEndsAt: new Date('2026-09-23T09:00:00.000Z'),
    projections: [],
  };
  const forecast = { forecast: jest.fn().mockReturnValue(forecastResult) };
  const projection = {
    publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  };
  const senders = {
    getCampaignEmailSenderPoolInTransaction: jest.fn().mockResolvedValue({
      mailboxes: [
        {
          bindingStatus: 'RESOLVED_BINDING',
          connectedAccountId: accountId,
          dailySendLimit: 50,
          minimumSendIntervalMs: 300_000,
          status: 'READY',
        },
      ],
    }),
  };
  const sequences = {
    loadExecutionPlanInTransaction: jest.fn().mockResolvedValue({
      kind: 'READY',
      nodes: [
        { channel: 'EMAIL', replyToThread: input?.replyToThread ?? false },
      ],
    }),
  };
  const service = new CampaignForecastRefreshService(
    {
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        transaction: jest.fn((callback) => callback(manager)),
      }),
    } as never,
    candidates as never,
    forecast as never,
    projection as never,
    senders as never,
    sequences as never,
  );

  return { candidates, forecast, manager, projection, senders, service };
};

describe('CampaignForecastRefreshService', () => {
  it('refreshes one stale workspace scope with bounded shared-pool input', async () => {
    const { candidates, forecast, manager, projection, senders, service } =
      buildHarness();

    await service.refreshStaleForecasts();

    expect(candidates.readPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500, workspaceId }),
      manager,
    );
    expect(
      senders.getCampaignEmailSenderPoolInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(forecast.forecast).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: [
          expect.objectContaining({
            acceptedByLocalDate: { '2026-09-21': 2 },
            capacityTimeZone: 'UTC',
            connectedAccountId: accountId,
            reservedByLocalDate: { '2026-09-21': 1 },
          }),
        ],
        occurrences: [
          expect.objectContaining({
            sender: { kind: 'ROTATE', connectedAccountIds: [accountId] },
          }),
        ],
      }),
    );
    expect(projection.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        complete: true,
        expectedInputRevision: 7,
        scopeKey: `workspace:${workspaceId}`,
        workspaceId,
      }),
      manager,
    );
  });

  it('publishes incomplete when a threaded follow-up has no accepted sender binding', async () => {
    const { projection, service } = buildHarness({ replyToThread: true });

    await service.refreshStaleForecasts();

    expect(projection.publish).toHaveBeenCalledWith(
      expect.objectContaining({ complete: false, entries: [] }),
      expect.anything(),
    );
  });

  it('publishes incomplete rather than choosing an arbitrary reset zone for a shared mailbox', async () => {
    const { forecast, projection, service } = buildHarness({
      items: [
        occurrence(campaignId, '444444444444'),
        occurrence(secondCampaignId, '555555555555'),
      ],
      zones: [
        { campaignId, campaignCapacityTimeZone: 'UTC' },
        {
          campaignId: secondCampaignId,
          campaignCapacityTimeZone: 'America/New_York',
        },
      ],
    });

    await service.refreshStaleForecasts();

    expect(forecast.forecast).toHaveBeenCalledWith(
      expect.objectContaining({ accounts: [] }),
    );
    expect(projection.publish).toHaveBeenCalledWith(
      expect.objectContaining({ complete: false }),
      expect.anything(),
    );
  });
});
