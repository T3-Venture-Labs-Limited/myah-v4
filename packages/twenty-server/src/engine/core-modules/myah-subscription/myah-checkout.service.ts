import { BadRequestException, Injectable } from '@nestjs/common';
import { AppPath, SettingsPath } from 'twenty-shared/types';
import { type Stripe } from 'stripe';

import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { ManagedProviderStripeService } from 'src/engine/core-modules/managed-provider-billing/stripe/managed-provider-stripe.service';
import { MyahSubscriptionSyncService } from 'src/engine/core-modules/myah-subscription/myah-subscription-sync.service';
import {
  MyahWorkspaceAccess,
  MyahWorkspaceAccessService,
} from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

// GraphQL subCode the Subscribe screen uses to tell a changed price apart from
// other Checkout failures.
export const MYAH_PRICE_CHANGED = 'MYAH_PRICE_CHANGED';

@Injectable()
export class MyahCheckoutService {
  constructor(
    private readonly sync: MyahSubscriptionSyncService,
    private readonly access: MyahWorkspaceAccessService,
    private readonly customers: ManagedProviderStripeService,
    private readonly config: TwentyConfigService,
    private readonly domains: WorkspaceDomainsService,
  ) {}

  // Local state can trail Stripe when a webhook is late (e.g. the admin paid and
  // closed the tab). Re-read Stripe first so nobody is offered Checkout again or
  // quoted the early-access price after a previous paid subscription.
  private async refreshFromStripe(workspaceId: string) {
    const customerId =
      await this.customers.findPersistedCustomerId(workspaceId);
    if (customerId) await this.sync.syncCustomer(customerId);
  }

  async quoteCheckout(workspaceId: string, code?: string) {
    await this.refreshFromStripe(workspaceId);
    return this.resolveCheckoutDiscount(workspaceId, code);
  }

  async resolveCheckoutDiscount(workspaceId: string, code?: string) {
    const stripe = this.sync.stripe();
    const priceId = this.config.get('MYAH_STRIPE_PRICE_ID');
    if (!priceId)
      throw new BadRequestException('Myah subscription is not configured.');
    const price = await stripe.prices.retrieve(priceId);
    if (
      !price.active ||
      price.currency !== 'usd' ||
      price.unit_amount !== 32900 ||
      price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1
    ) {
      throw new Error('Myah requires its configured monthly USD price.');
    }
    const subscription = await this.access.getSubscription(workspaceId);
    let discount: Stripe.Checkout.SessionCreateParams.Discount | undefined;
    let amount = price.unit_amount;
    let earlyAccess = false;

    if (code?.trim()) {
      const customerId = await this.customers.ensureWorkspaceCustomer(
        workspaceId,
        price.livemode ? 'PRODUCTION' : 'SANDBOX',
      );
      const promotions = await stripe.promotionCodes.list({
        code: code.trim(),
        active: true,
        limit: 100,
      });
      const promotion = promotions.data.find(
        (candidate) =>
          !candidate.customer ||
          (typeof candidate.customer === 'string'
            ? candidate.customer
            : candidate.customer.id) === customerId,
      );
      const couponId = promotion?.promotion.coupon;
      const coupon =
        typeof couponId === 'string'
          ? await stripe.coupons.retrieve(couponId, {
              expand: ['currency_options'],
            })
          : couponId;
      const productId =
        typeof price.product === 'string' ? price.product : price.product.id;
      const amountOff =
        coupon?.currency === price.currency
          ? coupon.amount_off
          : coupon?.currency_options?.[price.currency]?.amount_off;
      const minimum =
        promotion?.restrictions.currency_options?.[price.currency]
          ?.minimum_amount ?? promotion?.restrictions.minimum_amount;
      if (
        !promotion ||
        !coupon?.valid ||
        (coupon.percent_off == null && amountOff == null) ||
        promotion.livemode !== price.livemode ||
        (promotion.expires_at && promotion.expires_at <= Date.now() / 1000) ||
        (promotion.max_redemptions !== null &&
          promotion.times_redeemed >= promotion.max_redemptions) ||
        (coupon.applies_to &&
          !coupon.applies_to.products.includes(productId)) ||
        (minimum != null &&
          (minimum > price.unit_amount ||
            (!promotion.restrictions.currency_options?.[price.currency] &&
              promotion.restrictions.minimum_amount_currency !==
                price.currency))) ||
        (promotion.restrictions.first_time_transaction &&
          subscription?.hadPaidSubscription)
      ) {
        throw new BadRequestException('This code is not valid.');
      }
      if (promotion.restrictions.first_time_transaction) {
        const payments = await stripe.paymentIntents.list({
          customer: customerId,
          limit: 1,
        });
        if (payments.data.length)
          throw new BadRequestException('This code is not valid.');
        for await (const prior of stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 100,
        })) {
          if (prior.trial_start != null)
            throw new BadRequestException('This code is not valid.');
        }
      }
      discount = { promotion_code: promotion.id };
      amount = Math.max(
        0,
        coupon.percent_off != null
          ? Math.round(price.unit_amount * (1 - coupon.percent_off / 100))
          : price.unit_amount - (amountOff ?? 0),
      );
    } else if (!subscription?.hadPaidSubscription) {
      const couponId = this.config.get('MYAH_STRIPE_EARLY_ACCESS_COUPON_ID');
      if (couponId) {
        const coupon = await stripe.coupons.retrieve(couponId);
        const productId =
          typeof price.product === 'string' ? price.product : price.product.id;
        if (
          coupon.valid &&
          coupon.amount_off === 23000 &&
          coupon.currency === 'usd' &&
          coupon.duration === 'forever' &&
          (coupon.max_redemptions === null ||
            coupon.times_redeemed < coupon.max_redemptions) &&
          (!coupon.applies_to || coupon.applies_to.products.includes(productId))
        ) {
          discount = { coupon: coupon.id };
          amount = 9900;
          earlyAccess = true;
        }
      }
    }
    return {
      amountCents: amount,
      regularAmountCents: 32900,
      earlyAccess,
      discount,
      price,
    };
  }

  async createCheckout(
    workspace: WorkspaceEntity,
    code?: string,
    expectedAmountCents?: number,
  ) {
    await this.refreshFromStripe(workspace.id);
    const state = await this.access.getAccess(workspace.id);
    if (
      ![
        MyahWorkspaceAccess.NEEDS_SUBSCRIPTION,
        MyahWorkspaceAccess.LAPSED,
      ].includes(state)
    ) {
      throw new BadRequestException('This workspace already has access.');
    }
    const quote = await this.resolveCheckoutDiscount(workspace.id, code);
    if (
      expectedAmountCents != null &&
      expectedAmountCents !== quote.amountCents
    ) {
      throw new UserInputError(
        'The price has changed. Please review the updated price.',
        { subCode: MYAH_PRICE_CHANGED },
      );
    }
    const stripe = this.sync.stripe();
    const customerId = await this.customers.ensureWorkspaceCustomer(
      workspace.id,
      quote.price.livemode ? 'PRODUCTION' : 'SANDBOX',
    );
    for await (const session of stripe.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 100,
    })) {
      // Never expire another product's Checkout on the shared customer.
      if (session.metadata?.myah_subscription === 'true')
        await stripe.checkout.sessions.expire(session.id);
    }
    await this.access.saveSubscription(workspace.id, {});
    const urls = this.domains.getWorkspaceUrls(workspace);
    const base = urls.customUrl ?? urls.subdomainUrl;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: quote.price.id, quantity: 1 }],
      ...(quote.discount ? { discounts: [quote.discount] } : {}),
      // A 100%-off code makes the plan free; do not ask for a card that will
      // never be charged. Paid plans always collect a card.
      ...(quote.amountCents === 0
        ? { payment_method_collection: 'if_required' as const }
        : {}),
      metadata: { workspace_id: workspace.id, myah_subscription: 'true' },
      subscription_data: { metadata: { workspace_id: workspace.id } },
      success_url:
        new URL(AppPath.PlanRequiredSuccess, base).toString() +
        '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: new URL(AppPath.PlanRequired, base).toString(),
    });
    if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
    return session.url;
  }

  async syncCheckout(workspaceId: string, sessionId: string) {
    const stripe = this.sync.stripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (
      session.metadata?.workspace_id !== workspaceId ||
      session.metadata?.myah_subscription !== 'true' ||
      session.mode !== 'subscription'
    ) {
      throw new BadRequestException(
        'This Checkout does not belong to this workspace.',
      );
    }
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
    if (
      !customerId ||
      (await this.sync.syncCustomer(customerId)) !== workspaceId
    ) {
      throw new BadRequestException(
        'This Checkout does not belong to this workspace.',
      );
    }
    return this.access.getAccess(workspaceId);
  }

  async getBillingDetails(workspaceId: string) {
    if (
      (await this.access.getAccess(workspaceId)) ===
      MyahWorkspaceAccess.COMPLIMENTARY
    ) {
      return {
        amountCents: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      };
    }
    const saved = await this.access.getSubscription(workspaceId);
    if (!saved?.stripeSubscriptionId)
      throw new BadRequestException('No subscription was found.');
    const expectedCustomer =
      await this.customers.persistedCustomerId(workspaceId);
    const stripe = this.sync.stripe();
    const subscription = await stripe.subscriptions.retrieve(
      saved.stripeSubscriptionId,
      { expand: ['latest_invoice'] },
    );
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;
    if (
      customerId !== expectedCustomer ||
      subscription.metadata.workspace_id !== workspaceId
    ) {
      throw new Error('Stripe subscription ownership mismatch.');
    }
    const item = subscription.items.data.find(
      (candidate) =>
        candidate.price.id === this.config.get('MYAH_STRIPE_PRICE_ID'),
    );
    const invoice = subscription.latest_invoice;
    if (!item || !invoice || typeof invoice === 'string')
      throw new Error('Subscription billing details are unavailable.');
    const isPlanLine = (line: Stripe.InvoiceLineItem) =>
      line.parent?.subscription_item_details?.subscription_item === item.id &&
      !line.parent.subscription_item_details.proration &&
      line.pricing?.price_details?.price === item.price.id;
    let line = invoice.lines.data.find(isPlanLine);
    if (!line && invoice.lines.has_more) {
      for await (const candidate of stripe.invoices.listLineItems(invoice.id, {
        limit: 100,
      })) {
        if (isPlanLine(candidate)) {
          line = candidate;
          break;
        }
      }
    }
    if (!line || line.currency !== 'usd')
      throw new Error('Subscription billing details are unavailable.');
    // The billed plan line includes its actual discount, unlike a fresh Checkout
    // quote. Amount paid would incorrectly display $0 during payment retries.
    const amountCents =
      line.subtotal -
      (line.discount_amounts ?? []).reduce(
        (sum, discount) => sum + discount.amount,
        0,
      );
    if (!Number.isSafeInteger(amountCents) || amountCents < 0)
      throw new Error('Invalid subscription price.');
    return {
      amountCents,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(item.current_period_end * 1000),
    };
  }

  async createPortal(workspace: WorkspaceEntity) {
    const stripe = this.sync.stripe();
    const subscription = await this.access.getSubscription(workspace.id);
    if (!subscription?.stripeSubscriptionId)
      throw new BadRequestException('No subscription was found.');
    const current = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    const customer =
      typeof current.customer === 'string'
        ? current.customer
        : current.customer.id;
    // Re-use the installation proof, not a caller-supplied customer ID.
    const expected = await this.customers.ensureWorkspaceCustomer(
      workspace.id,
      current.livemode ? 'PRODUCTION' : 'SANDBOX',
    );
    if (customer !== expected) throw new Error('Stripe customer mismatch.');
    const urls = this.domains.getWorkspaceUrls(workspace);
    const portal = await stripe.billingPortal.sessions.create({
      customer,
      return_url: new URL(
        `/settings/${SettingsPath.Billing}`,
        urls.customUrl ?? urls.subdomainUrl,
      ).toString(),
    });
    return portal.url;
  }
}
