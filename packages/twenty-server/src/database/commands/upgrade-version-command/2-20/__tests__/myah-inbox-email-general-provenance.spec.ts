import { CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand } from '../2-20-instance-command-fast-1789645911003-create-myah-inbox-email-general-provenance';
import { InstallMyahInboxEmailGeneralProvenanceCommand } from '../2-20-workspace-command-1789645911004-install-myah-inbox-email-general-provenance.command';

const workspaceId = '40000000-0000-4000-8000-000000000001';

const schemaAwareDataSource = (
  query: jest.Mock,
  schemaExists = true,
) => ({
  transaction: jest.fn(async (run) => run({ query })),
  createQueryRunner: jest.fn(() => ({
    connect: jest.fn(async () => undefined),
    hasSchema: jest.fn(async () => schemaExists),
    release: jest.fn(async () => undefined),
  })),
});

describe('Email General provenance Release A SQL contract', () => {
  it('attests only anchored unassociated inserts and retains revoked tombstones', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new CreateMyahInboxEmailGeneralProvenanceFastInstanceCommand().up({ query } as never);
    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain('"workspaceId", "deliveryTargetId"');
    expect(sql).toContain("TG_OP = 'INSERT'");
    expect(sql).toContain('NEW."creatorId" IS NOT NULL');
    expect(sql).toContain('NEW."myahCampaignId" IS NULL');
    expect(sql).toContain('NEW."deletedAt" IS NULL');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain("TG_OP = 'DELETE'");
    expect(sql).toContain('NEW."creatorId" IS DISTINCT FROM OLD."creatorId"');
    expect(sql).toContain('NEW."myahCampaignId" IS DISTINCT FROM OLD."myahCampaignId"');
    expect(sql).toContain('NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt"');
    expect(sql).toContain('NEW.id IS DISTINCT FROM OLD.id');
    expect(sql).toContain('SET "revokedAt" =');
    expect(sql).not.toContain('DELETE FROM core."myahInboxEmailGeneralProvenance"');
  });

  it('installs transactionally in Release A without backfill, draft copy or activation', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const dataSource = schemaAwareDataSource(query);
    const command = new InstallMyahInboxEmailGeneralProvenanceCommand({} as never, dataSource as never);
    await command.runOnWorkspace({ workspaceId, options: {} } as never);
    const sql = query.mock.calls.flat().join('\n');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE');
    expect(sql).toContain('workspace_3sehh9hzsgs50mn757ntags1t');
    expect(sql).toContain(workspaceId);
    expect(sql).not.toContain('INSERT INTO');
    expect(sql).not.toContain('myahInboxReplyContextDraft');
    expect(sql).not.toContain('keyValuePair');
    query.mockClear();
    await command.runOnWorkspace({ workspaceId, options: { dryRun: true } } as never);
    expect(query).not.toHaveBeenCalled();
  });
  it('skips workspaces without a provisioned schema instead of failing the upgrade run', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const dataSource = schemaAwareDataSource(query, false);
    const command = new InstallMyahInboxEmailGeneralProvenanceCommand({} as never, dataSource as never);

    await expect(
      command.runOnWorkspace({ workspaceId, options: {} } as never),
    ).resolves.toBeUndefined();

    // No trigger DDL is attempted against a schema that does not exist.
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects non-UUID trigger arguments before constructing or executing DDL', async () => {
    const transaction = jest.fn();
    const command = new InstallMyahInboxEmailGeneralProvenanceCommand({} as never, { transaction } as never);
    await expect(command.runOnWorkspace({ workspaceId: "x'); DROP SCHEMA core; --", options: {} } as never)).rejects.toThrow('Invalid workspace ID');
    expect(transaction).not.toHaveBeenCalled();
  });

});
