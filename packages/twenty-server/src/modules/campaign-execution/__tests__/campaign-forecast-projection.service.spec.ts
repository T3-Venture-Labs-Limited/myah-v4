import { type EntityManager } from 'typeorm';

import { CampaignForecastProjectionService } from 'src/modules/campaign-execution/services/campaign-forecast-projection.service';

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
    expect(query.mock.calls[4][0]).toContain('OFFSET 2');
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
});
