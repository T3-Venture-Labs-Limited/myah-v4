import { Injectable, Logger } from '@nestjs/common';

import Stripe from 'stripe';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { UnipileInstagramSubscriptionLapseJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-subscription-lapse.job';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';
import { MyahWorkspaceAccessService } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { lockMyahSubscription } from 'src/engine/core-modules/myah-subscription/utils/lock-myah-subscription.util';

@Injectable()
export class MyahSubscriptionSyncService {
  private readonly logger = new Logger(MyahSubscriptionSyncService.name);
  private client?: Stripe;

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: MyahWorkspaceAccessService,
    private readonly config: TwentyConfigService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly queue: MessageQueueService,
  ) {}

  stripe() {
    if (!this.client) {
      const key = this.config.get('BILLING_STRIPE_API_KEY');

      if (!key) throw new Error('Stripe is not configured');
      this.client = new Stripe(key);
    }

    return this.client;
  }

  async syncCustomer(customerId: string) {
    const priceId = this.config.get('MYAH_STRIPE_PRICE_ID');

    if (!priceId) throw new Error('Myah Stripe price is not configured');

    const customer = await this.stripe().customers.retrieve(customerId);

    if (customer.deleted || !isUUID(customer.metadata.workspace_id)) {
      this.logger.warn('Ignoring Myah subscription for an unknown workspace');

      return null;
    }

    const workspaceId = customer.metadata.workspace_id;
    const synced = await this.dataSource.transaction(async (manager) => {
      // Serialize webhook, Checkout return and reconciliation before reading Stripe.
      await lockMyahSubscription(manager, workspaceId);
      const workspaces = await manager.query(
        `SELECT w.id FROM core.workspace w
         JOIN core."myahWorkspaceInstallation" i ON i."workspaceId" = w.id
         WHERE w.id = $1 AND i."stripeCustomerId" = $2`,
        [workspaceId, customerId],
      );

      if (!workspaces.length) {
        this.logger.warn('Ignoring Myah subscription for an unknown workspace');

        return null;
      }

      const subscriptions = [];
      for await (const subscription of this.stripe().subscriptions.list({
        customer: customerId,
        price: priceId,
        status: 'all',
        limit: 100,
      })) {
        subscriptions.push(subscription);
      }

      const live = subscriptions
        .filter((subscription) =>
          ['active', 'trialing', 'past_due'].includes(subscription.status),
        )
        .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
      const selected =
        live[0] ??
        subscriptions.sort(
          (a, b) => b.created - a.created || b.id.localeCompare(a.id),
        )[0];

      if (!selected) return null;

      for (const duplicate of live.slice(1)) {
        await this.stripe().subscriptions.cancel(duplicate.id, {
          prorate: false,
          invoice_now: false,
        });
        this.logger.error(
          `Duplicate Myah subscription ${duplicate.id} cancelled for workspace ${workspaceId}; review payment for a refund`,
        );
      }

      const current = await this.stripe().subscriptions.retrieve(selected.id);
      const item = current.items.data.find(
        (item) => item.price.id === this.config.get('MYAH_STRIPE_PRICE_ID'),
      );

      if (
        !item ||
        (typeof current.customer === 'string'
          ? current.customer
          : current.customer.id) !== customerId
      ) {
        throw new Error('Myah subscription ownership or price mismatch');
      }

      const invoiceId =
        typeof current.latest_invoice === 'string'
          ? current.latest_invoice
          : current.latest_invoice?.id;
      const invoice = invoiceId
        ? await this.stripe().invoices.retrieve(invoiceId)
        : null;
      const paid =
        invoice?.status === 'paid' &&
        invoice.parent?.subscription_details?.subscription === current.id &&
        invoice.lines.data.some(
          (line) =>
            line.parent?.subscription_item_details?.subscription_item ===
              item.id &&
            line.period.start === item.current_period_start &&
            line.period.end === item.current_period_end &&
            !line.parent.subscription_item_details.proration,
        );
      const repository = manager.getRepository(MyahWorkspaceSubscriptionEntity);
      const previous = await repository.findOneBy({ workspaceId });
      const periodStart = new Date(item.current_period_start * 1000);
      // Never move a paid usage period backwards after a delayed event.
      const advancesPeriod =
        paid &&
        (!previous?.usagePeriodStart ||
          periodStart >= previous.usagePeriodStart);

      await repository.save({
        ...previous,
        workspaceId,
        stripeSubscriptionId: current.id,
        stripeStatus: current.status,
        cancelAtPeriodEnd: current.cancel_at_period_end,
        currentPeriodEnd: new Date(item.current_period_end * 1000),
        hadPaidSubscription: previous?.hadPaidSubscription || paid,
        ...(advancesPeriod
          ? {
              usagePeriodStart: periodStart,
              usagePeriodEnd: new Date(item.current_period_end * 1000),
            }
          : {}),
      });

      return {
        workspaceId,
        lapsed:
          Boolean(previous?.hadPaidSubscription || paid) &&
          !['active', 'trialing', 'past_due'].includes(current.status),
      };
    });

    if (!synced) return null;
    await this.access.invalidate(synced.workspaceId);
    if (
      synced.lapsed &&
      this.config.get('MYAH_SUBSCRIPTION_REQUIRED') &&
      !this.config
        .get('MYAH_COMPLIMENTARY_WORKSPACE_IDS')
        .includes(synced.workspaceId)
    ) {
      // Enqueue after commit; repeated sync repairs a failed enqueue as well.
      await this.queue.add(
        UnipileInstagramSubscriptionLapseJob.name,
        { workspaceId: synced.workspaceId },
        { retryLimit: 5 },
      );
    }
    return synced.workspaceId;
  }

  async cancelForWorkspaceDeletion(workspaceId: string): Promise<void> {
    const cancelled = await this.dataSource.transaction(async (manager) => {
      // Use the installation customer and serialize against subscription sync.
      await lockMyahSubscription(manager, workspaceId);
      const [installation] = await manager.query(
        `SELECT i."stripeCustomerId", s."stripeSubscriptionId" FROM core.workspace w
         JOIN core."myahWorkspaceSubscription" s ON s."workspaceId"=w.id
         LEFT JOIN core."myahWorkspaceInstallation" i ON i."workspaceId"=w.id
         WHERE w.id=$1`,
        [workspaceId],
      );
      if (!installation) return false;
      if (!installation.stripeCustomerId) {
        if (installation.stripeSubscriptionId)
          throw new Error(
            'Cannot cancel Myah subscription without its installation customer',
          );
        return false;
      }
      const stripe = this.stripe();
      const customer = await stripe.customers.retrieve(
        installation.stripeCustomerId,
      );
      if (customer.deleted || customer.metadata.workspace_id !== workspaceId)
        throw new Error('Myah subscription customer ownership mismatch');
      const price = this.config.get('MYAH_STRIPE_PRICE_ID');
      if (!price) throw new Error('Myah Stripe price is not configured');
      for await (const session of stripe.checkout.sessions.list({
        customer: customer.id,
        status: 'open',
        limit: 100,
      })) {
        if (session.metadata?.myah_subscription === 'true')
          await stripe.checkout.sessions.expire(session.id);
      }
      for await (const subscription of stripe.subscriptions.list({
        customer: customer.id,
        price,
        status: 'all',
        limit: 100,
      })) {
        if (!['canceled', 'incomplete_expired'].includes(subscription.status))
          await stripe.subscriptions.cancel(subscription.id, {
            prorate: false,
            invoice_now: false,
          });
      }
      await manager.getRepository(MyahWorkspaceSubscriptionEntity).update(
        { workspaceId },
        {
          stripeStatus: 'canceled',
          cancelAtPeriodEnd: false,
        },
      );
      return true;
    });
    if (cancelled) await this.access.invalidate(workspaceId);
  }

  // Runs even while the paywall is off, so a rollback keeps local billing state
  // current. Workspaces that never opened Checkout have no row and cost nothing.
  async reconcile() {
    const installations = await this.dataSource.query<
      { stripeCustomerId: string }[]
    >(
      `SELECT i."stripeCustomerId" FROM core."myahWorkspaceInstallation" i
       JOIN core."myahWorkspaceSubscription" s ON s."workspaceId" = i."workspaceId"
       WHERE i."stripeCustomerId" IS NOT NULL`,
    );

    let failures = 0;
    for (const installation of installations) {
      try {
        await this.syncCustomer(installation.stripeCustomerId);
      } catch (error) {
        // One bad customer must not stop the safety net for every other workspace.
        failures += 1;
        this.logger.error(
          `Myah subscription reconciliation failed for Stripe customer ${installation.stripeCustomerId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    if (failures)
      throw new Error(
        `Myah subscription reconciliation failed for ${failures} of ${installations.length} customers`,
      );
  }

  async handleEvent(event: Stripe.Event) {
    if (
      ![
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
      ].includes(event.type)
    )
      return;

    // Only the customer ID is used from the event. All billing state is re-read.
    const object = event.data.object as
      | Stripe.Subscription
      | Stripe.Invoice
      | Stripe.Checkout.Session;
    const customerId =
      typeof object.customer === 'string'
        ? object.customer
        : object.customer?.id;

    if (customerId) await this.syncCustomer(customerId);
  }
}
