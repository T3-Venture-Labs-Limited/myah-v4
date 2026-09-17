import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { SynchronizeCampaignActivityControlMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-synchronize-campaign-activity-control-metadata.command';

describe('SynchronizeCampaignActivityControlMetadataCommand', () => {
  it('replays only retained facts with deterministic conflict suppression', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const command = new SynchronizeCampaignActivityControlMetadataCommand(
      {} as never,
      { synchronizeWorkspace } as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: {
              [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {},
            },
          },
        }),
      } as never,
    );

    await command.runOnWorkspace({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      dataSource: { query },
      options: { dryRun: false },
    } as never);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('campaignActivation');
    expect(sql).toContain('campaignEnrollment');
    expect(sql).toContain('campaignOccurrence');
    expect(sql).toContain("a.\"attemptState\"='ACCEPTED'");
    expect(sql).toContain('cc."excludedAt" IS NOT NULL');
    expect(sql).toContain("'terminal:occurrence:'||o.id||':'||");
    expect(sql).toContain("'terminal:enrollment:'||e.id||':'||");
    expect(sql).toContain("e.state IN ('FINISHED','EXCLUDED')");
    expect(sql).toContain("'campaignId',\"campaignId\"");
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).not.toContain("'HELD'");
    expect(sql).not.toContain("'REPLIED'");
    expect(query.mock.calls[0][1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('does not write retained facts during a dry run', async () => {
    const query = jest.fn();
    const command = new SynchronizeCampaignActivityControlMetadataCommand(
      {} as never,
      { synchronizeWorkspace: jest.fn() } as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatObjectMetadataMaps: {
            byUniversalIdentifier: {
              [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {},
            },
          },
        }),
      } as never,
    );

    await command.runOnWorkspace({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      dataSource: { query },
      options: { dryRun: true },
    } as never);

    expect(query).not.toHaveBeenCalled();
  });
});
