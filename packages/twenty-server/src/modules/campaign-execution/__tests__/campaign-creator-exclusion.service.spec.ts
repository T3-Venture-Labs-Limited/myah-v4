import { CampaignCreatorExclusionService } from 'src/modules/campaign-execution/services/campaign-creator-exclusion.service';
import { type CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import { type CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const campaignCreatorId = '33333333-3333-4333-8333-333333333333';
const creatorId = '44444444-4444-4444-8444-444444444444';

const harness = (queryResults: unknown[]) => {
  const query = jest.fn();
  for (const result of queryResults) query.mockResolvedValueOnce(result);
  const manager = { queryRunner: undefined as unknown };
  manager.queryRunner = {
    isTransactionActive: true,
    manager,
    query,
  };
  const context = {
    workspaceId,
    campaignId,
    schemaName: 'workspace_test',
    manager,
    actorPermissionContext: {
      authContext: {
        workspace: { id: workspaceId },
        workspaceMemberId: '55555555-5555-4555-8555-555555555555',
      },
    },
  };
  const transaction = {
    run: jest.fn(async (_input, operation) => operation(context)),
  } as unknown as CampaignLifecycleTransactionService;
  const writer = {
    writeInTransaction: jest.fn().mockResolvedValue(undefined),
  } as unknown as CampaignTimelineEventWriterService;
  const attemptService = {
    blockReservedAttemptBeforeProvider: jest
      .fn()
      .mockResolvedValue({ status: 'RECORDED' }),
  };
  const service = new CampaignCreatorExclusionService(
    transaction,
    writer,
    attemptService as never,
  );

  return { attemptService, query, service, writer };
};

const input = {
  workspaceId,
  campaignId,
  campaignCreatorId,
  reason: 'No longer a fit',
  authContext: {
    workspace: { id: workspaceId },
  },
} as never;

describe('CampaignCreatorExclusionService', () => {
  it('durably excludes, cancels pending work, and writes one immutable event', async () => {
    const excludedAt = new Date('2026-09-16T12:00:00.000Z');
    const { query, service, writer } = harness([
      [{ id: campaignCreatorId, creatorId, excludedAt: null }],
      [{ id: 'enrollment' }],
      [{ id: 'occurrence' }],
      [{ attemptState: 'PROCESSING' }],
      [{ observedAt: excludedAt }],
      [],
      [],
      [],
    ]);

    await expect(service.exclude(input)).resolves.toEqual({
      status: 'EXCLUDED',
      excludedAt: excludedAt.toISOString(),
      mayStillSend: true,
    });
    expect(query.mock.calls[5][0]).toContain(
      "stage=CASE WHEN stage IN ('READY','CONTACTED')",
    );
    expect(query.mock.calls[6][0]).toContain(
      "o.state IN ('PENDING','IN_FLIGHT','HELD')",
    );
    expect(writer.writeInTransaction).toHaveBeenCalledTimes(1);
  });

  it('replays without rewriting state or duplicating the event', async () => {
    const excludedAt = new Date('2026-09-16T12:00:00.000Z');
    const { query, service, writer } = harness([
      [{ id: campaignCreatorId, creatorId, excludedAt }],
      [],
      [],
      [],
    ]);

    await expect(service.exclude(input)).resolves.toEqual({
      status: 'REPLAYED',
      excludedAt: excludedAt.toISOString(),
      mayStillSend: false,
    });
    expect(query).toHaveBeenCalledTimes(4);
    expect(writer.writeInTransaction).not.toHaveBeenCalled();
  });

  it('blocks reserved work before cancellation and scopes every mutation to one Campaign Creator', async () => {
    const excludedAt = new Date('2026-09-16T12:00:00.000Z');
    const reserved = {
      source: 'CAMPAIGN_SEQUENCE',
      attemptState: 'RESERVED',
      attemptId: '66666666-6666-4666-8666-666666666666',
      attemptNumber: 1,
      authorizationId: '77777777-7777-4777-8777-777777777777',
      campaignId,
      claimedAt: excludedAt,
      connectedAccountId: '88888888-8888-4888-8888-888888888888',
      enrollmentId: '99999999-9999-4999-8999-999999999999',
      localDate: '2026-09-16',
      messageChannelId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      messageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      normalizedRecipient: 'creator@example.com',
      normalizedSenderHandle: 'sender@example.com',
      occurrenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      provider: 'google',
      renderDigest: 'a'.repeat(64),
      senderPoolFingerprint: 'b'.repeat(64),
      slotAt: excludedAt,
      unknownAfter: new Date('2026-09-16T12:05:00.000Z'),
      workflowVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      workspaceId,
      selectionConstraintKind: 'ROTATE',
    };
    const { attemptService, query, service } = harness([
      [{ id: campaignCreatorId, creatorId, excludedAt: null }],
      [{ id: reserved.enrollmentId }],
      [{ id: reserved.occurrenceId }],
      [reserved],
      [{ observedAt: excludedAt }],
      [],
      [],
      [],
    ]);

    await service.exclude(input);

    expect(
      attemptService.blockReservedAttemptBeforeProvider,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'OCCURRENCE_CANCELLED' }),
      expect.anything(),
    );
    const mutationSql = query.mock.calls
      .slice(5)
      .map(([sql]) => sql)
      .join('\n');
    expect(mutationSql).toContain('"campaignCreatorId"=$3');
    expect(mutationSql).not.toContain(
      'UPDATE core."campaignEnrollment"\n            SET state=\'EXCLUDED\' WHERE',
    );
  });
});
