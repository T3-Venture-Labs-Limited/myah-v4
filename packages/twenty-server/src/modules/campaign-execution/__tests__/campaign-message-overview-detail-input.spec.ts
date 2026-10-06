import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CampaignMessageOverviewDetailInput } from 'src/modules/campaign-execution/dtos/campaign-message-overview.dto';
import { computeCampaignOccurrenceId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

// MYAH-455: step 1 has a random (v4) occurrence id; later steps get a
// deterministic v5 id. Both must open in the Campaign messages panel.
describe('CampaignMessageOverviewDetailInput', () => {
  const errorsFor = (occurrenceId: string) =>
    validate(
      plainToInstance(CampaignMessageOverviewDetailInput, { occurrenceId }),
    );

  it('accepts a later step (v5) occurrence id', async () => {
    const occurrenceId = computeCampaignOccurrenceId(
      '30fe28cc-ffe9-4245-83ff-9fa4929ab3a2',
      1,
      'b1d8a1a2-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    );

    expect(occurrenceId[14]).toBe('5');
    expect(await errorsFor(occurrenceId)).toHaveLength(0);
  });

  it('accepts a first step (v4) occurrence id', async () => {
    expect(
      await errorsFor('a480dc31-cb93-44eb-b526-83f96885a2e9'),
    ).toHaveLength(0);
  });

  it('rejects a value that is not a UUID', async () => {
    expect(await errorsFor('not-a-uuid')).toHaveLength(1);
  });
});
