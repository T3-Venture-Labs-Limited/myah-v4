import { Logger } from '@nestjs/common';
import { DataSource, type QueryRunner, type DataSourceOptions } from 'typeorm';
import { typeORMCoreModuleOptions } from 'src/database/typeorm/core/core.datasource';
import { type Stripe } from 'stripe';

import { MyahSubscriptionSyncService } from 'src/engine/core-modules/myah-subscription/myah-subscription-sync.service';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';

// Stripe is stubbed; every database write is inside the rolled-back fixture.
describe('Myah Stripe sync (PostgreSQL)', () => {
  const dataSource = new DataSource(
    typeORMCoreModuleOptions as DataSourceOptions,
  );
  let runner: QueryRunner;

  beforeAll(async () => {
    await dataSource.initialize();
  });
  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });
  let workspaceId: string;
  let service: MyahSubscriptionSyncService;
  let subscriptions: Stripe.Subscription[];
  let invoice: Stripe.Invoice;
  const invalidate = jest.fn();
  const queue = { add: jest.fn() };
  let required: boolean;
  let complimentary: boolean;
  const start = 1_790_000_000;
  const end = start + 30 * 86400;
  const customerId = 'cus_myah_sync_test';
  let stripe: {
    customers: { retrieve: jest.Mock };
    subscriptions: { list: jest.Mock; retrieve: jest.Mock; cancel: jest.Mock };
    invoices: { retrieve: jest.Mock };
  };

  const makeSubscription = (
    id = 'sub_original',
    created = 1,
  ): Stripe.Subscription =>
    ({
      id,
      created,
      customer: customerId,
      status: 'active',
      cancel_at_period_end: false,
      latest_invoice: 'in_latest',
      items: {
        data: [
          {
            id: 'si_myah',
            price: { id: 'price_myah' },
            current_period_start: start,
            current_period_end: end,
          },
        ],
      },
    }) as Stripe.Subscription;

  const makeInvoice = (periodStart = start, periodEnd = end): Stripe.Invoice =>
    ({
      id: 'in_latest',
      status: 'paid',
      parent: { subscription_details: { subscription: 'sub_original' } },
      lines: {
        data: [
          {
            period: { start: periodStart, end: periodEnd },
            parent: {
              subscription_item_details: {
                subscription_item: 'si_myah',
                proration: false,
              },
            },
          },
        ],
      },
    }) as Stripe.Invoice;

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const [installation] = await runner.query(
      'SELECT "workspaceId" FROM core."myahWorkspaceInstallation" LIMIT 1',
    );
    workspaceId = installation.workspaceId;
    await runner.query(
      'UPDATE core."myahWorkspaceInstallation" SET "stripeCustomerId"=$2 WHERE "workspaceId"=$1',
      [workspaceId, customerId],
    );
    await runner.query(
      'DELETE FROM core."myahWorkspaceSubscription" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    invalidate.mockClear();
    queue.add.mockReset();
    required = true;
    complimentary = false;
    subscriptions = [makeSubscription()];
    invoice = makeInvoice();
    stripe = {
      customers: {
        retrieve: jest.fn(async () => ({
          id: customerId,
          metadata: { workspace_id: workspaceId },
        })),
      },
      subscriptions: {
        list: jest.fn(() =>
          (async function* () {
            for (const subscription of subscriptions) yield subscription;
          })(),
        ),
        retrieve: jest.fn(async (id) =>
          subscriptions.find((subscription) => subscription.id === id),
        ),
        cancel: jest.fn(async (id) => {
          subscriptions.find((subscription) => subscription.id === id)!.status =
            'canceled';
        }),
      },
      invoices: { retrieve: jest.fn(async () => invoice) },
    };
    service = new MyahSubscriptionSyncService(
      {
        transaction: async (
          run: (manager: QueryRunner['manager']) => Promise<unknown>,
        ) => run(runner.manager),
      } as unknown as DataSource,
      { invalidate } as never,
      {
        get: (key: string) =>
          ({
            MYAH_STRIPE_PRICE_ID: 'price_myah',
            MYAH_SUBSCRIPTION_REQUIRED: required,
            MYAH_COMPLIMENTARY_WORKSPACE_IDS: complimentary
              ? [workspaceId]
              : [],
          })[key],
      } as never,
      queue as never,
    );
    jest.spyOn(service, 'stripe').mockReturnValue(stripe as unknown as Stripe);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  const row = () =>
    runner.manager
      .getRepository(MyahWorkspaceSubscriptionEntity)
      .findOneByOrFail({ workspaceId });

  it('keeps reconciling other workspaces after one fails (even with the paywall off), then reports the failure', async () => {
    const reconciler = new MyahSubscriptionSyncService(
      {
        query: jest.fn(async () => [
          { stripeCustomerId: 'cus_bad' },
          { stripeCustomerId: 'cus_good' },
        ]),
      } as unknown as DataSource,
      { invalidate } as never,
      { get: () => undefined } as never,
      queue as never,
    );
    const sync = jest
      .spyOn(reconciler, 'syncCustomer')
      .mockRejectedValueOnce(new Error('ownership mismatch'))
      .mockResolvedValueOnce(workspaceId);
    jest
      .spyOn(reconciler['logger'], 'error')
      .mockImplementation(() => undefined);
    await expect(reconciler.reconcile()).rejects.toThrow(
      'failed for 1 of 2 customers',
    );
    expect(sync).toHaveBeenNthCalledWith(1, 'cus_bad');
    expect(sync).toHaveBeenNthCalledWith(2, 'cus_good');
  });

  it('takes the shared advisory lock rather than locking the workspace row', async () => {
    const query = jest.spyOn(runner.manager, 'query');
    await service.syncCustomer(customerId);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('pg_advisory_xact_lock');
    expect(statements.join('\n')).not.toContain('FOR UPDATE');
  });

  it('queues lapse cleanup after persisting access and repairs a failed enqueue on replay', async () => {
    await service.syncCustomer(customerId);
    expect(queue.add).not.toHaveBeenCalled();
    subscriptions[0].status = 'canceled';
    queue.add.mockRejectedValueOnce(new Error('Queue unavailable'));
    await expect(service.syncCustomer(customerId)).rejects.toThrow(
      'Queue unavailable',
    );
    expect((await row()).stripeStatus).toBe('canceled');
    await service.syncCustomer(customerId);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenLastCalledWith(
      'UnipileInstagramSubscriptionLapseJob',
      { workspaceId },
      { retryLimit: 5 },
    );
  });

  it.each(['dark', 'complimentary', 'retrying'])(
    'does not queue lapse cleanup for %s access',
    async (state) => {
      await service.syncCustomer(customerId);
      required = state !== 'dark';
      complimentary = state === 'complimentary';
      subscriptions[0].status = state === 'retrying' ? 'past_due' : 'canceled';
      await service.syncCustomer(customerId);
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('records first paid period, including a zero-dollar paid invoice, idempotently', async () => {
    await service.syncCustomer(customerId);
    await service.syncCustomer(customerId);
    expect(await row()).toMatchObject({
      stripeStatus: 'active',
      hadPaidSubscription: true,
      usagePeriodStart: new Date(start * 1000),
      usagePeriodEnd: new Date(end * 1000),
    });
    expect(
      await runner.query(
        'SELECT count(*)::int AS count FROM core."myahWorkspaceSubscription" WHERE "workspaceId"=$1',
        [workspaceId],
      ),
    ).toEqual([{ count: 1 }]);
    expect(invalidate).toHaveBeenCalledWith(workspaceId);
  });

  it('keeps usage while renewal fails, then advances on recovered payment', async () => {
    await service.syncCustomer(customerId);
    const nextEnd = end + 30 * 86400;
    subscriptions[0].items.data[0].current_period_start = end;
    subscriptions[0].items.data[0].current_period_end = nextEnd;
    subscriptions[0].status = 'past_due';
    invoice = makeInvoice(end, nextEnd);
    invoice.status = 'open';
    await service.syncCustomer(customerId);
    expect(await row()).toMatchObject({
      stripeStatus: 'past_due',
      usagePeriodStart: new Date(start * 1000),
    });
    subscriptions[0].status = 'active';
    invoice.status = 'paid';
    await service.syncCustomer(customerId);
    expect(await row()).toMatchObject({
      stripeStatus: 'active',
      usagePeriodStart: new Date(end * 1000),
      usagePeriodEnd: new Date(nextEnd * 1000),
    });
  });

  it('does not charge usage for Instagram when a paid period starts or renews', async () => {
    await runner.query(
      `INSERT INTO core."unipileInstagramAccountBinding"
       ("workspaceId", "workspaceInstagramAccountRecordId", "unipileAccountId", "instagramUserId", status)
       SELECT $1, gen_random_uuid(), gen_random_uuid()::text, gen_random_uuid()::text, 'ACTIVE'
       WHERE NOT EXISTS (SELECT 1 FROM core."unipileInstagramAccountBinding" WHERE "workspaceId"=$1 AND "deactivatedAt" IS NULL)`,
      [workspaceId],
    );
    const usageRows = () =>
      runner.query(
        'SELECT id FROM core."myahUsageEntry" WHERE "workspaceId"=$1 ORDER BY id',
        [workspaceId],
      );
    const before = await usageRows();
    await service.syncCustomer(customerId);
    const nextEnd = end + 30 * 86400;
    subscriptions[0].items.data[0].current_period_start = end;
    subscriptions[0].items.data[0].current_period_end = nextEnd;
    invoice = makeInvoice(end, nextEnd);
    await service.syncCustomer(customerId);
    await service.syncCustomer(customerId);
    expect((await row()).usagePeriodStart).toEqual(new Date(end * 1000));
    expect(await usageRows()).toEqual(before);
  });

  it('does not unlock a new period just because an older invoice is paid', async () => {
    await service.syncCustomer(customerId);
    subscriptions[0].items.data[0].current_period_start = end;
    subscriptions[0].items.data[0].current_period_end = end + 30 * 86400;
    await service.syncCustomer(customerId);
    expect((await row()).usagePeriodStart).toEqual(new Date(start * 1000));
  });

  it('records cancellation at period end and eventually ended status without deleting history', async () => {
    await service.syncCustomer(customerId);
    subscriptions[0].cancel_at_period_end = true;
    await service.syncCustomer(customerId);
    expect(await row()).toMatchObject({
      cancelAtPeriodEnd: true,
      stripeStatus: 'active',
    });
    subscriptions[0].status = 'canceled';
    await service.syncCustomer(customerId);
    expect(await row()).toMatchObject({
      stripeStatus: 'canceled',
      hadPaidSubscription: true,
    });
  });

  it('cancels the newer duplicate and logs a manual-refund alert', async () => {
    subscriptions.unshift(makeSubscription('sub_newer', 2));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    await service.syncCustomer(customerId);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_newer', {
      prorate: false,
      invoice_now: false,
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('review payment for a refund'),
    );
    expect((await row()).stripeSubscriptionId).toBe('sub_original');
  });

  it('ignores stale status from an out-of-order event and re-fetches current state', async () => {
    await service.handleEvent({
      type: 'customer.subscription.deleted',
      data: { object: { customer: customerId, status: 'canceled' } },
    } as Stripe.Event);
    expect((await row()).stripeStatus).toBe('active');
  });

  it('does not mark an incomplete subscription as paid', async () => {
    subscriptions[0].status = 'incomplete_expired';
    invoice.status = 'open';
    await service.syncCustomer(customerId);
    expect(await row()).toMatchObject({
      hadPaidSubscription: false,
      usagePeriodStart: null,
      usagePeriodEnd: null,
    });
  });

  it('ignores an unknown workspace or a customer not bound to the installation', async () => {
    await runner.query(
      'UPDATE core."myahWorkspaceInstallation" SET "stripeCustomerId"=NULL WHERE "workspaceId"=$1',
      [workspaceId],
    );
    expect(await service.syncCustomer(customerId)).toBeNull();
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });
});
