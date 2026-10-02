import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { CreateCampaignEmailWorkCollisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000007-create-campaign-email-work-collision';

describe('additive Campaign Email collision evidence', () => {
  it('registers after 0006 and installs immutable, workspace-bound, replay-safe source evidence', async () => {
    expect(getRegisteredInstanceCommandMetadata(CreateCampaignEmailWorkCollisionFastInstanceCommand))
      .toMatchObject({ version: '2.20.0', timestamp: 1790000000007, type: 'fast' });
    const sql: string[] = [];
    await new CreateCampaignEmailWorkCollisionFastInstanceCommand().up({
      query: jest.fn(async (statement: string) => {
        sql.push(statement);
        return statement.startsWith('SELECT') ? [{ ready: true }] : [];
      }),
    } as never);
    const executed = sql.join('\n');
    for (const name of ['canonicalMessageId', 'messageThreadId', 'messageChannelId', 'connectedAccountId',
      'accountIncarnationId', 'providerMessageId', 'providerThreadId', 'creatorSender', 'accountRecipient', 'originalWorkId']) {
      expect(executed).toContain(`"${name}"`);
    }
    expect(executed).toContain('FOREIGN KEY ("workspaceId", "originalWorkId", "messageChannelId", "connectedAccountId"');
    expect(executed).toContain('UNIQUE ("workspaceId", "canonicalMessageId", "messageChannelId", "accountIncarnationId", "providerMessageId", "sourceFingerprint")');
    expect(executed).toContain('"sourceFingerprint" ~ \'^[0-9a-f]{64}$\'');
    expect(executed).toContain('Campaign Email collision evidence is immutable');
    expect(executed).toContain('BEFORE UPDATE OR DELETE');
  });
});
