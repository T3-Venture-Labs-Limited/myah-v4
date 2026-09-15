import { CampaignExecutionPersistenceAdapter } from 'src/modules/campaign-execution/adapters/campaign-execution-persistence.adapter';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';

const harness = (results: unknown[]) => {
  const manager = {} as any;
  const query = jest.fn();

  for (const result of results) query.mockResolvedValueOnce(result);
  manager.queryRunner = {
    manager,
    query,
    isTransactionActive: true,
    isReleased: false,
  };

  return {
    query,
    context: {
      manager,
      workspaceId,
      campaignId,
      schemaName: 'workspace_test',
    } as any,
  };
};

const executionRow = {
  id: executionId,
  workspaceId,
  campaignId,
  timeZone: 'UTC',
  startLocalTime: '08:00:00',
  endLocalTime: '16:00:00',
  campaignCapacityTimeZone: 'UTC',
};

describe('CampaignExecutionPersistenceAdapter', () => {
  it('updates stable execution identity through schema-qualified SQL and a structured result', async () => {
    const { context, query } = harness([
      [executionRow],
      {
        affected: 1,
        records: [
          {
            ...executionRow,
            timeZone: 'Europe/Paris',
            startLocalTime: '09:00:00',
            endLocalTime: '17:00:00',
            campaignCapacityTimeZone: 'America/New_York',
          },
        ],
      },
    ]);

    await expect(
      new CampaignExecutionPersistenceAdapter().writeSendingWindowInTransaction(
        context,
        {
          window: {
            timeZone: 'Europe/Paris',
            startLocalTime: '09:00:00',
            endLocalTime: '17:00:00',
          },
          campaignCapacityTimeZone: 'America/New_York',
        },
      ),
    ).resolves.toMatchObject({
      status: 'UPDATED',
      createdExecution: false,
      execution: { campaignExecutionId: executionId },
    });
    expect(query.mock.calls[0][0]).toContain('core."campaignExecution"');
    expect(query.mock.calls[1][2]).toBe(true);
    expect(context.manager.query).toBeUndefined();
  });

  it.each([
    [{ affected: 0, records: [] }],
    [
      {
        affected: 1,
        records: [{ id: '44444444-4444-4444-8444-444444444444' }],
      },
    ],
    [{ affected: 2, records: [{ id: campaignId }, { id: campaignId }] }],
  ])(
    'rejects invalid PostgreSQL structured lifecycle CAS result %#',
    async (structured) => {
      const { context } = harness([structured]);

      await expect(
        new CampaignExecutionPersistenceAdapter().transitionLifecycleInTransaction(
          context,
          {
            from: 'ACTIVE',
            to: 'PAUSED',
          },
        ),
      ).rejects.toThrow('Campaign lifecycle transition was inconsistent');
    },
  );

  it('counts the actual attemptState column', async () => {
    const { context, query } = harness([[{ count: 3 }]]);

    await expect(
      new CampaignExecutionPersistenceAdapter().countInFlightAttemptsInTransaction(
        context,
      ),
    ).resolves.toBe(3);
    expect(query.mock.calls[0][0]).toContain('"attemptState" IN');
    expect(query.mock.calls[0][0]).not.toMatch(/\sstate IN/);
  });
});
