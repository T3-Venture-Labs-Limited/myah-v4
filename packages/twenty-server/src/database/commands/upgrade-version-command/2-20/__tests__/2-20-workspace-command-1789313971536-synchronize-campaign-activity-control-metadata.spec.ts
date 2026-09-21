import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { SynchronizeCampaignActivityControlMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971536-synchronize-campaign-activity-control-metadata.command';

describe('SynchronizeCampaignActivityControlMetadataCommand', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';

  const buildCommand = (stageType: 'TEXT' | 'SELECT' = 'SELECT') => {
    const workspaceQuery = jest.fn().mockResolvedValue([]);
    const runnerQuery = jest.fn<
      Promise<unknown[]>,
      [string, unknown[]?]
    >(async (sql: string) => {
      if (sql.includes('FROM core."fieldMetadata"')) {
        return [{ id: 'stage-field-id', type: stageType }];
      }
      if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
      if (sql.includes('FROM pg_type')) return [{ labels: null }];
      if (sql.includes('UPDATE core."fieldMetadata"')) {
        return [{ count: 1 }];
      }
      return [];
    });
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: runnerQuery,
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const synchronizeWorkspace = jest.fn().mockResolvedValue(undefined);
    const flush = jest.fn().mockResolvedValue(undefined);
    const incrementMetadataVersion = jest.fn().mockResolvedValue(undefined);
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
        flush,
      } as never,
      { incrementMetadataVersion } as never,
    );

    return {
      command,
      dataSource: {
        query: workspaceQuery,
        createQueryRunner: jest.fn(() => queryRunner),
      },
      flush,
      incrementMetadataVersion,
      queryRunner,
      runnerQuery,
      synchronizeWorkspace,
      workspaceQuery,
    };
  };

  it('replays only retained facts with deterministic conflict suppression', async () => {
    const { command, dataSource, synchronizeWorkspace, workspaceQuery } =
      buildCommand();

    await command.runOnWorkspace({
      workspaceId,
      dataSource,
      options: { dryRun: false },
    } as never);

    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    expect(workspaceQuery).toHaveBeenCalledTimes(1);
    const sql = workspaceQuery.mock.calls[0][0] as string;
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
    expect(workspaceQuery.mock.calls[0][1]).toEqual([workspaceId]);
  });

  it('converts a legacy TEXT stage atomically and keeps the field identity', async () => {
    const {
      command,
      dataSource,
      flush,
      incrementMetadataVersion,
      queryRunner,
      runnerQuery,
    } = buildCommand('TEXT');

    await command.runOnWorkspace({
      workspaceId,
      dataSource,
      options: { dryRun: false },
    } as never);

    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(
      runnerQuery.mock.calls.some(([sql]) =>
        sql.includes('ALTER COLUMN stage TYPE'),
      ),
    ).toBe(true);
    const metadataUpdate = runnerQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE core."fieldMetadata"'),
    );
    expect(metadataUpdate?.[1]).toEqual(
      expect.arrayContaining(['stage-field-id']),
    );
    expect(flush).toHaveBeenCalledWith(workspaceId, [
      'flatFieldMetadataMaps',
    ]);
    expect(incrementMetadataVersion).toHaveBeenCalledWith(workspaceId);
  });

  it('rejects unknown legacy values before mutation and rolls back', async () => {
    const {
      command,
      dataSource,
      incrementMetadataVersion,
      queryRunner,
      runnerQuery,
      synchronizeWorkspace,
    } = buildCommand('TEXT');
    runnerQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM core."fieldMetadata"')) {
        return [{ id: 'stage-field-id', type: 'TEXT' }];
      }
      if (sql.includes('SELECT EXISTS')) return [{ exists: true }];
      return [];
    });

    await expect(
      command.runOnWorkspace({
        workspaceId,
        dataSource,
        options: { dryRun: false },
      } as never),
    ).rejects.toThrow('unsupported legacy values');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(
      runnerQuery.mock.calls.some(([sql]) =>
        sql.includes('UPDATE core."fieldMetadata"'),
      ),
    ).toBe(false);
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('leaves an existing SELECT stage unchanged on retries', async () => {
    const { command, dataSource, incrementMetadataVersion, runnerQuery } =
      buildCommand('SELECT');

    await command.runOnWorkspace({
      workspaceId,
      dataSource,
      options: { dryRun: false },
    } as never);

    expect(runnerQuery).toHaveBeenCalledTimes(1);
    expect(incrementMetadataVersion).not.toHaveBeenCalled();
  });

  it('does not write retained facts or convert stage during a dry run', async () => {
    const { command, dataSource, workspaceQuery } = buildCommand('TEXT');

    await command.runOnWorkspace({
      workspaceId,
      dataSource,
      options: { dryRun: true },
    } as never);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(workspaceQuery).not.toHaveBeenCalled();
  });
});
