import { type QueryRunner } from 'typeorm';

import { AddCampaignEmailAccountIncarnationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000005-add-campaign-email-account-incarnation';

const command = new AddCampaignEmailAccountIncarnationFastInstanceCommand();

it('adds an independent incarnation to every existing and new connected account without changing 0004', async () => {
  const query = jest.fn().mockResolvedValue([]);
  await command.up({ query } as unknown as QueryRunner);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE core."connectedAccount"'));
  expect(query).toHaveBeenCalledWith(expect.stringContaining('"campaignEmailIncarnationId" uuid NOT NULL DEFAULT uuid_generate_v4()'));
  expect(query.mock.calls.join('\n')).not.toContain('ALTER TABLE core."campaignEmailBaselineGeneration"');
});

it('will not discard an incarnation while baseline evidence exists', async () => {
  const query = jest.fn().mockResolvedValue([{ hasEvidence: true }]);
  await expect(command.down({ query } as unknown as QueryRunner)).rejects.toThrow('baseline evidence');
  expect(query).toHaveBeenCalledTimes(1);
});
