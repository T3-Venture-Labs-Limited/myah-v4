import { type QueryRunner } from 'typeorm';

import { CreateCampaignEmailBaselineFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000004-create-campaign-email-baseline';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

const command = new CreateCampaignEmailBaselineFastInstanceCommand();

it('registers one additive fast command after G without changing F/G/B identities', () => {
  expect(
    getRegisteredInstanceCommandMetadata(CreateCampaignEmailBaselineFastInstanceCommand),
  ).toMatchObject({ version: '2.20.0', timestamp: 1790000000004, type: 'fast' });
});

it('creates only default-inert generation and per-provider-ID disposition tables', async () => {
  const query = jest.fn().mockResolvedValue([]);

  await command.up({ query } as unknown as QueryRunner);

  const sql = query.mock.calls.map(([statement]) => statement).join('\n');
  expect(sql).toContain('CREATE TABLE core."campaignEmailBaselineGeneration"');
  expect(sql).toContain('CREATE TABLE core."campaignEmailBaselineItem"');
  expect(sql).toContain('"messageChannelId" uuid NOT NULL');
  expect(sql).toContain('"connectedAccountId" uuid NOT NULL');
  expect(sql).toContain('"accountIncarnationId" uuid NOT NULL');
  expect(sql).toContain('"providerMessageId" varchar(512) NOT NULL');
  expect(sql).toContain("'LISTED', 'IMPORTED', 'EXCLUDED', 'FAILED'");
  expect(sql).toContain('PRIMARY KEY ("generationId", "providerMessageId")');
  expect(sql).toContain('WHERE "isCurrent"');
  expect(sql).toContain('"completedAt" timestamptz');
  expect(sql).toContain('Campaign Email baseline has unresolved provider items');
  expect(sql).toContain('Campaign Email baseline evidence is sealed');
  expect(sql).toContain('FOR SHARE');
  expect(sql).not.toContain('partnershipOfferVersion');
  expect(sql).not.toContain('partnershipObligation');
});

it('refuses rollback when any generation evidence exists', async () => {
  const query = jest.fn().mockResolvedValueOnce([{ hasRows: true }]);

  await expect(command.down({ query } as unknown as QueryRunner)).rejects.toThrow(
    'Cannot remove Campaign Email baseline evidence',
  );
  expect(query).toHaveBeenCalledTimes(1);
});

it('removes empty tables and their guards without touching other data', async () => {
  const query = jest.fn().mockResolvedValueOnce([{ hasRows: false }]);

  await command.down({ query } as unknown as QueryRunner);

  expect(query.mock.calls.map(([sql]) => sql)).toEqual([
    'SELECT EXISTS (SELECT 1 FROM core."campaignEmailBaselineGeneration") AS "hasRows"',
    'DROP TABLE core."campaignEmailBaselineItem"',
    'DROP TABLE core."campaignEmailBaselineGeneration"',
    'DROP FUNCTION core."guardCampaignEmailBaselineItem"()',
    'DROP FUNCTION core."guardCampaignEmailBaselineGeneration"()',
  ]);
});
