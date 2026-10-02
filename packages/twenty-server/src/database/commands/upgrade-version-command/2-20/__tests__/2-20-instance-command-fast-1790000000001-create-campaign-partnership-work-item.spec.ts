import { MODULE_METADATA } from '@nestjs/common/constants';
import { getMetadataArgsStorage } from 'typeorm';

import { CreateCampaignPartnershipWorkItemFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000001-create-campaign-partnership-work-item';
import { V2_20_UpgradeVersionCommandModule } from 'src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { CampaignPartnershipWorkItemEntity } from 'src/engine/core-modules/myah-inbox/entities/campaign-partnership-work-item.entity';

describe('campaign partnership work item storage contract', () => {
  it('retains the fast instance registration for genuine fresh initialization', () => {
    expect(
      getRegisteredInstanceCommandMetadata(
        CreateCampaignPartnershipWorkItemFastInstanceCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1790000000001 });
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        V2_20_UpgradeVersionCommandModule,
      ),
    ).toContain(CreateCampaignPartnershipWorkItemFastInstanceCommand);
  });

  it('keeps canonical trigger identity immutable and independent of attribution', () => {
    const metadata = getMetadataArgsStorage();
    const columns = metadata.columns.filter(
      (column) => column.target === CampaignPartnershipWorkItemEntity,
    );
    const identity = ['workspaceId', 'triggerKey', 'purpose'];

    for (const name of identity) {
      expect(
        columns.find((column) => column.propertyName === name)?.options.update,
      ).toBe(false);
    }
    expect(
      columns.find((column) => column.propertyName === 'participationId')
        ?.options.nullable,
    ).toBe(true);
    expect(
      metadata.indices.find(
        (index) =>
          index.target === CampaignPartnershipWorkItemEntity &&
          index.name === 'UQ_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER',
      )?.columns,
    ).toEqual(identity);
  });

  it('creates only its own table, full dedup index and database-enforced immutable identity', async () => {
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) =>
      sql.startsWith('SELECT') ? [{ ready: true }] : [],
    );
    const command = new CreateCampaignPartnershipWorkItemFastInstanceCommand();

    await command.up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS core."campaignPartnershipWorkItem"',
    );
    expect(sql).toContain(
      'REFERENCES core."workspace"("id") ON DELETE CASCADE',
    );
    expect(sql).toContain('"workspaceId", "triggerKey", "purpose"');
    const triggerPattern = sql.match(/"triggerKey" ~ '([^']+)'/)?.[1];
    const entityPattern = getMetadataArgsStorage().checks.find(
      (check) =>
        check.target === CampaignPartnershipWorkItemEntity &&
        check.name === 'CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER',
    )?.expression;

    expect(entityPattern).toBe(`"triggerKey" ~ '${triggerPattern}'`);
    const canonicalKey = new RegExp(triggerPattern as string);
    const uuid = '12345678-1234-1234-1234-123456789abc';

    for (const source of [
      'email-message',
      'instagram-message',
      'due-check',
      'participation-event',
    ]) {
      expect(canonicalKey.test(`${source}:${uuid}`)).toBe(true);
    }
    for (const badKey of [
      'provider-message:' + uuid,
      'email-message:not-a-uuid',
      `due-check:${uuid}:extra`,
      `instagram-message:${uuid.toUpperCase()}`,
    ]) {
      expect(canonicalKey.test(badKey)).toBe(false);
    }
    expect(sql).toContain('"participationId" uuid');
    expect(sql).toContain(
      '"participationId" IS NOT NULL OR "state" = \'HELD\'',
    );
    expect(sql).toContain('"contextGeneration" >= 0');
    expect(sql).not.toMatch(/UNIQUE[^;]*"participationId"/);
    expect(sql).toContain('NEW."triggerKey" IS DISTINCT FROM OLD."triggerKey"');
    expect(sql).toContain(
      'NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"',
    );
    expect(sql).toContain('NEW."purpose" IS DISTINCT FROM OLD."purpose"');
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain(
      'NEW."participationId" IS DISTINCT FROM OLD."participationId"',
    );
    expect(sql).toContain(
      'OLD."participationId" IS NULL AND NEW."participationId" IS NOT NULL',
    );
    expect(sql).toContain('AND OLD."state" = \'HELD\'');
    expect(sql).toContain(`OLD."state" = 'COMPLETED' AND (`);
    for (const reference of [
      'candidateId',
      'draftId',
      'actionId',
      'receiptId',
    ]) {
      expect(sql).toContain(
        `NEW."${reference}" IS DISTINCT FROM OLD."${reference}"`,
      );
    }
    expect(sql).toContain('"contextGeneration" integer NOT NULL DEFAULT 0');
    expect(sql).toContain('"attempts" integer NOT NULL DEFAULT 0');
    expect(sql).toContain('"leaseToken" uuid');
    expect(sql).toContain('"nextDueAt" timestamptz');
    expect(sql).toContain('"receiptId" uuid');
    expect(sql).not.toContain('bodyMarkdown');
    expect(sql).not.toContain('providerState');
    const catalogSql = query.mock.calls[query.mock.calls.length - 1][0];

    expect(catalogSql).toContain('pg_catalog.pg_attribute');
    // IF NOT EXISTS must not accept a same-named partial, unique, wrong-key,
    // or wrong-method index as the due-time access path.
    expect(catalogSql).toContain(
      'JOIN pg_catalog.pg_am am ON am.oid = idx.relam',
    );
    expect(catalogSql).toContain('AND NOT i.indisunique AND i.indpred IS NULL');
    expect(catalogSql).toContain("i.indnkeyatts = 2 AND am.amname = 'btree'");
    expect(catalogSql).toContain(
      "pg_catalog.pg_get_indexdef(i.indexrelid, 1, true) = 'state'",
    );
    expect(catalogSql).toContain(
      `pg_catalog.pg_get_indexdef(i.indexrelid, 2, true) = '"nextDueAt"'`,
    );
    expect(catalogSql).toContain(
      `t.tgfoid = to_regprocedure('core."protectCampaignPartnershipWorkItemIdentity"()')`,
    );
    expect(catalogSql).toContain("t.tgenabled IN ('O', 'A')");
    expect(catalogSql).toContain('t.tgtype = 19');
    expect(catalogSql).toContain('t.tgqual IS NULL');
    expect(catalogSql).toContain("t.tgattr = ''::int2vector");
    expect(catalogSql).toContain(
      "p.prorettype = 'pg_catalog.trigger'::regtype",
    );
    expect(catalogSql).toContain("p.pronargs = 0 AND l.lanname = 'plpgsql'");
    expect(catalogSql).toContain('p.prosrc = $1');
    const installedBody = sql.match(/LANGUAGE plpgsql AS \$\$(.*?)\$\$/s)?.[1];

    expect(installedBody).toContain(
      'Campaign partnership work identity is immutable',
    );
    expect(query.mock.calls[query.mock.calls.length - 1][1]).toEqual([
      installedBody,
    ]);
  });

  it('rejects an incompatible physical shape after DDL, before successful completion', async () => {
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) =>
      sql.startsWith('SELECT') ? [{ ready: false }] : [],
    );

    await expect(
      new CreateCampaignPartnershipWorkItemFastInstanceCommand().up({
        query,
      } as never),
    ).rejects.toThrow(
      'Campaign partnership work physical contract is incomplete',
    );
    expect(query.mock.calls[query.mock.calls.length - 2][0]).toContain(
      'CREATE TRIGGER "TRG_CAMPAIGN_PARTNERSHIP_WORK_ITEM_IDENTITY"',
    );
    expect(query.mock.calls[query.mock.calls.length - 1][0]).toContain(
      'pg_catalog.pg_attribute',
    );
  });

  it('refuses lossy rollback under a table lock and drops only an empty owned table', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new CreateCampaignPartnershipWorkItemFastInstanceCommand().down({
      query,
    } as never);
    const [guard, functionDrop] = query.mock.calls.map(
      ([statement]) => statement,
    );

    expect(guard).toContain(
      'LOCK TABLE core."campaignPartnershipWorkItem" IN ACCESS EXCLUSIVE MODE',
    );
    expect(guard.indexOf('LOCK TABLE')).toBeLessThan(
      guard.indexOf('IF EXISTS (SELECT 1'),
    );
    expect(guard.indexOf('RAISE EXCEPTION')).toBeLessThan(
      guard.indexOf('DROP TABLE'),
    );
    expect(guard).toContain('DROP TABLE core."campaignPartnershipWorkItem"');
    expect(functionDrop).toContain(
      'DROP FUNCTION IF EXISTS core."protectCampaignPartnershipWorkItemIdentity"()',
    );
    expect(guard + functionDrop).not.toContain('CASCADE');
    expect(query).toHaveBeenCalledTimes(2);

    const blockedQuery = jest
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Cannot drop campaign partnership work items with persisted rows',
        ),
      );
    await expect(
      new CreateCampaignPartnershipWorkItemFastInstanceCommand().down({
        query: blockedQuery,
      } as never),
    ).rejects.toThrow('persisted rows');
    expect(blockedQuery).toHaveBeenCalledTimes(1);
  });
});
