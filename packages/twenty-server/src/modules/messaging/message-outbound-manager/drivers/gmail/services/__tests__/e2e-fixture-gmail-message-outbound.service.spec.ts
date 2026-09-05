import { E2eFixtureGmailMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/gmail/services/e2e-fixture-gmail-message-outbound.service';

describe('E2eFixtureGmailMessageOutboundService', () => {
  const connectedAccount = { id: 'fixture-account' } as never;

  it('allows E2E preflight without contacting Gmail and rejects every send path', async () => {
    const service = new E2eFixtureGmailMessageOutboundService();

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
  });
});
