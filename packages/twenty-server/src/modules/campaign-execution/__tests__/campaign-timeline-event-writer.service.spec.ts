import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';
import { type LockedCampaignLifecycleContext } from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';

const manager = { queryRunner: { isTransactionActive: true } };
const context = {
  manager,
  workspaceId: '11111111-1111-4111-8111-111111111111',
  campaignId: '22222222-2222-4222-8222-222222222222',
  actorPermissionContext: {
    authContext: {
      workspaceMemberId: '33333333-3333-4333-8333-333333333333',
    },
  },
} as unknown as LockedCampaignLifecycleContext;

describe('CampaignTimelineEventWriterService', () => {
  it('writes deterministic target-specific projections sharing one business identity through the supplied transaction manager', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const orm = {
      getRepository: jest.fn().mockResolvedValue({ upsert }),
    } as unknown as GlobalWorkspaceOrmManager;
    const service = new CampaignTimelineEventWriterService(orm);

    await service.writeInTransaction(context, {
      businessEventKey:
        'enrollment:55555555-5555-4555-8555-555555555555:ENROLLED',
      eventKind: 'ENROLLED',
      happenedAt: '2026-09-16T12:00:00.000Z',
      sourceId: '55555555-5555-4555-8555-555555555555',
      sourceType: 'ENROLLMENT',
      creatorId: '66666666-6666-4666-8666-666666666666',
    });

    expect(upsert).toHaveBeenCalledTimes(2);
    const campaignProjection = upsert.mock.calls[0][0];
    const creatorProjection = upsert.mock.calls[1][0];
    expect(campaignProjection).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'campaign.enrolled',
        happensAt: new Date('2026-09-16T12:00:00.000Z'),
        targetCampaignId: context.campaignId,
        properties: {
          campaignEvent: expect.objectContaining({
            businessEventId: expect.any(String),
            campaignId: context.campaignId,
          }),
        },
      }),
    );
    expect(creatorProjection).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        targetCreatorId: '66666666-6666-4666-8666-666666666666',
      }),
    );
    expect(creatorProjection.id).not.toBe(campaignProjection.id);
    expect(creatorProjection.properties).toStrictEqual(
      campaignProjection.properties,
    );
    expect(upsert).toHaveBeenNthCalledWith(
      1,
      campaignProjection,
      ['id'],
      manager,
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      creatorProjection,
      ['id'],
      manager,
    );
  });

  it('reuses deterministic projection identities for exact replay and concurrent conflict suppression', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const service = new CampaignTimelineEventWriterService({
      getRepository: jest.fn().mockResolvedValue({ upsert }),
    } as unknown as GlobalWorkspaceOrmManager);
    const event = {
      businessEventKey:
        'hold:55555555-5555-4555-8555-555555555555:2026-09-16T12:00:00.000Z:SENDER_NOT_READY',
      eventKind: 'HELD' as const,
      happenedAt: '2026-09-16T12:00:00.000Z',
      sourceId: '55555555-5555-4555-8555-555555555555',
      sourceType: 'OCCURRENCE' as const,
      creatorId: '66666666-6666-4666-8666-666666666666',
      reason: 'SENDER_NOT_READY',
    };

    await Promise.all([
      service.writeInTransaction(context, event),
      service.writeInTransaction(context, event),
    ]);

    expect(upsert).toHaveBeenCalledTimes(4);
    const projectionCounts = upsert.mock.calls.reduce<Record<string, number>>(
      (counts, [projection]) => ({
        ...counts,
        [projection.id]: (counts[projection.id] ?? 0) + 1,
      }),
      {},
    );
    expect(Object.values(projectionCounts).sort()).toEqual([2, 2]);
  });

  it('propagates projection failure so the owning transaction can roll back', async () => {
    const upsert = jest.fn().mockRejectedValue(new Error('projection failed'));
    const orm = {
      getRepository: jest.fn().mockResolvedValue({ upsert }),
    } as unknown as GlobalWorkspaceOrmManager;

    await expect(
      new CampaignTimelineEventWriterService(orm).writeInTransaction(context, {
        businessEventKey: 'campaign:paused:2026-09-16T12:00:00.000Z',
        eventKind: 'PAUSED',
        happenedAt: '2026-09-16T12:00:00.000Z',
        sourceId: context.campaignId,
        sourceType: 'CAMPAIGN',
      }),
    ).rejects.toThrow('projection failed');
  });
});
