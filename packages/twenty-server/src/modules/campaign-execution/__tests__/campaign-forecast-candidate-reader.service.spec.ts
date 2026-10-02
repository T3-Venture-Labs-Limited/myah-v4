import { type EntityManager } from 'typeorm';

import { CampaignForecastCandidateReaderService } from 'src/modules/campaign-execution/services/campaign-forecast-candidate-reader.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';

describe('CampaignForecastCandidateReaderService', () => {
  it('uses a bounded workspace-scoped keyset query over materialized pending occurrences', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        campaignId: 'campaign-a',
        dueAt: new Date('2026-09-21T10:00:00.000Z'),
        endLocalTime: '17:00:00',
        occurrenceId: 'occurrence-a',
        startLocalTime: '09:00:00',
        timeZone: 'UTC',
      },
    ]);
    const manager = {
      queryRunner: { isReleased: false, query },
    } as unknown as EntityManager;
    const reader = new CampaignForecastCandidateReaderService();
    const horizonEndsAt = new Date('2026-09-23T09:00:00.000Z');
    const cursor = {
      dueAt: new Date('2026-09-21T09:30:00.000Z'),
      occurrenceId: 'occurrence-before',
    };

    await expect(
      reader.readPage(
        { cursor, horizonEndsAt, limit: 100, workspaceId },
        manager,
      ),
    ).resolves.toEqual({
      items: [
        {
          campaignId: 'campaign-a',
          dueAt: new Date('2026-09-21T10:00:00.000Z'),
          occurrenceId: 'occurrence-a',
          window: {
            endLocalTime: '17:00:00',
            startLocalTime: '09:00:00',
            timeZone: 'UTC',
          },
        },
      ],
      nextCursor: null,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`o."workspaceId"=$1 AND o.state='PENDING'`),
      [workspaceId, horizonEndsAt, cursor.dueAt, cursor.occurrenceId, 101],
    );
    expect(query.mock.calls[0][0]).toContain(
      '(o."dueAt",o.id) > ($3::timestamptz,$4::uuid)',
    );
    expect(query.mock.calls[0][0]).toContain(
      'ORDER BY o."dueAt",o.id LIMIT $5',
    );
    expect(query.mock.calls[0][0]).not.toMatch(/sequenceNode|JOIN .*workflow/i);
  });
});
