import { AddCampaignDispatchEvidenceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789066100000-add-campaign-dispatch-evidence';

describe('AddCampaignDispatchEvidenceFastInstanceCommand', () => {
  it('preflights before every mutation and refuses unsafe sequence evidence', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { kind: 'ACCEPTED_SEQUENCE', id: 'attempt-id' },
    ]);
    const command = new AddCampaignDispatchEvidenceFastInstanceCommand();

    await expect(command.up({ query } as never)).rejects.toThrow(
      'preflight refused',
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "source = 'CAMPAIGN_SEQUENCE' AND \"attemptState\" = 'ACCEPTED'",
    );
  });

  it('authors source-scoped evidence, exact render identity, and sweep indexes', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const command = new AddCampaignDispatchEvidenceFastInstanceCommand();

    await command.up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql.indexOf('SELECT \'ACCEPTED_SEQUENCE\'')).toBeLessThan(
      sql.indexOf('ALTER TABLE'),
    );
    expect(sql).toContain("source <> 'CAMPAIGN_SEQUENCE'");
    expect(sql).toContain('UQ_OEA_EXACT_CAMPAIGN_ATTEMPT');
    expect(sql).toContain('FK_COR_EXACT_ATTEMPT');
    expect(sql).toContain('TRG_COR_IMMUTABLE_UPDATE');
    expect(sql).toContain('IDX_CO_DUE_PENDING');
    expect(sql).toContain('IDX_CO_UNRESOLVED');
    expect(sql).toContain('reconciledProviderHeaderMessageId');
    expect(sql).toContain('projectedMessageThreadId');
  });
});
