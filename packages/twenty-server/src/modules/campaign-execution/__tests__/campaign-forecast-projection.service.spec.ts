import { type EntityManager } from 'typeorm';

import { CampaignForecastProjectionService } from 'src/modules/campaign-execution/services/campaign-forecast-projection.service';
import { CampaignForecastInputInvalidationService } from 'src/modules/campaign-execution/services/campaign-forecast-input-invalidation.service';

const input = {
  complete: false,
  entries: [
    {
      campaignId: 'campaign-a',
      connectedAccountId: 'account-a',
      estimatedSendAt: new Date('2026-09-21T10:00:00.000Z'),
      occurrenceId: 'occurrence-a',
    },
  ],
  evaluatedCount: 100,
  expectedInputRevision: 4,
  generatedAt: new Date('2026-09-21T09:00:00.000Z'),
  generationId: '22222222-2222-4222-8222-222222222222',
  horizonEndsAt: new Date('2026-09-23T09:00:00.000Z'),
  scopeKey: 'account-pool-a',
  workspaceId: '11111111-1111-4111-8111-111111111111',
};

const manager = (query: jest.Mock) =>
  ({
    queryRunner: {
      isReleased: false,
      isTransactionActive: true,
      query,
    },
  }) as unknown as EntityManager;

describe('CampaignForecastProjectionService', () => {
  const service = new CampaignForecastProjectionService();

  it('rejects a stale generation before staging rows', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { currentGenerationId: null, inputRevision: '5' },
      ]);

    await expect(service.publish(input, manager(query))).resolves.toEqual({
      status: 'STALE_INPUT',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('publishes a complete or incomplete generation through one atomic head swap', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { currentGenerationId: null, inputRevision: '4' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ currentGenerationId: input.generationId }])
      .mockResolvedValueOnce([]);

    await expect(service.publish(input, manager(query))).resolves.toEqual({
      generationId: input.generationId,
      status: 'PUBLISHED',
    });
    expect(query.mock.calls[1][0]).toContain('"complete"');
    expect(query.mock.calls[3][0]).toContain('"currentGenerationId"=$4');
    expect(query.mock.calls[4][0]).toContain('OFFSET 1');
  });

  it('does not let an older same-revision calculation replace a newer publication', async () => {
    let currentGenerationId: string | null = null;
    let currentGeneratedAt: Date | null = null;
    const query = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('FOR UPDATE')) {
        return [
          {
            currentGenerationId,
            currentGeneratedAt,
            inputRevision: '4',
          },
        ];
      }
      if (sql.includes('UPDATE core."campaignForecastHead"')) {
        currentGenerationId = params[3] as string;
        currentGeneratedAt = publishedDates.get(currentGenerationId) ?? null;
        return [{ currentGenerationId }];
      }
      return [];
    });
    const publishedDates = new Map<string, Date>();
    const newest = {
      ...input,
      entries: [],
      generatedAt: new Date('2026-09-21T09:02:00.000Z'),
      generationId: '33333333-3333-4333-8333-333333333333',
    };
    publishedDates.set(newest.generationId, newest.generatedAt);
    publishedDates.set(input.generationId, input.generatedAt);

    await expect(service.publish(newest, manager(query))).resolves.toEqual({
      generationId: newest.generationId,
      status: 'PUBLISHED',
    });
    const callsAfterNewer = query.mock.calls.length;
    await expect(
      service.publish({ ...input, entries: [] }, manager(query)),
    ).resolves.toEqual({ status: 'STALE_INPUT' });
    expect(query).toHaveBeenCalledTimes(callsAfterNewer + 1);
    expect(currentGenerationId).toBe(newest.generationId);

    await expect(
      service.publish(
        {
          ...newest,
          generationId: '22222222-2222-4222-8222-222222222222',
        },
        manager(query),
      ),
    ).resolves.toEqual({ status: 'STALE_INPUT' });
    expect(currentGenerationId).toBe(newest.generationId);

    const later = {
      ...newest,
      generatedAt: new Date('2026-09-21T09:03:00.000Z'),
      generationId: '44444444-4444-4444-8444-444444444444',
    };
    publishedDates.set(later.generationId, later.generatedAt);
    await expect(service.publish(later, manager(query))).resolves.toEqual({
      generationId: later.generationId,
      status: 'PUBLISHED',
    });
    expect(currentGenerationId).toBe(later.generationId);
  });

  it('never prunes the referenced head even when it is older than two other generations', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          currentGenerationId: '11111111-1111-4111-8111-111111111111',
          currentGeneratedAt: new Date('2026-09-21T08:00:00.000Z'),
          inputRevision: '4',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ currentGenerationId: input.generationId }])
      .mockResolvedValueOnce([]);

    await expect(service.publish(input, manager(query))).resolves.toEqual({
      generationId: input.generationId,
      status: 'PUBLISHED',
    });
    const prune = query.mock.calls[4];
    expect(prune[0]).toContain('"currentGenerationId"');
    expect(prune[0]).toContain('OFFSET 1');
    expect(prune[1]).toEqual([input.workspaceId, input.scopeKey]);
  });

  it('fails without publishing when staging fails', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { currentGenerationId: null, inputRevision: '4' },
      ])
      .mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.publish(input, manager(query))).rejects.toThrow(
      'database unavailable',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects an old calculation after a policy-save invalidation advances its input revision', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { currentGenerationId: null, inputRevision: '5' },
      ]);
    const transactionManager = manager(query);

    await new CampaignForecastInputInvalidationService().invalidateInTransaction(
      { workspaceId: input.workspaceId },
      transactionManager,
    );

    await expect(
      service.publish(
        { ...input, expectedInputRevision: 4 },
        transactionManager,
      ),
    ).resolves.toEqual({ status: 'STALE_INPUT' });
    expect(query.mock.calls[0][0]).toContain('campaignForecastHead');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
