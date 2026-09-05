import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { E2eFixtureGmailMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/gmail/services/e2e-fixture-gmail-message-outbound.service';

describe('E2eFixtureGmailMessageOutboundService', () => {
  const connectedAccount = {
    id: 'fixture-account',
  } as Pick<ConnectedAccountEntity, 'id'> as ConnectedAccountEntity;

  it('counts each blocked fixture provider send without contacting Gmail', async () => {
    const service = new E2eFixtureGmailMessageOutboundService();

    expect(
      E2eFixtureGmailMessageOutboundService.getSendAttemptCount([
        connectedAccount.id,
      ]),
    ).toBe(0);
    await expect(
      service.assertSendable(connectedAccount),
    ).resolves.toBeUndefined();
    await expect(
      service.sendMessage({} as never, connectedAccount),
    ).rejects.toThrow('E2E fixtures never send Gmail messages');
    await expect(
      service.createDraft({} as never, connectedAccount),
    ).rejects.toThrow('E2E fixtures never create Gmail drafts');
    await expect(
      service.sendDraft('fixture-draft', {} as never, connectedAccount),
    ).rejects.toThrow('E2E fixtures never send Gmail messages');
    expect(
      E2eFixtureGmailMessageOutboundService.getSendAttemptCount([
        connectedAccount.id,
      ]),
    ).toBe(2);
    E2eFixtureGmailMessageOutboundService.releaseSendAttemptCounts([
      connectedAccount.id,
    ]);
  });
});
