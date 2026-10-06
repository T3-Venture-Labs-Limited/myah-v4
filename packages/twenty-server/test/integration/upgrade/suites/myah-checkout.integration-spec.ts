import { DataSource, type DataSourceOptions, type QueryRunner } from 'typeorm';
import { type Request } from 'express';
import { type ExecutionContext } from '@nestjs/common';
import { MiddlewareService } from 'src/engine/middlewares/middleware.service';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import {
  MyahSubscriptionApiAccessService,
  MyahSubscriptionApiGuard,
} from 'src/engine/core-modules/myah-subscription/myah-subscription-api-access.service';
import {
  OnboardingService,
  OnboardingStepKeys,
} from 'src/engine/core-modules/onboarding/onboarding.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { typeORMCoreModuleOptions } from 'src/database/typeorm/core/core.datasource';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';
import { MyahCheckoutService } from 'src/engine/core-modules/myah-subscription/myah-checkout.service';
import { MyahSubscriptionResolver } from 'src/engine/core-modules/myah-subscription/myah-subscription.resolver';
import { MyahWorkspaceAccessService } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import { InstagramMessageSendService } from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { CampaignExecutionService } from 'src/modules/campaign-execution/services/campaign-execution.service';
import { SendEmailResolver } from 'src/modules/messaging/message-outbound-manager/resolvers/send-email.resolver';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { WorkflowRunnerWorkspaceService } from 'src/modules/workflow/workflow-runner/workspace-services/workflow-runner.workspace-service';
import { RunWorkflowJob } from 'src/modules/workflow/workflow-runner/jobs/run-workflow.job';

// Real subscription rows and resolver/service calls; no Stripe network operations.
describe('Myah Checkout resolvers (PostgreSQL)', () => {
  const dataSource = new DataSource(
    typeORMCoreModuleOptions as DataSourceOptions,
  );
  let runner: QueryRunner;
  let workspace: WorkspaceEntity;
  let access: MyahWorkspaceAccessService;
  let resolver: MyahSubscriptionResolver;
  let coupon: Record<string, unknown>;
  let configValues: Record<string, unknown>;
  const stripe = {
    prices: { retrieve: jest.fn() },
    coupons: { retrieve: jest.fn() },
    promotionCodes: { list: jest.fn() },
    paymentIntents: { list: jest.fn() },
    subscriptions: { list: jest.fn(), retrieve: jest.fn() },
    checkout: {
      sessions: {
        list: jest.fn(),
        expire: jest.fn(),
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    billingPortal: { sessions: { create: jest.fn() } },
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
    [workspace] = await runner.query('SELECT * FROM core.workspace LIMIT 1');
    await runner.query(
      'DELETE FROM core."myahWorkspaceSubscription" WHERE "workspaceId"=$1',
      [workspace.id],
    );
    await runner.query(
      'DELETE FROM core."myahUsageEntry" WHERE "workspaceId"=$1',
      [workspace.id],
    );
    configValues = {
      MYAH_SUBSCRIPTION_REQUIRED: true,
      MYAH_COMPLIMENTARY_WORKSPACE_IDS: [],
      MYAH_STRIPE_PRICE_ID: 'price_myah',
      MYAH_STRIPE_EARLY_ACCESS_COUPON_ID: 'coupon_early',
      MYAH_INCLUDED_USAGE_MICROUSD: 30_000_000,
    };
    const config = { get: (key: string) => configValues[key] };
    access = new MyahWorkspaceAccessService(
      new WorkspaceScopedRepository(
        runner.manager.getRepository(MyahWorkspaceSubscriptionEntity),
      ),
      config as never,
      { get: jest.fn(), set: jest.fn(), incrBy: jest.fn() } as never,
    );
    coupon = {
      id: 'coupon_early',
      valid: true,
      amount_off: 23000,
      currency: 'usd',
      duration: 'forever',
      max_redemptions: 100,
      times_redeemed: 0,
    };
    stripe.prices.retrieve.mockResolvedValue({
      id: 'price_myah',
      active: true,
      unit_amount: 32900,
      currency: 'usd',
      livemode: false,
      recurring: { interval: 'month', interval_count: 1 },
      product: 'prod_myah',
    });
    stripe.coupons.retrieve.mockImplementation(async () => coupon);
    stripe.promotionCodes.list.mockResolvedValue({ data: [] });
    stripe.paymentIntents.list.mockResolvedValue({ data: [] });
    stripe.subscriptions.list.mockImplementation(() =>
      (async function* () {})(),
    );
    stripe.subscriptions.retrieve.mockResolvedValue({
      customer: 'cus_workspace',
      livemode: false,
    });
    stripe.checkout.sessions.list.mockImplementation(() =>
      (async function* () {})(),
    );
    stripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
    });
    stripe.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/test',
    });
    const checkout = new MyahCheckoutService(
      { stripe: () => stripe } as never,
      access,
      {
        ensureWorkspaceCustomer: async () => 'cus_workspace',
        findPersistedCustomerId: async () => null,
      } as never,
      config as never,
      {
        getWorkspaceUrls: () => ({
          subdomainUrl: 'https://brand.example.com/',
        }),
      } as never,
    );
    resolver = new MyahSubscriptionResolver(
      checkout,
      new MyahUsageService(
        { query: runner.query.bind(runner) } as DataSource,
        access,
        config as never,
      ),
      { userHasWorkspaceSettingPermission: async () => true } as never,
      { tokenBucketThrottleOrThrow: async () => 1 } as never,
    );
  });
  afterEach(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  it.each([
    ['never-paid', 'PLAN_REQUIRED'],
    ['canceled', 'PLAN_REQUIRED'],
    ['active', 'SYNC_EMAIL'],
    ['past_due', 'SYNC_EMAIL'],
    ['complimentary', 'SYNC_EMAIL'],
    ['switch-off', 'SYNC_EMAIL'],
  ])(
    'onboarding checks %s immediately after activation, before other pending steps',
    async (status, expected) => {
      await runner.query(
        'UPDATE core.workspace SET "activationStatus"=\'ACTIVE\' WHERE id=$1',
        [workspace.id],
      );
      if (status === 'complimentary')
        configValues.MYAH_COMPLIMENTARY_WORKSPACE_IDS = [workspace.id];
      else if (status === 'switch-off')
        configValues.MYAH_SUBSCRIPTION_REQUIRED = false;
      else if (status !== 'never-paid')
        await access.saveSubscription(workspace.id, {
          stripeStatus: status,
          hadPaidSubscription: true,
        });
      const vars = {
        getAll: jest.fn(
          async () =>
            new Map([
              [OnboardingStepKeys.ONBOARDING_CONNECT_ACCOUNT_PENDING, true],
              [OnboardingStepKeys.ONBOARDING_CREATE_PROFILE_PENDING, true],
              [OnboardingStepKeys.ONBOARDING_INVITE_TEAM_PENDING, true],
            ]),
        ),
      };
      const onboarding = new OnboardingService(
        {
          isSubscriptionIncompleteOnboardingStatus: async () => false,
        } as never,
        {} as never,
        vars as never,
        {} as never,
        {
          findOne: async () =>
            (
              await runner.query('SELECT * FROM core.workspace WHERE id=$1', [
                workspace.id,
              ])
            )[0],
        } as never,
        {} as never,
        access,
      );
      expect(
        await onboarding.getOnboardingStatus({
          user: { id: 'fixture' } as UserEntity,
          workspaceId: workspace.id,
        }),
      ).toBe(expected);
      if (expected === 'PLAN_REQUIRED')
        expect(vars.getAll).not.toHaveBeenCalled();
      await runner.query(
        'UPDATE core.workspace SET "activationStatus"=\'PENDING_CREATION\' WHERE id=$1',
        [workspace.id],
      );
      expect(
        await onboarding.getOnboardingStatus({
          user: { id: 'fixture' } as UserEntity,
          workspaceId: workspace.id,
        }),
      ).toBe('WORKSPACE_ACTIVATION');
    },
  );

  it('refuses send and workflow entry points with a persisted lapsed subscription before any side effects', async () => {
    await access.saveSubscription(workspace.id, {
      stripeStatus: 'canceled',
      hadPaidSubscription: true,
    });
    const context = {
      myahUsage: new MyahUsageService(
        { query: runner.query.bind(runner) } as DataSource,
        access,
        { get: (key: string) => configValues[key] } as never,
      ),
      logger: { log: jest.fn() },
      workflowOutreachAccessGuardService: {
        assertGenericWorkflowVersionMutationAllowed: jest.fn(),
        assertGenericWorkflowRunMutationAllowed: jest.fn(),
      },
    } as never;
    // Missing downstream dependencies deliberately fail if any path passes the gate.
    const input = { workspaceId: workspace.id, workspace } as never;
    await expect(
      MyahInboxReplySendService.prototype.send.call(context, input),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      InstagramMessageSendService.prototype.sendDirect.call(context, input),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      InstagramMessageSendService.prototype.executeApprovedWithDraftLockHeld.call(
        context,
        input,
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      SendEmailResolver.prototype.sendEmail.call(
        context,
        {} as never,
        workspace,
        'actor',
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    const account = { workspaceId: workspace.id } as never;
    await expect(
      MessagingMessageOutboundService.prototype.assertConnectedAccountSendable.call(
        context,
        account,
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      MessagingMessageOutboundService.prototype.sendMessage.call(
        context,
        {} as never,
        account,
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      MessagingMessageOutboundService.prototype.sendDraft.call(
        context,
        'draft',
        {} as never,
        account,
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      WorkflowRunnerWorkspaceService.prototype.run.call(context, input),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      WorkflowRunnerWorkspaceService.prototype.resume.call(context, input),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      WorkflowRunnerWorkspaceService.prototype.submitFormStep.call(
        context,
        input,
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      WorkflowRunnerWorkspaceService.prototype.retryWorkflowRun.call(
        context,
        workspace.id,
        'run',
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    await expect(
      RunWorkflowJob.prototype.handle.call(context, input),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(
      CampaignExecutionService.prototype.startCampaign.call(context, {
        workspaceId: workspace.id,
        campaignId: id,
        authContext: {} as never,
        startIdempotencyKey: id,
        request: {
          preparedProof: {
            kind: 'PREPARED',
            workspaceId: workspace.id,
            campaignId: id,
            workflowId: id,
            workflowVersionId: id,
            initiatingUserWorkspaceId: id,
            initiatingUserId: id,
            initiatingWorkspaceMemberId: id,
            orderedMessageIds: [id],
            usedChannels: ['EMAIL'],
            sequenceDigest: 'a'.repeat(64),
            fixedMaterialDigest: 'b'.repeat(64),
            senderAuthorityDigest: 'c'.repeat(64),
            preparedFingerprint: 'd'.repeat(64),
            signatureDigest: null,
            fixedMaterialProofs: [],
            senderPoolFingerprint: 'e'.repeat(64),
            senderPoolSerializationRevision: 'CAMPAIGN_SENDER_POOL_V2',
            senderPoolRotationPolicyId:
              'EARLIEST_ELIGIBLE_LOWEST_DAILY_USAGE_STABLE_ACCOUNT_V1',
          },
          reviewedWindow: {
            timeZone: 'UTC',
            startLocalTime: '09:00:00',
            endLocalTime: '17:00:00',
          },
          campaignCapacityTimeZone: 'UTC',
        },
      }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
  });

  it('still dispatches email when included usage is exhausted and payment is retrying', async () => {
    await access.saveSubscription(workspace.id, {
      stripeStatus: 'past_due',
      hadPaidSubscription: true,
      usagePeriodStart: new Date('2026-10-01T00:00:00Z'),
      usagePeriodEnd: new Date('2026-11-01T00:00:00Z'),
    });
    const usage = new MyahUsageService(
      { query: runner.query.bind(runner) } as DataSource,
      access,
      { get: (key: string) => configValues[key] } as never,
    );
    await usage.record({
      workspaceId: workspace.id,
      sourceKey: 'exhausted',
      category: 'AI',
      costMicrousd: BigInt(30_000_000),
    });
    expect((await usage.getUsage(workspace.id)).exhausted).toBe(true);
    const sendMessage = jest.fn().mockResolvedValue({ id: 'sent' });
    const outbound = new MessagingMessageOutboundService(
      { sendMessage } as never,
      {} as never,
      {} as never,
      {} as never,
      usage,
    );
    await expect(
      outbound.sendMessage(
        {} as never,
        { workspaceId: workspace.id, provider: 'google' } as never,
      ),
    ).resolves.toEqual({ id: 'sent' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['user', 'api-key'])(
    'enforces API access after %s authentication, but permits billing bootstrap',
    async (actor) => {
      await access.saveSubscription(workspace.id, {
        stripeStatus: 'canceled',
        hadPaidSubscription: true,
      });
      const apiAccess = new MyahSubscriptionApiAccessService(
        new MyahUsageService(
          { query: runner.query.bind(runner) } as DataSource,
          access,
          { get: (key: string) => configValues[key] } as never,
        ),
      );
      const validateTokenByRequest = jest.fn(async () => ({
        workspace,
        ...(actor === 'api-key'
          ? { apiKey: { id: 'fixture-key' } }
          : {
              userWorkspaceId: 'fixture-member',
              user: { id: 'fixture-user' },
            }),
      }));
      const tokens = { validateTokenByRequest } as never;
      const cache = { getMetadataVersion: jest.fn(async () => 1) } as never;
      const middleware = new MiddlewareService(
        tokens,
        cache,
        {} as never,
        { captureExceptions: jest.fn() } as never,
        { extractJwtFromRequest: () => () => 'fixture-token' } as never,
        apiAccess,
      );
      const request = (path: string, query = '{ creators { id } }') =>
        ({
          path,
          method: 'POST',
          headers: { authorization: 'Bearer fixture-token' },
          body: { query },
        }) as Request;
      await expect(
        middleware.hydrateGraphqlRequest(request('/graphql')),
      ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
      await expect(
        middleware.hydrateRestRequest(request('/rest/creators')),
      ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
      await expect(
        middleware.hydrateGraphqlRequest(
          request('/metadata', 'mutation { sendEmail(input: {}) }'),
        ),
      ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
      for (const query of [
        '{ currentUser { id } currentWorkspace { id } }',
        '{ minimalMetadata { objectMetadataItems { id } } }',
        '{ myahWorkspaceUsage { state } myahCheckoutPrice { amountCents } }',
        'mutation { createMyahCheckoutSession }',
        'mutation { syncMyahCheckoutSession(sessionId: "cs_test") }',
        'mutation { createMyahCustomerPortalSession }',
      ]) {
        await expect(
          middleware.hydrateGraphqlRequest(request('/metadata', query)),
        ).resolves.toBeUndefined();
      }
      const mcp = request('/mcp');
      const context = {
        switchToHttp: () => ({ getRequest: () => mcp }),
      } as unknown as ExecutionContext;
      expect(await new JwtAuthGuard(tokens, cache).canActivate(context)).toBe(
        true,
      );
      await expect(
        new MyahSubscriptionApiGuard(apiAccess).canActivate(context),
      ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
      expect(validateTokenByRequest).toHaveBeenCalled();
      expect(actor === 'api-key' ? mcp.apiKey?.id : mcp.userWorkspaceId).toBe(
        actor === 'api-key' ? 'fixture-key' : 'fixture-member',
      );
      await access.saveSubscription(workspace.id, { stripeStatus: 'active' });
      await expect(
        middleware.hydrateGraphqlRequest(request('/graphql')),
      ).resolves.toBeUndefined();
      await expect(
        middleware.hydrateRestRequest(request('/rest/creators')),
      ).resolves.toBeUndefined();
      await expect(
        middleware.hydrateGraphqlRequest(
          request('/metadata', 'mutation { sendEmail(input: {}) }'),
        ),
      ).resolves.toBeUndefined();
      await expect(
        new MyahSubscriptionApiGuard(apiAccess).canActivate(context),
      ).resolves.toBe(true);
    },
  );

  it('keeps early access after abandoned Checkout and reuses the installation customer', async () => {
    expect(
      await resolver.myahCheckoutPrice(workspace, 'admin', undefined),
    ).toMatchObject({
      amountCents: 9900,
    });
    await resolver.createMyahCheckoutSession(workspace);
    expect(await access.getSubscription(workspace.id)).toMatchObject({
      hadPaidSubscription: false,
      stripeSubscriptionId: null,
    });
    expect(
      await resolver.myahCheckoutPrice(workspace, 'admin', undefined),
    ).toMatchObject({
      amountCents: 9900,
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_workspace',
        discounts: [{ coupon: 'coupon_early' }],
      }),
    );
    expect(await resolver.myahWorkspaceUsage(workspace)).toMatchObject({
      state: 'NEEDS_SUBSCRIPTION',
      percentUsed: 0,
    });
  });

  it('uses full price after paid cancellation or an exhausted coupon', async () => {
    coupon.times_redeemed = 100;
    expect(
      await resolver.myahCheckoutPrice(workspace, 'admin', undefined),
    ).toMatchObject({
      amountCents: 32900,
    });
    coupon.times_redeemed = 0;
    await access.saveSubscription(workspace.id, {
      stripeStatus: 'canceled',
      hadPaidSubscription: true,
    });
    expect(
      await resolver.myahCheckoutPrice(workspace, 'admin', undefined),
    ).toMatchObject({
      amountCents: 32900,
    });
  });

  it('refuses Checkout when already subscribed', async () => {
    await access.saveSubscription(workspace.id, {
      stripeStatus: 'active',
      hadPaidSubscription: true,
    });
    await expect(resolver.createMyahCheckoutSession(workspace)).rejects.toThrow(
      'already has access',
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects invalid or expired promotion codes without opening Checkout', async () => {
    await expect(
      resolver.createMyahCheckoutSession(workspace, 'bad'),
    ).rejects.toThrow('This code is not valid.');
    stripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          promotion: { coupon: 'coupon_early' },
          livemode: false,
          expires_at: 1,
          restrictions: {},
        },
      ],
    });
    await expect(
      resolver.createMyahCheckoutSession(workspace, 'expired'),
    ).rejects.toThrow('This code is not valid.');
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ percent_off: 100, duration: 'forever' }, 0],
    [{ percent_off: 50, duration: 'once' }, 16450],
    [{ amount_off: 1000, currency: 'usd', duration: 'forever' }, 31900],
  ])(
    'shows the same promotion discount it passes to Stripe: %j',
    async (discount, amountCents) => {
      coupon = { id: 'coupon_promo', valid: true, ...discount };
      stripe.promotionCodes.list.mockResolvedValue({
        data: [
          {
            id: 'promo_test',
            customer: null,
            promotion: { coupon: 'coupon_promo' },
            livemode: false,
            expires_at: null,
            max_redemptions: null,
            restrictions: {
              minimum_amount: null,
              first_time_transaction: false,
            },
          },
        ],
      });
      expect(
        await resolver.myahCheckoutPrice(workspace, 'admin', undefined, 'code'),
      ).toMatchObject({ amountCents });
      await resolver.createMyahCheckoutSession(workspace, 'code');
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discounts: [{ promotion_code: 'promo_test' }],
        }),
      );
    },
  );

  it('rejects first-time-only codes after a PaymentIntent, even without a paid subscription', async () => {
    stripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          id: 'promo_test',
          promotion: { coupon: 'coupon_early' },
          livemode: false,
          expires_at: null,
          max_redemptions: null,
          restrictions: { minimum_amount: null, first_time_transaction: true },
        },
      ],
    });
    stripe.paymentIntents.list.mockResolvedValue({
      data: [{ status: 'requires_payment_method' }],
    });
    await expect(
      resolver.myahCheckoutPrice(workspace, 'admin', undefined, 'first'),
    ).rejects.toThrow('This code is not valid.');
  });

  it('opens Portal only for the subscription customer bound to this workspace', async () => {
    await access.saveSubscription(workspace.id, {
      stripeStatus: 'active',
      stripeSubscriptionId: 'sub_workspace',
    });
    expect(await resolver.createMyahCustomerPortalSession(workspace)).toBe(
      'https://billing.stripe.com/test',
    );
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_workspace',
      return_url: 'https://brand.example.com/settings/billing',
    });
    stripe.subscriptions.retrieve.mockResolvedValue({
      customer: 'cus_other',
      livemode: false,
    });
    await expect(
      resolver.createMyahCustomerPortalSession(workspace),
    ).rejects.toThrow('Stripe customer mismatch');
  });
});
