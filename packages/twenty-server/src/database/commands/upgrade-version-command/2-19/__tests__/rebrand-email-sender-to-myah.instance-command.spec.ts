import { type DataSource, type QueryRunner } from 'typeorm';

import { RebrandEmailSenderToMyahSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784005792206-rebrand-email-sender-to-myah';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('RebrandEmailSenderToMyahSlowInstanceCommand', () => {
  const command = new RebrandEmailSenderToMyahSlowInstanceCommand();

  it('rebrands only the persisted legacy global sender default', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const dataSource = { query } as unknown as DataSource;

    await command.runDataMigration(dataSource);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "core"."keyValuePair"'),
      ['Myah', 'Felix from Twenty'],
    );
    expect(query.mock.calls[0][0]).toContain('"userId" IS NULL');
    expect(query.mock.calls[0][0]).toContain('"workspaceId" IS NULL');
    expect(query.mock.calls[0][0]).toContain('value = to_jsonb($2::text)');
  });

  it('restores the legacy sender only when the migration changed it', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;

    await command.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "core"."keyValuePair"'),
      ['Felix from Twenty', 'Myah'],
    );
    expect(query.mock.calls[0][0]).toContain('value = to_jsonb($2::text)');
  });

  it('runs its global sender backfill without workspaces', () => {
    expect(command.runDataMigrationWithoutWorkspaces).toBe(true);
  });

  it('registers as a slow data migration', () => {
    expect(
      getRegisteredInstanceCommandMetadata(
        RebrandEmailSenderToMyahSlowInstanceCommand,
      ),
    ).toMatchObject({ type: 'slow', version: '2.19.0' });
  });
});
