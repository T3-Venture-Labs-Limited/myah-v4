import { randomUUID } from 'node:crypto';

import { type QueryRunner, type DataSource } from 'typeorm';

import { CreateMyahSubscriptionAndUsageFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1791215297086-create-myah-subscription-and-usage';
import { VerifyExistingMyahUsersSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1791217440633-verify-existing-myah-users';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';
import { MyahWorkspaceAccess } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';

// All fixture writes, including upgrade DDL, are rolled back per test.
describe('Myah subscription and usage (PostgreSQL)', () => {
  let runner: QueryRunner;
  let workspaceId: string;
  let service: MyahUsageService;
  let state: MyahWorkspaceAccess;
  let periodStart: Date;
  const periodEnd = new Date('2026-11-05T00:00:00Z');

  beforeEach(async () => {
    runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const [workspace] = await runner.query(
      'SELECT id FROM core.workspace LIMIT 1',
    );
    workspaceId = workspace.id;
    state = MyahWorkspaceAccess.ACTIVE;
    periodStart = new Date('2026-10-05T00:00:00Z');
    await runner.query(
      'DELETE FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    service = new MyahUsageService(
      { query: runner.query.bind(runner) } as DataSource,
      {
        getAccess: async () => state,
        getSubscription: async () => ({
          usagePeriodStart: periodStart,
          usagePeriodEnd: periodEnd,
        }),
      } as never,
      { get: () => 30_000_000 } as never,
    );
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  const record = (cost = 30_000_000, sourceKey: string = randomUUID()) =>
    service.record({
      workspaceId,
      costMicrousd: BigInt(cost),
      category: 'AI',
      sourceKey,
    });

  it('creates the schema from scratch, verifies existing users, and preserves rows on replay', async () => {
    await runner.query(
      'DROP TABLE core."myahUsageEntry", core."myahWorkspaceSubscription"',
    );
    await runner.query('UPDATE core."user" SET "isEmailVerified"=false');
    const command = new CreateMyahSubscriptionAndUsageFastInstanceCommand();
    await command.up(runner);
    const verify = new VerifyExistingMyahUsersSlowInstanceCommand({
      get: () => false,
    } as never);
    await verify.runDataMigration({
      query: runner.query.bind(runner),
    } as DataSource);
    await verify.runDataMigration({
      query: runner.query.bind(runner),
    } as DataSource);
    await record(123, 'stable');
    await command.up(runner);
    expect(
      await runner.query('SELECT "costMicrousd" FROM core."myahUsageEntry"'),
    ).toEqual([{ costMicrousd: '123' }]);
    expect(
      await runner.query(
        'SELECT id FROM core."user" WHERE NOT "isEmailVerified"',
      ),
    ).toEqual([]);
  });

  it('counts a source exactly once, refuses AI at the limit, but still allows sends', async () => {
    await record(30_000_000, 'same');
    await record(30_000_000, 'same');
    expect(await service.getUsage(workspaceId)).toMatchObject({
      percentUsed: 100,
      exhausted: true,
    });
    await expect(
      service.assertCanSpend(workspaceId, 'AI'),
    ).rejects.toMatchObject({
      code: 'INCLUDED_USAGE_EXHAUSTED',
      message: expect.stringContaining('It resets on Nov 5, 2026.'),
    });
    await expect(service.assertCanAct(workspaceId)).resolves.toBe(
      MyahWorkspaceAccess.ACTIVE,
    );
  });

  it('ignores non-AI entries and resets only when the paid period changes', async () => {
    await runner.query(
      `INSERT INTO core."myahUsageEntry" ("workspaceId", "usagePeriodStart", category, "costMicrousd", quantity, "sourceKey")
       VALUES ($1, $2, 'INSTAGRAM_ACCOUNT', 5500000, 1, 'legacy-instagram')`,
      [workspaceId, periodStart],
    );
    await record(24_500_000);
    expect(await service.getUsage(workspaceId)).toMatchObject({
      percentUsed: 81,
      exhausted: false,
    });
    await expect(
      service.assertCanSpend(workspaceId, 'AI'),
    ).resolves.toBeUndefined();
    await record(5_500_000);
    state = MyahWorkspaceAccess.PAYMENT_RETRYING;
    await expect(
      service.assertCanSpend(workspaceId, 'AI'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('renewal payment goes through'),
    });
    periodStart = periodEnd;
    state = MyahWorkspaceAccess.ACTIVE;
    expect(await service.getUsage(workspaceId)).toMatchObject({
      percentUsed: 0,
      exhausted: false,
    });
    await expect(
      service.assertCanSpend(workspaceId, 'AI'),
    ).resolves.toBeUndefined();
  });

  it('records complimentary usage with a NULL period and no limit', async () => {
    state = MyahWorkspaceAccess.COMPLIMENTARY;
    await record(99_000_000);
    expect(
      await runner.query(
        'SELECT "usagePeriodStart" FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
        [workspaceId],
      ),
    ).toEqual([{ usagePeriodStart: null }]);
    expect(await service.getUsage(workspaceId)).toMatchObject({
      percentUsed: null,
      exhausted: false,
    });
    await expect(
      service.assertCanSpend(workspaceId, 'AI'),
    ).resolves.toBeUndefined();
  });

  it.each([MyahWorkspaceAccess.NEEDS_SUBSCRIPTION, MyahWorkspaceAccess.LAPSED])(
    'refuses acts and spend for %s',
    async (access) => {
      state = access;
      await expect(service.assertCanAct(workspaceId)).rejects.toMatchObject({
        code: 'SUBSCRIPTION_REQUIRED',
      });
      await expect(
        service.assertCanSpend(workspaceId, 'AI'),
      ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    },
  );

  it('refuses non-AI usage writes', async () => {
    await expect(
      service.record({
        workspaceId,
        category: 'INSTAGRAM_ACCOUNT' as 'AI',
        costMicrousd: BigInt(5_500_000),
        sourceKey: 'rejected-instagram',
      }),
    ).rejects.toThrow('Invalid usage entry');
    expect(
      await runner.query(
        'SELECT id FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
        [workspaceId],
      ),
    ).toEqual([]);
  });

  it('keeps delayed provider costs in the captured period', async () => {
    const captured = periodStart;
    periodStart = periodEnd;
    await service.record({
      workspaceId,
      category: 'AI',
      costMicrousd: BigInt(99),
      sourceKey: 'delayed',
      usagePeriodStart: captured,
    });
    expect(await service.getUsage(workspaceId)).toMatchObject({
      percentUsed: 0,
    });
    expect(
      await runner.query(
        'SELECT "usagePeriodStart" FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
        [workspaceId],
      ),
    ).toEqual([{ usagePeriodStart: captured }]);
  });
});
