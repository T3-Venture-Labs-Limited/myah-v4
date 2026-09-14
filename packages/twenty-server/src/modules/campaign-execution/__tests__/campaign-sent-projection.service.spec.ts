import { CampaignSentProjectionService } from 'src/modules/campaign-execution/services/campaign-sent-projection.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

const IDS = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  campaignId: '22222222-2222-4222-8222-222222222222',
  connectedAccountId: '33333333-3333-4333-8333-333333333333',
  messageChannelId: '44444444-4444-4444-8444-444444444444',
  attemptId: '55555555-5555-4555-8555-555555555555',
} as const;

const acceptedAttempt = () => ({
  attemptId: IDS.attemptId,
  source: 'CAMPAIGN_SEQUENCE',
  attemptState: 'ACCEPTED',
  projectedMessageId: null,
  projectedMessageThreadId: null,
  providerAcceptedAt: new Date('2026-09-11T12:00:00.000Z'),
  providerMessageId: '<provider@example.com>',
  providerMessageExternalId: 'external-message',
  providerThreadExternalId: 'external-thread',
  providerHeaderMessageId: '<header@example.com>',
  providerDeliveredRecipients: {
    to: ['creator@example.com'],
    cc: [],
    bcc: [],
  },
  resolvedThreadExternalId: 'external-thread',
  subject: 'Hello',
  text: 'Body',
  toRecipient: 'creator@example.com',
  inReplyTo: null,
  threadExternalId: null,
});

describe('CampaignSentProjectionService', () => {
  const setup = (attemptRows: unknown[] = [acceptedAttempt()]) => {
    const queries: Array<{ sql: string; parameters: unknown[] }> = [];
    const connectedAccount = { id: IDS.connectedAccountId };
    const query = jest.fn(async (sql: string, parameters: unknown[]) => {
      queries.push({ sql, parameters });
      if (sql.includes('FROM core.workspace')) return [{ id: IDS.workspaceId }];
      if (sql.includes('.campaign WHERE')) return [{ id: IDS.campaignId }];
      if (sql.includes('FROM core."connectedAccount"'))
        return [{ id: IDS.connectedAccountId }];
      if (sql.includes('FROM core."messageChannel"'))
        return [{ id: IDS.messageChannelId }];
      if (sql.includes('JOIN core."campaignOutboundRender"'))
        return attemptRows;
      if (sql.includes('UPDATE core."outboundEmailAttempt"'))
        return [{ attemptId: IDS.attemptId }];
      return [];
    });
    const manager = {
      queryRunner: undefined as unknown,
      getRepository: jest.fn(() => ({
        findOneOrFail: jest.fn(async () => connectedAccount),
      })),
    };
    const runner = {
      isTransactionActive: true,
      isReleased: false,
      manager,
      query,
    };
    manager.queryRunner = runner;
    const dataSource = {
      transaction: jest.fn(async (work: (value: typeof manager) => unknown) =>
        work(manager),
      ),
    };
    const orm = {
      getGlobalWorkspaceDataSource: jest.fn(async () => dataSource),
    };
    const expectedMessageId = computeCampaignProjectedMessageId(IDS.attemptId);
    const sentPersistence = {
      persistSentMessage: jest.fn(async () => ({
        messageId: expectedMessageId,
        messageThreadId: '66666666-6666-4666-8666-666666666666',
      })),
    };
    const service = new CampaignSentProjectionService(
      orm as never,
      sentPersistence as never,
    );

    return {
      service,
      orm,
      sentPersistence,
      queries,
      manager,
      expectedMessageId,
    };
  };

  it('locks canonical routing coordinates before exact attempt projection and CAS', async () => {
    const { service, sentPersistence, queries, manager, expectedMessageId } =
      setup();

    await expect(service.reconcile(IDS)).resolves.toBe('PROJECTED');

    const joined = queries.map(
      ({ sql, parameters }) =>
        `${sql.replace(/\s+/g, ' ')} ${parameters.join(' ')}`,
    );
    const indexOf = (text: string) =>
      joined.findIndex((sql) => sql.includes(text));
    expect(indexOf('FROM core.workspace')).toBeLessThan(
      indexOf('pg_advisory_xact_lock(hashtext'),
    );
    expect(indexOf('pg_advisory_xact_lock(hashtext')).toBeLessThan(
      indexOf('.campaign WHERE'),
    );
    expect(indexOf('.campaign WHERE')).toBeLessThan(
      indexOf('campaign-mailbox:account'),
    );
    expect(indexOf('campaign-mailbox:account')).toBeLessThan(
      indexOf('campaign-mailbox:channel'),
    );
    expect(indexOf('campaign-mailbox:channel')).toBeLessThan(
      indexOf('JOIN core."campaignOutboundRender"'),
    );
    expect(sentPersistence.persistSentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedMessageId,
        transactionManager: manager,
        workspaceId: IDS.workspaceId,
        messageChannelId: IDS.messageChannelId,
      }),
    );
    expect(indexOf('JOIN core."campaignOutboundRender"')).toBeLessThan(
      indexOf('UPDATE core."outboundEmailAttempt"'),
    );
  });

  it('returns exact replay without repeating persistence', async () => {
    const expectedMessageId = computeCampaignProjectedMessageId(IDS.attemptId);
    const { service, sentPersistence } = setup([
      {
        ...acceptedAttempt(),
        projectedMessageId: expectedMessageId,
        projectedMessageThreadId: '66666666-6666-4666-8666-666666666666',
      },
    ]);

    await expect(service.reconcile(IDS)).resolves.toBe('EXACT_REPLAY');
    expect(sentPersistence.persistSentMessage).toHaveBeenCalledTimes(1);
  });

  it('passes a nullable header for accepted Microsoft evidence without trusted header material', async () => {
    const { service, sentPersistence } = setup([
      {
        ...acceptedAttempt(),
        providerHeaderMessageId: null,
        reconciledProviderHeaderMessageId: null,
      },
    ]);

    await expect(service.reconcile(IDS)).resolves.toBe('PROJECTED');
    expect(sentPersistence.persistSentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sendResult: expect.objectContaining({ headerMessageId: null }),
      }),
    );
  });

  it('fails closed before opening a transaction for invalid routing IDs', async () => {
    const { service, orm } = setup();

    await expect(
      service.reconcile({ ...IDS, workspaceId: 'not-a-workspace-id' }),
    ).resolves.toBe('DEFERRED');
    expect(orm.getGlobalWorkspaceDataSource).not.toHaveBeenCalled();
  });

  it('does not persist when exact locked attempt scope is unavailable', async () => {
    const { service, sentPersistence } = setup([]);

    await expect(service.reconcile(IDS)).resolves.toBe('DEFERRED');
    expect(sentPersistence.persistSentMessage).not.toHaveBeenCalled();
  });
});
