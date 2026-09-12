import { ConnectedAccountProvider } from 'twenty-shared/types';

import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { CampaignMicrosoftHeaderReconciliationService } from 'src/modules/campaign-execution/services/campaign-microsoft-header-reconciliation.service';

const coordinate = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  connectedAccountId: '22222222-2222-4222-8222-222222222222',
  messageChannelId: '33333333-3333-4333-8333-333333333333',
  provider: ConnectedAccountProvider.MICROSOFT,
  direction: MessageDirection.OUTGOING,
  providerMessageExternalId: 'external-id',
  trustedHeaderMessageId: '<trusted@example.com>',
} as const;

const setup = () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = { queryRunner: undefined as unknown };
  const query = jest.fn(async (sql: string, parameters: unknown[]) => {
    calls.push({ sql, parameters });
    if (sql.includes('core.workspace')) return [{ id: coordinate.workspaceId }];
    if (sql.includes('connectedAccount'))
      return [{ id: coordinate.connectedAccountId }];
    if (sql.includes('messageChannel'))
      return [{ id: coordinate.messageChannelId }];
    return [];
  });
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
  const orm = { getGlobalWorkspaceDataSource: jest.fn(async () => dataSource) };
  const messaging = {
    reconcileMicrosoftCampaignHeaderInTransaction: jest.fn(
      async () => 'UPDATED',
    ),
  };
  return {
    service: new CampaignMicrosoftHeaderReconciliationService(
      orm as never,
      messaging as never,
    ),
    orm,
    messaging,
    calls,
    manager,
  };
};

describe('CampaignMicrosoftHeaderReconciliationService', () => {
  it('locks workspace and mailbox coordinates before exact reconciliation', async () => {
    const { service, calls, messaging, manager } = setup();
    await expect(service.reconcileImportedSentHeader(coordinate)).resolves.toBe(
      'UPDATED',
    );
    const trace = calls.map(
      ({ sql, parameters }) => `${sql} ${parameters.join(' ')}`,
    );
    const index = (text: string) =>
      trace.findIndex((entry) => entry.includes(text));
    expect(index('core.workspace')).toBeLessThan(
      index('campaign-mailbox:account'),
    );
    expect(index('campaign-mailbox:account')).toBeLessThan(
      index('campaign-mailbox:channel'),
    );
    expect(index('campaign-mailbox:channel')).toBeLessThan(
      index('connectedAccount'),
    );
    expect(
      messaging.reconcileMicrosoftCampaignHeaderInTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageExternalId: 'external-id' }),
      manager,
    );
  });

  it('fails closed before a transaction for wrong provider or direction', async () => {
    const { service, orm } = setup();
    await expect(
      service.reconcileImportedSentHeader({
        ...coordinate,
        provider: ConnectedAccountProvider.GOOGLE,
      }),
    ).resolves.toBe('DEFERRED');
    await expect(
      service.reconcileImportedSentHeader({
        ...coordinate,
        direction: MessageDirection.INCOMING,
      }),
    ).resolves.toBe('DEFERRED');
    expect(orm.getGlobalWorkspaceDataSource).not.toHaveBeenCalled();
  });

  it('defers when the exact account/channel scope is unavailable', async () => {
    const { service, messaging, calls } = setup();
    calls.length = 0;
    const invalid = { ...coordinate, messageChannelId: 'not-a-uuid' };
    await expect(service.reconcileImportedSentHeader(invalid)).resolves.toBe(
      'DEFERRED',
    );
    expect(
      messaging.reconcileMicrosoftCampaignHeaderInTransaction,
    ).not.toHaveBeenCalled();
  });
});
