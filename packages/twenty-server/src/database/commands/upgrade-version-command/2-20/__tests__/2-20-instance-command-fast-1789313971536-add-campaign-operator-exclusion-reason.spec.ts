import { AddCampaignOperatorExclusionReasonFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789313971536-add-campaign-operator-exclusion-reason';

describe('AddCampaignOperatorExclusionReasonFastInstanceCommand', () => {
  it('adds the durable reason to both terminal constraints', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await new AddCampaignOperatorExclusionReasonFastInstanceCommand().up({
      query,
    } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql.match(/OPERATOR_EXCLUDED/g)).toHaveLength(2);
    expect(sql).toContain('CHK_CO_TERMINAL_SHAPE');
    expect(sql).toContain('CHK_CEN_TERMINAL_SHAPE');
  });

  it('refuses to remove retained exclusion evidence', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    await expect(
      new AddCampaignOperatorExclusionReasonFastInstanceCommand().down({
        query,
      } as never),
    ).rejects.toThrow('Cannot remove retained operator exclusion evidence');
  });
});
