import { MODULE_METADATA } from '@nestjs/common/constants';
import { getMetadataArgsStorage } from 'typeorm';

import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { AddCampaignReplyAmbiguitySnapshotFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000002-add-campaign-reply-ambiguity-snapshot';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { CampaignPartnershipWorkItemEntity } from 'src/engine/core-modules/myah-inbox/entities/campaign-partnership-work-item.entity';

const command = new AddCampaignReplyAmbiguitySnapshotFastInstanceCommand();

describe('Email reply ambiguity snapshot additive storage contract', () => {
  it('registers a new fast identity after F without changing F identity', () => {
    expect(getRegisteredInstanceCommandMetadata(CreateCampaignPartnershipWorkItemFastInstanceCommand))
      .toMatchObject({ version: '2.20.0', timestamp: 1790000000001 });
    expect(getRegisteredInstanceCommandMetadata(AddCampaignReplyAmbiguitySnapshotFastInstanceCommand))
      .toMatchObject({ version: '2.20.0', timestamp: 1790000000002 });
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, V2_20_UpgradeVersionCommandModule) as Function[];
    expect(providers.indexOf(AddCampaignReplyAmbiguitySnapshotFastInstanceCommand))
      .toBe(providers.indexOf(CreateCampaignPartnershipWorkItemFastInstanceCommand) + 1);
  });

  it('retains nullable ORM snapshots, an ambiguity-only CHECK and immutable route fields', () => {
    const storage = getMetadataArgsStorage();
    const columns = storage.columns.filter((column) => column.target === CampaignPartnershipWorkItemEntity);
    for (const name of ['messageChannelId', 'connectedAccountId', 'resolvedThreadExternalId', 'normalizedRecipient']) {
      expect(columns.find((column) => column.propertyName === name)?.options)
        .toMatchObject({ nullable: true, update: false });
    }
    for (const name of ['resolvedByWorkspaceMemberId', 'resolvedAt']) {
      expect(columns.find((column) => column.propertyName === name)?.options.nullable).toBe(true);
    }
    const check = storage.checks.find((entry) => entry.target === CampaignPartnershipWorkItemEntity && entry.name === 'CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY')?.expression;
    expect(check).toContain(`"purpose" <> 'REPLY_AMBIGUITY'`);
    expect(check).toContain(`"state" = 'HELD'`);
    expect(check).toContain('"resolvedByWorkspaceMemberId" IS NOT NULL');
    expect(check).toContain('"resolvedAt" IS NOT NULL');
  });

  it('preflights historical ambiguity rows before DDL and refuses an unknown shape', async () => {
    const query = jest.fn(async (sql: string) => sql.startsWith('SELECT count') ? [{ count: '1' }] : [{ ready: false }]);
    await expect(command.up({ query } as never)).rejects.toThrow('Unknown preexisting reply ambiguity rows');
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('ACCESS EXCLUSIVE MODE'),
      expect.stringContaining(`"purpose" = 'REPLY_AMBIGUITY'`),
      expect.stringContaining('pg_catalog.pg_attribute'),
    ]);
  });

  it('installs only additive columns and immutable snapshot/audit guards and verifies catalog after DDL', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => sql.startsWith('SELECT count') ? [{ count: '0' }] : sql.startsWith('SELECT\n') ? [{ ready: true }] : []);
    await command.up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "messageChannelId" uuid');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "connectedAccountId" uuid');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "resolvedThreadExternalId" text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "normalizedRecipient" text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "resolvedByWorkspaceMemberId" uuid');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "resolvedAt" timestamptz');
    expect(sql).toContain('BEFORE INSERT OR UPDATE');
    expect(sql).toContain(`NEW."purpose" = 'REPLY_AMBIGUITY'`);
    expect(sql).toContain('NEW."participationId" IS NOT NULL');
    expect(sql).toContain('NEW."resolvedThreadExternalId" IS DISTINCT FROM OLD."resolvedThreadExternalId"');
    expect(sql).toContain('NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt"');
    expect(sql).toContain('"normalizedRecipient" = lower(btrim("normalizedRecipient"))');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('UPDATE core."campaignPartnershipWorkItem"');
    const catalogCall = query.mock.calls[query.mock.calls.length - 2];
    const [catalog, expectedBody] = [catalogCall[0], catalogCall[1]?.[0]];
    expect(catalog).toContain('pg_get_expr(c.conbin, c.conrelid) = (SELECT pg_catalog.pg_get_expr(probe.conbin, probe.conrelid)');
    expect(catalog).toContain('p.prosrc = $1');
    expect(catalog).toContain("p.provolatile = 'v'");
    expect(catalog).toContain('NOT p.prosecdef');
    expect(catalog).toContain('NOT p.proisstrict');
    expect(catalog).toContain('p.proconfig IS NULL');
    expect(catalog).toContain('NOT c.connoinherit');
    expect(catalog).toContain('t.tgtype = 23');
    expect(sql).toContain('email-message:');
    expect(expectedBody).toContain('Ambiguity provider coordinates are immutable');
  });

  it('rechecks the entire physical contract on an occupied exact rerun without touching existing evidence', async () => {
    const query = jest.fn(async (sql: string) => sql.startsWith('SELECT count') ? [{ count: '1' }] :
      sql.includes('AS present') ? [{ present: true }] : sql.startsWith('SELECT\n') ? [{ ready: true }] : []);
    await command.up({ query } as never);
    const statements = query.mock.calls.map(([statement]) => statement);
    expect(statements).toHaveLength(6); // lock, count, installed, probe, catalog, probe removal
    expect(statements.join('\n')).not.toContain('ADD COLUMN IF NOT EXISTS');
    expect(statements[4]).toContain('pg_catalog.pg_trigger');
    expect(statements[5]).toContain('DROP CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY_PROBE"');
  });

  it('rejects incompatible catalog on completion or rerun instead of trusting IF NOT EXISTS', async () => {
    const query = jest.fn(async (sql: string) => sql.startsWith('SELECT count') ? [{ count: '0' }] : sql.startsWith('SELECT\n') ? [{ ready: false }] : []);
    await expect(command.up({ query } as never)).rejects.toThrow('physical contract is incomplete');
    expect(query.mock.calls[query.mock.calls.length - 2][0]).toContain('pg_catalog.pg_attribute');
    const occupied = jest.fn(async (sql: string) => sql.startsWith('SELECT count') ? [{ count: '1' }] :
      sql.includes('AS present') ? [{ present: true }] : sql.startsWith('SELECT\n') ? [{ ready: false }] : []);
    await expect(command.up({ query: occupied } as never)).rejects.toThrow('physical contract is incomplete');
    expect(occupied.mock.calls.map(([statement]) => statement).join('\n')).not.toContain('ADD COLUMN IF NOT EXISTS');
    expect(occupied.mock.calls[occupied.mock.calls.length - 1][0]).toContain('DROP CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY_PROBE"');
  });

  it('refuses lossy rollback and leaves F table/function untouched', async () => {
    const blocked = jest.fn(async (sql: string) => sql.startsWith('SELECT\n') ? [{ ready: true }] : sql.startsWith('SELECT EXISTS') ? [{ occupied: true }] : []);
    await expect(command.down({ query: blocked } as never)).rejects.toThrow('persisted evidence');
    expect(blocked).toHaveBeenCalledTimes(5);
    const empty = jest.fn(async (sql: string) => sql.startsWith('SELECT\n') ? [{ ready: true }] : sql.startsWith('SELECT EXISTS') ? [{ occupied: false }] : []);
    await command.down({ query: empty } as never);
    const sql = empty.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql.indexOf('ACCESS EXCLUSIVE MODE')).toBeLessThan(sql.indexOf('SELECT EXISTS'));
    expect(sql).toContain('DROP CONSTRAINT "CHK_CAMPAIGN_PARTNERSHIP_REPLY_AMBIGUITY"');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('protectCampaignPartnershipWorkItemIdentity');
  });
});
