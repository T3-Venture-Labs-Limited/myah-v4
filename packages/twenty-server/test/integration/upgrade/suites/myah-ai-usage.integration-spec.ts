import { type LanguageModelV3 } from '@ai-sdk/provider';
import { randomUUID } from 'node:crypto';
import { MyahReplyAgentService } from 'src/modules/myah-reply-agent/services/myah-reply-agent.service';
import { MyahReplyAgentJob } from 'src/modules/myah-reply-agent/jobs/myah-reply-agent.job';
import { DataSource, type DataSourceOptions, type QueryRunner } from 'typeorm';

import { typeORMCoreModuleOptions } from 'src/database/typeorm/core/core.datasource';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';
import { MyahWorkspaceAccessService } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';
import {
  MyahAiUsageService,
  MyahAiUsageRecoveryJob,
} from 'src/engine/core-modules/myah-subscription/myah-ai-usage.service';
import { ManagedProviderPoolEntity } from 'src/engine/core-modules/managed-provider-billing/entities/managed-provider-pool.entity';
import { ManagedProviderPoolState } from 'src/engine/core-modules/managed-provider-billing/enums/managed-provider-pool-state.enum';
import { ManagedProviderPoolService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-pool.service';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { ManagedOpenRouterModelService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-model.service';
import {
  MANAGED_OPENROUTER_TARIFF_VERSION,
  MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

// Stub provider/queue only. Access, usage ledger and kill switch use PostgreSQL.
describe('Myah included AI usage (PostgreSQL)', () => {
  const dataSource = new DataSource(
    typeORMCoreModuleOptions as DataSourceOptions,
  );
  const period = new Date('2026-10-05T00:00:00Z');
  const reset = new Date('2026-11-05T00:00:00Z');
  const modelId = 'openrouter/deepseek/deepseek-v4-flash';
  let runner: QueryRunner;
  let workspaceId: string;
  let access: MyahWorkspaceAccessService;
  let usage: MyahUsageService;
  let wrapped: LanguageModelV3;
  let managed: ManagedOpenRouterModelService;
  let provider: LanguageModelV3;
  const queue = { add: jest.fn() };
  const lookup = { lookup: jest.fn() };
  const operations = {
    assertProviderConfigurationActive: jest.fn(),
    reserveOperation: jest.fn(),
    completeOperation: jest.fn(),
    attachProviderExecutionId: jest.fn(),
  };
  const doGenerate = jest.fn();
  const doStream = jest.fn();
  const providerUsage = {
    inputTokens: { total: 12 },
    outputTokens: { total: 7 },
    raw: { cost: 0.01 },
  };
  beforeAll(async () => {
    await dataSource.initialize();
  });
  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const [workspace] = await runner.query(
      'SELECT id FROM core.workspace LIMIT 1',
    );
    workspaceId = workspace.id;
    await runner.query(
      'DELETE FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    await runner.query(
      'DELETE FROM core."myahWorkspaceSubscription" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    const values: Record<string, unknown> = {
      MYAH_SUBSCRIPTION_REQUIRED: true,
      MYAH_COMPLIMENTARY_WORKSPACE_IDS: [],
      MYAH_INCLUDED_USAGE_MICROUSD: 30_000_000,
      MANAGED_OPENROUTER_ENABLED: true,
      MANAGED_OPENROUTER_FUNDING_WORKSPACE_IDS: ['*'],
      MANAGED_OPENROUTER_METRONOME_BILLING_ENABLED: false,
    };
    const config = { get: (key: string) => values[key] } as never;
    access = new MyahWorkspaceAccessService(
      new WorkspaceScopedRepository(
        runner.manager.getRepository(MyahWorkspaceSubscriptionEntity),
      ),
      config,
      { get: jest.fn(), set: jest.fn(), incrBy: jest.fn() } as never,
    );
    await access.saveSubscription(workspaceId, {
      stripeStatus: 'active',
      hadPaidSubscription: true,
      usagePeriodStart: period,
      usagePeriodEnd: reset,
    });
    const pools = runner.manager.getRepository(ManagedProviderPoolEntity);
    await pools.save({
      providerKey: 'openrouter',
      state: ManagedProviderPoolState.ACTIVE,
      activeTariffVersion: MANAGED_OPENROUTER_TARIFF_VERSION,
      activeConfigurationDigest: MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST,
      appliedDesiredStateEpoch: '1',
      appliedDesiredStateDigest: 'fixture',
      rowVersion: 1,
    });
    usage = new MyahUsageService(
      { query: runner.query.bind(runner) } as DataSource,
      access,
      config,
    );
    const billing = new MyahAiUsageService(
      usage,
      new ManagedProviderPoolService(pools, config),
      queue as never,
    );
    managed = new ManagedOpenRouterModelService(
      operations as never,
      config,
      { incrementCounterBy: jest.fn() } as never,
      billing,
    );
    doGenerate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: providerUsage,
      response: { id: 'generation-1' },
      warnings: [],
    });
    provider = {
      specificationVersion: 'v3',
      provider: 'openrouter',
      modelId: 'deepseek/deepseek-v4-flash',
      supportedUrls: {},
      doGenerate,
      doStream,
    } as LanguageModelV3;
    wrapped = managed.wrapModel({
      actorUserWorkspaceId: null,
      executionSurface: 'chat',
      workspaceId,
      requestIdRoot: 'test-chat',
      providerName: 'openrouter',
      modelConfig: { modelId } as never,
      model: provider,
    }) as LanguageModelV3;
    lookup.lookup.mockResolvedValue({
      status: 'found',
      id: 'generation-1',
      model: 'deepseek/deepseek-v4-flash',
      totalCostUsd: 0.02,
    });
  });
  afterEach(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });
  const rows = () =>
    runner.query('SELECT * FROM core."myahUsageEntry" WHERE "workspaceId"=$1', [
      workspaceId,
    ]);

  it.each(['limit', 'lapsed', 'payment-retrying'])(
    'reply-agent job preserves a failed run without a model call (%s), then allows explicit regenerate',
    async (condition) => {
      if (condition === 'lapsed') {
        await access.saveSubscription(workspaceId, {
          stripeStatus: 'canceled',
        });
      } else {
        await usage.record({
          workspaceId,
          category: 'AI',
          costMicrousd: BigInt(30_000_000),
          sourceKey: 'exhausted',
        });
        if (condition === 'payment-retrying')
          await access.saveSubscription(workspaceId, {
            stripeStatus: 'past_due',
          });
      }
      const creatorId = randomUUID();
      const conversationRecordId = randomUUID();
      const triggerMessageId = randomUUID();
      const draftId = randomUUID();
      const drafts = {
        getDraftForTarget: jest.fn(async () => ({
          draftId,
          revision: 1,
          body: '',
          executionLocked: false,
        })),
        saveDraft: jest.fn(async () => ({
          status: 'SAVED',
          draftId,
          revision: 2,
        })),
      };
      const send = { sendDirect: jest.fn() };
      const actor = {
        userWorkspaceId: randomUUID(),
        roleId: randomUUID(),
        authContext: {},
      };
      const agent = new MyahReplyAgentService(
        { query: runner.query.bind(runner) } as never,
        {
          executeInWorkspaceContext: async (callback: () => unknown) =>
            callback(),
        } as never,
        {
          loadConversation: async () => ({
            channel: 'INSTAGRAM',
            creatorId,
            conversationRecordId,
            latestInbound: { id: triggerMessageId, sentAt: new Date() },
            accountHandle: 'fixture',
          }),
          loadContext: async () => ({
            creator: {
              id: creatorId,
              name: 'Fixture creator',
              location: null,
              language: null,
              instagramHandle: 'fixture',
              hasEmail: false,
            },
            notes: [],
            activeCampaign: null,
            pastCampaigns: [],
            history: [],
          }),
        } as never,
        {
          getAgentRecord: async () => ({
            tone: 'Warm',
            responseLength: null,
            language: null,
            brandInformation: null,
            replyRules: null,
            escalationBoundaries: null,
            sendingMode: 'DRAFT_FOR_APPROVAL',
            sendingModeEnabledByUserWorkspaceId: actor.userWorkspaceId,
          }),
        } as never,
        { buildUserAndAgentActorContext: async () => actor } as never,
        {
          getDefaultSpeedModel: () => ({
            modelId,
            model: provider,
            providerName: 'openrouter',
          }),
          getEffectiveModelConfig: () => ({ modelId }),
        } as never,
        managed,
        {} as never,
        {} as never,
        drafts as never,
        send as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const job = new MyahReplyAgentJob({} as never, {} as never, agent);
      const input = {
        workspaceId,
        channel: 'INSTAGRAM' as const,
        conversationRecordId,
        creatorId,
        messageRecordId: triggerMessageId,
      };
      await job.handleAgentRun(input);
      const runs = () =>
        runner.query(
          'SELECT status, reason FROM core."myahAgentRun" WHERE "workspaceId"=$1 AND "triggerMessageId"=$2',
          [workspaceId, triggerMessageId],
        );
      const reason =
        condition === 'lapsed'
          ? 'subscription has ended'
          : condition === 'payment-retrying'
            ? 'renewal payment goes through'
            : 'Nov 5, 2026';
      expect(await runs()).toEqual([
        { status: 'FAILED', reason: expect.stringContaining(reason) },
      ]);
      expect(doGenerate).not.toHaveBeenCalled();
      expect(send.sendDirect).not.toHaveBeenCalled();
      await access.saveSubscription(workspaceId, {
        stripeStatus: 'active',
        usagePeriodStart: reset,
        usagePeriodEnd: new Date('2026-12-05T00:00:00Z'),
      });
      await job.handleAgentRun(input);
      expect(doGenerate).not.toHaveBeenCalled(); // Reset alone must not auto-draft the failed message.
      doGenerate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              decision: 'REPLY',
              body: 'Thanks for your reply.',
              reason: '',
              invitationIncluded: false,
            }),
          },
        ],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: providerUsage,
        response: { id: 'generation-1' },
        warnings: [],
      });
      await job.handleAgentRun({ ...input, regenerate: true });
      expect(await runs()).toEqual([{ status: 'DRAFTED', reason: null }]);
      expect(doGenerate).toHaveBeenCalledTimes(1);
      expect(drafts.saveDraft).toHaveBeenCalledTimes(1);
      expect(send.sendDirect).not.toHaveBeenCalled();
    },
  );

  it('records generate and stream exactly once each, at provider cost without Metronome', async () => {
    await wrapped.doGenerate({ prompt: [] });
    doStream.mockResolvedValue({
      response: { id: 'generation-2' },
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'finish', usage: providerUsage });
          controller.close();
        },
      }),
    });
    const { stream } = await wrapped.doStream({ prompt: [] });
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      /* consume */
    }
    expect(await rows()).toEqual([
      expect.objectContaining({
        costMicrousd: '10000',
        usagePeriodStart: period,
      }),
      expect.objectContaining({
        costMicrousd: '10000',
        usagePeriodStart: period,
      }),
    ]);
    expect(operations.reserveOperation).not.toHaveBeenCalled();
    expect(operations.completeOperation).not.toHaveBeenCalled();
    expect(operations.attachProviderExecutionId).not.toHaveBeenCalled();
  });

  it('counts two real provider invocations even when their caller reuses a root request ID', async () => {
    await wrapped.doGenerate({ prompt: [] });
    const replay = managed.wrapModel({
      actorUserWorkspaceId: null,
      executionSurface: 'chat',
      workspaceId,
      requestIdRoot: 'test-chat',
      providerName: 'openrouter',
      modelConfig: { modelId } as never,
      model: provider,
    }) as LanguageModelV3;
    await replay.doGenerate({ prompt: [] });
    expect(doGenerate).toHaveBeenCalledTimes(2);
    expect(await rows()).toHaveLength(2);
  });

  it('refuses a call at the limit, then permits a new paid period', async () => {
    await usage.record({
      workspaceId,
      category: 'AI',
      costMicrousd: BigInt(30_000_000),
      sourceKey: 'prior',
    });
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toMatchObject({
      code: 'INCLUDED_USAGE_EXHAUSTED',
    });
    expect(doGenerate).not.toHaveBeenCalled();
    await access.saveSubscription(workspaceId, {
      usagePeriodStart: reset,
      usagePeriodEnd: new Date('2026-12-05T00:00:00Z'),
    });
    await expect(wrapped.doGenerate({ prompt: [] })).resolves.toBeDefined();
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });

  it('refuses a lapsed workspace before provider I/O', async () => {
    await access.saveSubscription(workspaceId, { stripeStatus: 'canceled' });
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
    expect(doGenerate).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });

  it('keeps the pool kill switch when Metronome is off', async () => {
    await runner.manager
      .getRepository(ManagedProviderPoolEntity)
      .update(
        { providerKey: 'openrouter' },
        { state: ManagedProviderPoolState.DISABLED },
      );
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toThrow(
      'pool admission is not active',
    );
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it('records nothing for a provider failure before generation', async () => {
    doGenerate.mockRejectedValue({ statusCode: 401 });
    await expect(wrapped.doGenerate({ prompt: [] })).rejects.toThrow(
      'Managed OpenRouter generation failed',
    );
    expect(await rows()).toHaveLength(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each(['generation-1', undefined])(
    'recovers a cancelled stream (id: %s) in its original period, idempotently',
    async (id) => {
      doStream.mockResolvedValue({
        response: { id },
        stream: new ReadableStream(),
      });
      const { stream } = await wrapped.doStream({
        prompt: [],
        maxOutputTokens: 10,
      });
      await stream.cancel();
      expect(queue.add).toHaveBeenCalledWith(
        MyahAiUsageRecoveryJob.name,
        expect.objectContaining({ providerExecutionId: id ?? null }),
        { delay: 60_000, retryLimit: 5 },
      );
      const data = queue.add.mock.calls[0][1];
      await access.saveSubscription(workspaceId, {
        usagePeriodStart: reset,
        usagePeriodEnd: new Date('2026-12-05T00:00:00Z'),
      });
      const job = new MyahAiUsageRecoveryJob(
        lookup as never,
        usage,
        queue as never,
      );
      await job.handle(data);
      await job.handle(data);
      expect(await rows()).toEqual([
        expect.objectContaining({
          costMicrousd: id ? '20000' : data.estimatedCostMicrousd,
          usagePeriodStart: period,
        }),
      ]);
      expect((await usage.getUsage(workspaceId)).percentUsed).toBe(0);
      if (!id) expect(lookup.lookup).not.toHaveBeenCalled();
    },
  );

  const cancelledStream = async () => {
    doStream.mockResolvedValue({
      response: { id: 'generation-1' },
      stream: new ReadableStream(),
    });
    const { stream } = await wrapped.doStream({
      prompt: [],
      maxOutputTokens: 10,
    });
    await stream.cancel();
    const data = queue.add.mock.calls[0][1];
    queue.add.mockClear();
    return data;
  };

  it.each(['not_found', 'unavailable'] as const)(
    'looks the real cost up again later instead of charging the estimate when the lookup is %s',
    async (status) => {
      const data = await cancelledStream();
      lookup.lookup.mockResolvedValueOnce({ status });
      const job = new MyahAiUsageRecoveryJob(
        lookup as never,
        usage,
        queue as never,
      );
      await job.handle(data);
      expect(await rows()).toHaveLength(0);
      expect(queue.add).toHaveBeenCalledWith(
        MyahAiUsageRecoveryJob.name,
        { ...data, lookupAttempt: 1 },
        { delay: 5 * 60_000, retryLimit: 5 },
      );
      // The cost is published by the next attempt: the real cost is charged.
      await job.handle(queue.add.mock.calls[0][1]);
      expect(await rows()).toEqual([
        expect.objectContaining({ costMicrousd: '20000' }),
      ]);
    },
  );

  it('charges the reserved estimate only after the last lookup still finds nothing', async () => {
    const data = await cancelledStream();
    lookup.lookup.mockResolvedValue({ status: 'not_found' });
    const job = new MyahAiUsageRecoveryJob(
      lookup as never,
      usage,
      queue as never,
    );
    await job.handle({ ...data, lookupAttempt: 3 });
    expect(queue.add).not.toHaveBeenCalled();
    expect(await rows()).toEqual([
      expect.objectContaining({
        costMicrousd: data.estimatedCostMicrousd,
        details: expect.objectContaining({ estimated: true }),
      }),
    ]);
  });

  it('charges the real cost when OpenRouter reports a routed model slug', async () => {
    const data = await cancelledStream();
    lookup.lookup.mockResolvedValueOnce({
      status: 'found',
      id: 'generation-1',
      model: 'deepseek/deepseek-v4-flash-20261001',
      totalCostUsd: 0.02,
    });
    await new MyahAiUsageRecoveryJob(
      lookup as never,
      usage,
      queue as never,
    ).handle(data);
    expect(await rows()).toEqual([
      expect.objectContaining({
        costMicrousd: '20000',
        details: expect.objectContaining({ estimated: false }),
      }),
    ]);
  });
});
