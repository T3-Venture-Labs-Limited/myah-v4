import { type QueryRunner } from 'typeorm';

import { CreateCampaignForecastProjectionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789992172618-create-campaign-forecast-projection';

describe('Campaign forecast projection FK installation', () => {
  it('only nulls the nullable generation pointer when a referenced generation is deleted', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await new CreateCampaignForecastProjectionFastInstanceCommand().up({
      query,
    } as unknown as QueryRunner);

    const statements = query.mock.calls.map(([sql]: [string]) => sql);

    expect(
      statements.find((sql: string) =>
        sql.includes('FK_CFH_CURRENT_GENERATION'),
      ),
    ).toContain('ON DELETE SET NULL ("currentGenerationId")');
  });
});
