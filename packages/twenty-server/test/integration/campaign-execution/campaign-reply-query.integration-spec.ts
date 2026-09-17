import { randomUUID } from 'node:crypto';

import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

describe('Campaign reply PostgreSQL query', () => {
  it('allows ordinary inbound evidence with no matching Campaign attempt', async () => {
    const progression = { terminalizeReplyInTransaction: jest.fn() };
    const service = new CampaignReplyService(progression as never);
    const runner = global.testDataSource.createQueryRunner();

    await runner.connect();
    await runner.startTransaction();

    try {
      await expect(
        service.reconcileInboundMessageInTransaction(
          {
            workspaceId: randomUUID(),
            messageChannelId: randomUUID(),
            threadExternalId: 'ordinary-thread',
            fromHandle: 'sender@example.com',
            inboundEvidenceId: randomUUID(),
          },
          runner.manager as never,
        ),
      ).resolves.toBeUndefined();
      expect(progression.terminalizeReplyInTransaction).not.toHaveBeenCalled();
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
