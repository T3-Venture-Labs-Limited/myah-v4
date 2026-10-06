import { randomUUID } from 'node:crypto';
import { DataSource, type DataSourceOptions, type QueryRunner } from 'typeorm';

import { typeORMCoreModuleOptions } from 'src/database/typeorm/core/core.datasource';
import { MyahCampaignAgentSettingEntity } from 'src/engine/core-modules/myah-agent/entities/myah-campaign-agent-setting.entity';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { UnipileInstagramSubscriptionLapseJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-subscription-lapse.job';
import { UnipileInstagramAccountProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-account-projection.service';
import { UnipileReadError } from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';
import { MyahWorkspaceAccessService } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { UnipileHostedAuthAttemptEntity } from 'src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileHostedAuthService } from 'src/modules/myah-unipile/services/unipile-hosted-auth.service';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';

// Persisted access, usage, attempts, bindings and workspace projections; providers stubbed.
// Every write stays in the rolled-back local fixture.
describe('Myah Instagram access and AI-only allowance (PostgreSQL)', () => {
  const source = new DataSource(typeORMCoreModuleOptions as DataSourceOptions);
  let runner: QueryRunner;
  let workspace: WorkspaceEntity;
  let userWorkspaceId: string;
  let access: MyahWorkspaceAccessService;
  let usage: MyahUsageService;
  let hostedAuth: UnipileHostedAuthService;
  let accounts: UnipileInstagramAccountService;
  let lapseJob: UnipileInstagramSubscriptionLapseJob;
  const queue = { add: jest.fn() };
  let complimentary: boolean;
  let enabled: boolean;
  let accountId: string;
  let instagramUserId: string;
  const client = {
    createHostedAuthLink: jest.fn(),
    getAccount: jest.fn(),
    deleteAccount: jest.fn(),
  };
  const periodStart = new Date('2026-10-05T00:00:00Z');

  beforeAll(async () => {
    await source.initialize();
  });
  afterAll(async () => {
    await source.destroy();
  });
  beforeEach(async () => {
    jest.resetAllMocks();
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const [fixture] = await runner.query(
      `SELECT w.id, uw.id AS "userWorkspaceId" FROM core.workspace w
       JOIN core."userWorkspace" uw ON uw."workspaceId"=w.id WHERE w."deletedAt" IS NULL LIMIT 1`,
    );
    workspace = await runner.manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: fixture.id });
    userWorkspaceId = fixture.userWorkspaceId;
    await runner.query(
      'DELETE FROM core."unipileHostedAuthAttempt" WHERE "workspaceId"=$1',
      [workspace.id],
    );
    await runner.query(
      'DELETE FROM core."unipileInstagramAccountBinding" WHERE "workspaceId"=$1',
      [workspace.id],
    );
    await runner.query(
      'DELETE FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
      [workspace.id],
    );
    enabled = true;
    complimentary = false;
    const config = {
      get: (key: string) =>
        ({
          MYAH_SUBSCRIPTION_REQUIRED: enabled,
          MYAH_COMPLIMENTARY_WORKSPACE_IDS: complimentary ? [workspace.id] : [],
          MYAH_INCLUDED_USAGE_MICROUSD: 30_000_000,
          SERVER_URL: 'http://localhost:43802',
        })[key],
    };
    access = new MyahWorkspaceAccessService(
      new WorkspaceScopedRepository(
        runner.manager.getRepository(MyahWorkspaceSubscriptionEntity),
      ),
      config as never,
      { get: jest.fn(), set: jest.fn(), incrBy: jest.fn() } as never,
    );
    await access.saveSubscription(workspace.id, {
      stripeStatus: 'active',
      hadPaidSubscription: true,
      usagePeriodStart: periodStart,
      usagePeriodEnd: new Date('2026-11-05T00:00:00Z'),
    });
    usage = new MyahUsageService(
      { query: runner.query.bind(runner) } as DataSource,
      access,
      config as never,
    );
    await usage.record({
      workspaceId: workspace.id,
      category: 'AI',
      costMicrousd: BigInt(30_000_000),
      sourceKey: 'ai:exhausted',
    });
    accountId = randomUUID();
    instagramUserId = randomUUID();
    client.createHostedAuthLink.mockResolvedValue({
      url: 'https://auth.unipile.test/link',
    });
    client.getAccount.mockImplementation(async () => ({
      accountId,
      instagramUserId,
      username: 'fixture',
      sourceStatus: 'OK',
    }));
    client.deleteAccount.mockImplementation(async (_id, options) => {
      await options.beforeDispatch();
      return { kind: 'ACCEPTED', value: { deleted: true } };
    });
    const projection = new UnipileInstagramAccountProjectionService({
      executeInWorkspaceContext: async (run: () => Promise<unknown>) => run(),
      getGlobalWorkspaceDataSource: async () => ({
        query: runner.query.bind(runner),
      }),
    } as never);
    accounts = new UnipileInstagramAccountService(
      runner.manager.getRepository(WorkspaceEntity),
      runner.manager.getRepository(UnipileInstagramAccountBindingEntity),
      projection,
      client as never,
      {
        withLock: async (
          _scope: unknown,
          run: (manager: QueryRunner['manager']) => Promise<unknown>,
        ) => run(runner.manager),
        withSessionLock: async (
          _scope: unknown,
          run: (runner: QueryRunner) => Promise<unknown>,
        ) => run(runner),
      } as never,
      { assertEnabled: jest.fn() } as never,
      {} as never,
    );
    lapseJob = new UnipileInstagramSubscriptionLapseJob(
      {
        transaction: runner.manager.transaction.bind(runner.manager),
      } as DataSource,
      config as never,
      accounts,
    );
    hostedAuth = new UnipileHostedAuthService(
      usage,
      queue as never,
      runner.manager.getRepository(UnipileHostedAuthAttemptEntity),
      runner.manager.getRepository(UnipileInstagramAccountBindingEntity),
      client as never,
      config as never,
      { assertEnabled: jest.fn() } as never,
      accounts,
      {
        buildWorkspaceURL: () =>
          new URL('http://localhost:43803/settings/accounts/instagram'),
      } as never,
    );
  });
  afterEach(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  const connect = async (reconnect = false) => {
    const input = { workspace, userWorkspaceId };
    const attempt = reconnect
      ? await hostedAuth.createReconnectAttempt(input)
      : await hostedAuth.createConnectionAttempt(input);
    const calls = client.createHostedAuthLink.mock.calls;
    const linkInput = calls[calls.length - 1][0];
    await hostedAuth.processNotification({
      attemptId: attempt.attemptId,
      name: linkInput.name,
      status: reconnect ? 'RECONNECTED' : 'CREATION_SUCCESS',
      accountId,
    });
  };
  const subscription = () =>
    runner.manager
      .getRepository(MyahWorkspaceSubscriptionEntity)
      .findOneByOrFail({ workspaceId: workspace.id });
  const activeBinding = () =>
    runner.manager
      .getRepository(UnipileInstagramAccountBindingEntity)
      .findOneByOrFail({
        workspaceId: workspace.id,
        status: UnipileInstagramAccountBindingStatus.ACTIVE,
      });

  it('disconnects on lapse, retains conversations and Campaign selection, and reuses the account after resubscribing', async () => {
    await connect();
    const original = await activeBinding();
    await runner.query("SELECT set_config('search_path', $1, true)", [
      `${getWorkspaceSchemaName(workspace.id)},public`,
    ]);
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const campaignId = randomUUID();
    await runner.query(
      `INSERT INTO "myahSocialConversation" (id, "instagramAccountId", label) VALUES ($1,$2,'Retained fixture')`,
      [conversationId, original.workspaceInstagramAccountRecordId],
    );
    await runner.query(
      `INSERT INTO "myahSocialMessage" (id, "conversationId", text) VALUES ($1,$2,'Retained message')`,
      [messageId, conversationId],
    );
    await runner.manager.getRepository(MyahCampaignAgentSettingEntity).save({
      workspaceId: workspace.id,
      campaignId,
      instagramAccountId: original.workspaceInstagramAccountRecordId,
    });
    await access.saveSubscription(workspace.id, { stripeStatus: 'canceled' });
    await lapseJob.handle({ workspaceId: workspace.id });
    await lapseJob.handle({ workspaceId: workspace.id });
    expect(client.deleteAccount).toHaveBeenCalledTimes(1);
    expect(
      (await subscription()).instagramDisconnectedForLapseAt,
    ).toBeInstanceOf(Date);
    expect(
      (await usage.getUsage(workspace.id)).instagramReconnectRequired,
    ).toBe(true);
    expect(
      await runner.query(
        'SELECT status FROM "myahInstagramAccount" WHERE id=$1',
        [original.workspaceInstagramAccountRecordId],
      ),
    ).toEqual([{ status: 'INACTIVE' }]);
    expect(
      await runner.query(
        'SELECT "instagramAccountId", "deletedAt" FROM "myahSocialConversation" WHERE id=$1',
        [conversationId],
      ),
    ).toEqual([
      {
        instagramAccountId: original.workspaceInstagramAccountRecordId,
        deletedAt: null,
      },
    ]);
    expect(
      await runner.query(
        'SELECT text, "deletedAt" FROM "myahSocialMessage" WHERE id=$1',
        [messageId],
      ),
    ).toEqual([{ text: 'Retained message', deletedAt: null }]);
    await access.saveSubscription(workspace.id, { stripeStatus: 'active' });
    expect(await usage.getUsage(workspace.id)).toMatchObject({
      instagramReconnectRequired: true,
      exhausted: true,
    });
    accountId = randomUUID();
    await connect();
    expect((await activeBinding()).workspaceInstagramAccountRecordId).toBe(
      original.workspaceInstagramAccountRecordId,
    );
    expect((await subscription()).instagramDisconnectedForLapseAt).toBeNull();
    expect(await usage.getUsage(workspace.id)).toMatchObject({
      instagramReconnectRequired: false,
      exhausted: true,
    });
    expect(
      await runner.manager
        .getRepository(MyahCampaignAgentSettingEntity)
        .findOneByOrFail({ workspaceId: workspace.id, campaignId }),
    ).toMatchObject({
      instagramAccountId: original.workspaceInstagramAccountRecordId,
    });
    await lapseJob.handle({ workspaceId: workspace.id });
    expect(client.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('retains the lapse prompt through unknown disconnect recovery without repeating DELETE', async () => {
    await connect();
    const binding = await activeBinding();
    await access.saveSubscription(workspace.id, { stripeStatus: 'canceled' });
    client.deleteAccount.mockResolvedValue({ kind: 'UNKNOWN' });
    await expect(
      lapseJob.handle({ workspaceId: workspace.id }),
    ).rejects.toThrow('disconnection is being confirmed');
    const marker = (await subscription()).instagramDisconnectedForLapseAt;
    expect(marker).toBeInstanceOf(Date);
    await expect(
      lapseJob.handle({ workspaceId: workspace.id }),
    ).rejects.toThrow('disconnection is being confirmed');
    expect(client.deleteAccount).toHaveBeenCalledTimes(1);
    client.getAccount.mockRejectedValue(
      new UnipileReadError(
        404,
        'UNIPILE_ACCOUNT_NOT_FOUND',
        'Not found',
        false,
      ),
    );
    await accounts.reconcileUnknownDisconnect(binding.id);
    await lapseJob.handle({ workspaceId: workspace.id });
    expect((await subscription()).instagramDisconnectedForLapseAt).toEqual(
      marker,
    );
    expect(client.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it.each(['active', 'past_due', 'complimentary', 'dark'])(
    'ignores queued lapse cleanup with %s access',
    async (state) => {
      await connect();
      await access.saveSubscription(workspace.id, {
        stripeStatus:
          state === 'active'
            ? 'active'
            : state === 'past_due'
              ? 'past_due'
              : 'canceled',
      });
      complimentary = state === 'complimentary';
      enabled = state !== 'dark';
      await lapseJob.handle({ workspaceId: workspace.id });
      expect(client.deleteAccount).not.toHaveBeenCalled();
      expect((await subscription()).instagramDisconnectedForLapseAt).toBeNull();
    },
  );

  it('queues cleanup after a hosted-auth callback completes following lapse', async () => {
    const attempt = await hostedAuth.createConnectionAttempt({
      workspace,
      userWorkspaceId,
    });
    const linkInput = client.createHostedAuthLink.mock.calls[0][0];
    await access.saveSubscription(workspace.id, { stripeStatus: 'canceled' });
    await hostedAuth.processNotification({
      attemptId: attempt.attemptId,
      name: linkInput.name,
      status: 'CREATION_SUCCESS',
      accountId,
    });
    expect(queue.add).toHaveBeenCalledWith(
      UnipileInstagramSubscriptionLapseJob.name,
      { workspaceId: workspace.id },
      { retryLimit: 5 },
    );
    await lapseJob.handle({ workspaceId: workspace.id });
    expect(client.deleteAccount).toHaveBeenCalledTimes(1);
  });

  const ledger = () =>
    runner.query(
      'SELECT category, "costMicrousd" FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
      [workspace.id],
    );

  it.each(['canceled', 'unpaid', 'incomplete'])(
    'refuses connect and reconnect for %s before provider work',
    async (status) => {
      await access.saveSubscription(workspace.id, { stripeStatus: status });
      for (const start of [
        'createConnectionAttempt',
        'createReconnectAttempt',
      ] as const) {
        await expect(
          hostedAuth[start]({ workspace, userWorkspaceId }),
        ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
      }
      expect(client.createHostedAuthLink).not.toHaveBeenCalled();
      expect(
        await runner.manager
          .getRepository(UnipileHostedAuthAttemptEntity)
          .countBy({ workspaceId: workspace.id }),
      ).toBe(0);
    },
  );

  it.each(['active', 'past_due', 'complimentary', 'dark'])(
    'allows the first link at exhausted AI usage with %s access, without an Instagram charge',
    async (state) => {
      complimentary = state === 'complimentary';
      enabled = state !== 'dark';
      if (state === 'past_due')
        await access.saveSubscription(workspace.id, {
          stripeStatus: 'past_due',
        });
      await connect();
      expect(
        await runner.manager
          .getRepository(UnipileInstagramAccountBindingEntity)
          .countBy({
            workspaceId: workspace.id,
            status: UnipileInstagramAccountBindingStatus.ACTIVE,
          }),
      ).toBe(1);
      expect(await ledger()).toEqual([
        { category: 'AI', costMicrousd: '30000000' },
      ]);
      if (enabled && !complimentary)
        expect((await usage.getUsage(workspace.id)).exhausted).toBe(true);
    },
  );

  it('refuses a second linked account with the plan message', async () => {
    await connect();
    await expect(
      hostedAuth.createConnectionAttempt({ workspace, userWorkspaceId }),
    ).rejects.toThrow('Your plan includes one Instagram account.');
    expect(client.createHostedAuthLink).toHaveBeenCalledTimes(1);
  });

  it('allows reauthentication and fresh linking after full disconnection at the AI limit without usage charges', async () => {
    await connect();
    await runner.manager
      .getRepository(UnipileInstagramAccountBindingEntity)
      .update(
        { workspaceId: workspace.id },
        { status: UnipileInstagramAccountBindingStatus.NEEDS_RECONNECT },
      );
    await connect(true);
    await accounts.disconnectWorkspaceAccount(workspace.id);
    expect(client.deleteAccount).toHaveBeenCalledTimes(1);
    accountId = randomUUID();
    await connect();
    expect(client.createHostedAuthLink).toHaveBeenCalledTimes(3);
    expect(await ledger()).toEqual([
      { category: 'AI', costMicrousd: '30000000' },
    ]);
    expect((await usage.getUsage(workspace.id)).exhausted).toBe(true);
  });
});
