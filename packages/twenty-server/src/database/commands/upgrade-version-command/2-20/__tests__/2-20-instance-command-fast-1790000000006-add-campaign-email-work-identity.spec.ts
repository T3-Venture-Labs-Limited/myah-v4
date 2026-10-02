import { getMetadataArgsStorage } from 'typeorm';

import { CampaignPartnershipWorkItemEntity } from 'src/engine/core-modules/myah-inbox/entities/campaign-partnership-work-item.entity';
import { AddCampaignEmailWorkIdentityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000006-add-campaign-email-work-identity';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('additive Email reply work identity', () => {
  const command = new AddCampaignEmailWorkIdentityFastInstanceCommand();
  it('registers a new receipt after 0005 and keeps source identity immutable', async () => {
    expect(getRegisteredInstanceCommandMetadata(AddCampaignEmailWorkIdentityFastInstanceCommand))
      .toMatchObject({ version: '2.20.0', timestamp: 1790000000006, type: 'fast' });
    const sql: string[] = [];
    const runner = { query: jest.fn(async (query: string) => { sql.push(query); return [{ ready: true }]; }) };
    await command.up(runner as never);
    const executed = sql.join('\n');
    for (const field of ['providerMessageId', 'accountIncarnationId', 'canonicalMessageId', 'creatorSender',
      'accountRecipient', 'providerThreadId', 'baselineGenerationId', 'messageThreadId', 'providerOccurredAt', 'resolvedCampaignId', 'resolvedCreatorId']) {
      expect(executed).toContain(`"${field}"`);
    }
    expect(executed).toContain('UNIQUE INDEX');
    expect(executed).toContain('BEFORE UPDATE');
    expect(executed).toContain('Campaign Email work participation snapshot is immutable');
    expect(executed).not.toContain('DROP TABLE');
  });

  it('maps every nullable 0006 source and resolution column without changing legacy work', async () => {
    const metadata = getMetadataArgsStorage();
    const columns = metadata.columns.filter((entry) => entry.target === CampaignPartnershipWorkItemEntity);
    const immutableSource = ['canonicalMessageId', 'messageThreadId', 'providerMessageId',
      'accountIncarnationId', 'providerThreadId', 'creatorSender', 'accountRecipient',
      'baselineGenerationId', 'providerOccurredAt'];
    for (const name of [...immutableSource, 'resolvedCampaignId', 'resolvedCreatorId']) {
      expect(columns.find((entry) => entry.propertyName === name)?.options.nullable).toBe(true);
    }
    for (const name of immutableSource) {
      expect(columns.find((entry) => entry.propertyName === name)?.options.update).toBe(false);
    }
    expect(metadata.indices.find((entry) => entry.target === CampaignPartnershipWorkItemEntity &&
      entry.name === 'UQ_CAMPAIGN_EMAIL_WORK_PROVIDER_ITEM')).toMatchObject({
      columns: ['workspaceId', 'messageChannelId', 'accountIncarnationId', 'providerMessageId'],
      unique: true,
      where: '"providerMessageId" IS NOT NULL',
    });
    const entityCheck = metadata.checks.find((entry) => entry.target === CampaignPartnershipWorkItemEntity &&
      entry.name === 'CHK_CAMPAIGN_EMAIL_WORK_IDENTITY')?.expression;
    const queries: string[] = [];
    await command.up({ query: jest.fn(async (statement: string) => {
      queries.push(statement);
      return statement.startsWith('SELECT') ? [{ ready: true }] : [];
    }) } as never);
    const installed = queries.find((statement) => statement.includes('ADD CONSTRAINT "CHK_CAMPAIGN_EMAIL_WORK_IDENTITY"'))
      ?.match(/ADD CONSTRAINT "CHK_CAMPAIGN_EMAIL_WORK_IDENTITY" CHECK \(([\s\S]*?)\n      \)/)?.[1];
    const compact = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim();
    expect(compact(entityCheck)).toBe(compact(installed));
  });
});
